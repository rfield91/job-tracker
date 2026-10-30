import { and, asc, eq, gte, inArray, isNotNull, lte, sql } from 'drizzle-orm'
import type { Db } from '@/db'
import { jobLines, jobs, productParts, products, stockUses, type PaymentMethod, type Product, type ProductPart } from '@/db/schema'
import { formatQuantity } from '@/lib/money'
import { addJobLine, createJob, refreshJobStatus, type CustomerInput } from './jobs'
import { addPayment } from './payments'
import { createPurchase } from './purchases'
import { listStock, takeFifo, type StockGroup } from './stock'

// A product is something sold ready-made (a bracket kit): its price and the
// stock parts that make one. Selling it puts one line on the job and takes the
// parts off the shelf, oldest first, as costs billed on that line.

export type ProductPartInput = { stockKey: string; label: string; quantityHundredths: number }

export type ProductSummary = Product & {
  parts: (ProductPart & { onHandHundredths: number })[]
  // Complete products the shelf can make now, and the part that limits it.
  canBuild: number
  limitedBy: string | null
  // What the parts for the next one cost, oldest receipts first; null when
  // some part isn't on the shelf to price.
  costCents: number | null
  soldThisYear: number
}

function summarize(p: Product, parts: ProductPart[], stock: Map<string, StockGroup>, sold: number): ProductSummary {
  let canBuild = parts.length ? Infinity : 0
  let limitedBy: string | null = null
  let costCents: number | null = 0
  const out = parts.map((pp) => {
    const g = stock.get(pp.stockKey)
    const have = g?.quantityHundredths ?? 0
    const n = Math.floor(have / pp.quantityHundredths)
    if (n < canBuild) {
      canBuild = n
      limitedBy = g?.label ?? pp.label
    }
    if (!g || have < pp.quantityHundredths) costCents = null
    else if (costCents != null) costCents += takeFifo(g.lots, pp.quantityHundredths).reduce((a, x) => a + x.costCents, 0)
    return { ...pp, onHandHundredths: have }
  })
  return { ...p, parts: out, canBuild: Number.isFinite(canBuild) ? canBuild : 0, limitedBy, costCents, soldThisYear: sold }
}

export async function listProducts(db: Db, year: number, opts: { activeOnly?: boolean } = {}): Promise<ProductSummary[]> {
  const rows = await db.select().from(products)
    .where(opts.activeOnly ? eq(products.active, true) : undefined)
    .orderBy(asc(products.name))
  if (rows.length === 0) return []
  const parts = await db.select().from(productParts)
    .where(inArray(productParts.productId, rows.map((r) => r.id)))
    .orderBy(asc(productParts.sortOrder), asc(productParts.id))
  const stock = new Map((await listStock(db)).map((g) => [g.key, g]))
  const sold = await db.select({ productId: jobLines.productId, n: sql<string>`sum(coalesce(${jobLines.quantityHundredths}, 100))` })
    .from(jobLines).innerJoin(jobs, eq(jobs.id, jobLines.jobId))
    .where(and(isNotNull(jobLines.productId), gte(jobs.openedOn, `${year}-01-01`), lte(jobs.openedOn, `${year}-12-31`)))
    .groupBy(jobLines.productId)
  const soldBy = new Map(sold.map((s) => [s.productId!, Number(s.n) / 100]))
  return rows.map((p) => summarize(p, parts.filter((pp) => pp.productId === p.id), stock, soldBy.get(p.id) ?? 0))
}

export async function getProduct(db: Db, id: number, year: number) {
  return (await listProducts(db, year)).find((p) => p.id === id) ?? null
}

export type ProductInput = {
  name: string
  priceCents: number
  notes?: string | null
  active?: boolean
  parts: ProductPartInput[]
}

// Creates the product, or with an id replaces its details and parts list.
export async function saveProduct(db: Db, id: number | null, input: ProductInput) {
  if (!input.name.trim()) throw new Error('Enter a name')
  // The same stock item picked twice is one part.
  const merged = new Map<string, ProductPartInput>()
  for (const p of input.parts) {
    if (p.quantityHundredths <= 0) throw new Error(`Enter how many ${p.label} go into one`)
    const cur = merged.get(p.stockKey)
    merged.set(p.stockKey, cur ? { ...cur, quantityHundredths: cur.quantityHundredths + p.quantityHundredths } : p)
  }
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db
    const values = { name: input.name.trim(), priceCents: input.priceCents, notes: input.notes || null, active: input.active ?? true }
    const [row] = id
      ? await t.update(products).set(values).where(eq(products.id, id)).returning()
      : await t.insert(products).values(values).returning()
    if (!row) throw new Error('Product not found')
    await t.delete(productParts).where(eq(productParts.productId, row.id))
    if (merged.size) {
      await t.insert(productParts).values([...merged.values()].map((p, i) => ({ ...p, productId: row.id, sortOrder: i })))
    }
    return row
  })
}

// Sales already entered keep their lines and costs; they just stop naming it.
export async function deleteProduct(db: Db, id: number) {
  await db.delete(products).where(eq(products.id, id))
}

export async function sellProduct(db: Db, jobId: number, input: {
  productId: number
  quantity: number
  priceCents: number
  usedOn: string
}) {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) throw new Error('Sell at least one')
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db
    const [p] = await t.select().from(products).where(eq(products.id, input.productId))
    if (!p) throw new Error('That product is gone')
    const parts = await t.select().from(productParts).where(eq(productParts.productId, p.id))
    const stock = new Map((await listStock(t)).map((g) => [g.key, g]))
    const short = parts.flatMap((pp) => {
      const need = pp.quantityHundredths * input.quantity
      const have = stock.get(pp.stockKey)?.quantityHundredths ?? 0
      return have < need ? [`${stock.get(pp.stockKey)?.label ?? pp.label} (need ${formatQuantity(need)}, have ${formatQuantity(have)})`] : []
    })
    if (short.length) throw new Error(`Not enough in stock: ${short.join(', ')}. Add the purchase to stock first.`)
    const line = await addJobLine(t, jobId, {
      type: 'part',
      description: p.name,
      amountCents: input.priceCents,
      quantityHundredths: input.quantity * 100,
    })
    await t.update(jobLines).set({ productId: p.id }).where(eq(jobLines.id, line.id))
    const uses = parts.flatMap((pp) => takeFifo(stock.get(pp.stockKey)!.lots, pp.quantityHundredths * input.quantity))
    if (uses.length) {
      await t.insert(stockUses).values(uses.map((u) => ({
        purchaseLineId: u.lot.lineId,
        jobId,
        quantityHundredths: u.quantityHundredths,
        usedOn: input.usedOn,
        jobLineId: line.id,
      })))
    }
    await refreshJobStatus(t, jobId)
    return line
  })
}

export type QuickSaleInput = {
  soldOn: string
  customerId?: number | null
  customer?: CustomerInput | null
  productId: number
  quantity: number
  priceCents: number
  // The label, as a purchase on the sale.
  shipping?: { carrier: string; costCents: number; method?: string | null } | null
  payment?: { amountCents: number; method: PaymentMethod; feeCents?: number; note?: string | null } | null
  notes?: string | null
}

// A product sold on its own: a done job of kind sale with the product line,
// the shipping label as its cost, and the payment, all dated the sale day.
export async function quickSale(db: Db, input: QuickSaleInput) {
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db
    const [p] = await t.select().from(products).where(eq(products.id, input.productId))
    if (!p) throw new Error('Pick a product')
    const job = await createJob(t, {
      customerId: input.customerId,
      customer: input.customer,
      title: input.quantity > 1 ? `${input.quantity} × ${p.name}` : p.name,
      kind: 'sale',
      status: 'done',
      openedOn: input.soldOn,
      notes: input.notes,
    })
    await t.update(jobs).set({ completedOn: input.soldOn }).where(eq(jobs.id, job.id))
    await sellProduct(t, job.id, { productId: p.id, quantity: input.quantity, priceCents: input.priceCents, usedOn: input.soldOn })
    if (input.shipping && input.shipping.costCents > 0) {
      await createPurchase(t, {
        purchasedOn: input.soldOn,
        vendor: input.shipping.carrier.trim() || 'Shipping',
        method: input.shipping.method || null,
        lines: [{ description: 'Shipping label', amountCents: input.shipping.costCents, target: { kind: 'job', jobId: job.id } }],
      })
    }
    if (input.payment && input.payment.amountCents > 0) {
      await addPayment(t, { jobId: job.id, receivedOn: input.soldOn, purpose: 'final', ...input.payment })
    }
    return job
  })
}
