import { and, desc, eq, gte, inArray, isNotNull, lte } from 'drizzle-orm'
import type { Db } from '@/db'
import { categories, jobLines, purchaseLines, purchases, stockUses } from '@/db/schema'
import { formatQuantity } from '@/lib/money'
import { allocatedLines } from './ledger'
import { addJobLine, refreshJobStatus } from './jobs'

// Materials bought ahead (tubing, bends, flanges) sit on purchase lines marked
// stock. Using some on a job records a stock use; the purchase line stays as
// entered, and the ledger shares its cost (with tax and shipping) by quantity.
// The same part bought on different receipts is one item here, taken oldest
// first. The shop can use stock itself too (the demo car, prototypes): that
// comes off the shelf as an expense in a category instead of a job cost.

export type StockLot = {
  lineId: number
  purchaseId: number
  vendor: string
  purchasedOn: string
  quantityHundredths: number
  // Cost of what's left on this line, with its share of tax and shipping.
  allocatedCents: number
}

export type StockGroup = {
  key: string
  label: string
  partNumber: string | null
  quantityHundredths: number
  allocatedCents: number
  lots: StockLot[]
}

// Same part number, or with none, the same description.
export function stockKey(l: { partNumber: string | null; description: string | null }, vendor: string) {
  const pn = l.partNumber?.trim()
  return pn ? `p:${pn.toUpperCase()}` : `d:${(l.description || vendor).trim().toLowerCase()}`
}

export async function listStock(db: Db): Promise<StockGroup[]> {
  const pieces = (await allocatedLines(db, { stockOrigin: true }))
    .filter((l) => l.stock && l.quantityHundredths > 0)
    .sort((a, b) => a.purchase.purchasedOn.localeCompare(b.purchase.purchasedOn) || a.id - b.id)
  const groups = new Map<string, StockGroup>()
  for (const l of pieces) {
    const key = stockKey(l, l.purchase.vendor)
    const g = groups.get(key) ?? {
      key, label: '', partNumber: l.partNumber?.trim() || null, quantityHundredths: 0, allocatedCents: 0, lots: [],
    }
    // Newest receipt names the item.
    g.label = l.description || l.purchase.vendor
    g.quantityHundredths += l.quantityHundredths
    g.allocatedCents += l.allocatedCents
    g.lots.push({
      lineId: l.id,
      purchaseId: l.purchaseId,
      vendor: l.purchase.vendor,
      purchasedOn: l.purchase.purchasedOn,
      quantityHundredths: l.quantityHundredths,
      allocatedCents: l.allocatedCents,
    })
    groups.set(key, g)
  }
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label))
}

// Oldest lots first: how much comes off each, and what it costs.
export function takeFifo(lots: StockLot[], quantityHundredths: number) {
  let need = quantityHundredths
  const out: { lot: StockLot; quantityHundredths: number; costCents: number }[] = []
  for (const lot of lots) {
    if (need <= 0) break
    const q = Math.min(need, lot.quantityHundredths)
    out.push({ lot, quantityHundredths: q, costCents: Math.round((lot.allocatedCents * q) / lot.quantityHundredths) })
    need -= q
  }
  return out
}

export async function takeFromStock(db: Db, key: string, input: {
  jobId: number
  quantityHundredths: number
  usedOn: string
  // Adds a part line to the invoice when set.
  bill?: { amountCents: number; description: string } | null
}) {
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db
    const { group, pieces } = await take(t, key, input.quantityHundredths)
    const uses = await t.insert(stockUses).values(pieces.map((p) => ({
      purchaseLineId: p.lot.lineId,
      jobId: input.jobId,
      quantityHundredths: p.quantityHundredths,
      usedOn: input.usedOn,
    }))).returning()
    if (input.bill) {
      const line = await addJobLine(t, input.jobId, {
        type: 'part',
        description: input.bill.description || group.label,
        partNumber: group.partNumber,
        amountCents: input.bill.amountCents,
      })
      await t.update(stockUses).set({ jobLineId: line.id }).where(inArray(stockUses.id, uses.map((u) => u.id)))
    } else {
      await refreshJobStatus(t, input.jobId)
    }
    return uses
  })
}

async function take(db: Db, key: string, qty: number) {
  const group = (await listStock(db)).find((g) => g.key === key)
  if (!group) throw new Error('That isn’t in stock any more')
  if (qty <= 0) throw new Error('Quantity must be more than 0')
  if (qty > group.quantityHundredths) throw new Error(`Only ${formatQuantity(group.quantityHundredths)} in stock`)
  return { group, pieces: takeFifo(group.lots, qty) }
}

// The shop's own use: an expense in the category on the day used.
export async function useForShop(db: Db, key: string, input: {
  categoryId: number
  quantityHundredths: number
  usedOn: string
  note: string | null
}) {
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db
    const { pieces } = await take(t, key, input.quantityHundredths)
    return t.insert(stockUses).values(pieces.map((p) => ({
      purchaseLineId: p.lot.lineId,
      categoryId: input.categoryId,
      note: input.note,
      quantityHundredths: p.quantityHundredths,
      usedOn: input.usedOn,
    }))).returning()
  })
}

// What the shop used itself in a year, newest first.
export async function listShopUses(db: Db, year: number) {
  return db.select({ use: stockUses, line: purchaseLines, purchase: purchases, category: categories })
    .from(stockUses)
    .innerJoin(purchaseLines, eq(purchaseLines.id, stockUses.purchaseLineId))
    .innerJoin(purchases, eq(purchases.id, purchaseLines.purchaseId))
    .innerJoin(categories, eq(categories.id, stockUses.categoryId))
    .where(and(isNotNull(stockUses.categoryId), gte(stockUses.usedOn, `${year}-01-01`), lte(stockUses.usedOn, `${year}-12-31`)))
    .orderBy(desc(stockUses.usedOn), desc(stockUses.id))
}

// Undoes takeFromStock or useForShop: one use (a cost not on the invoice), or everything
// billed on an invoice line along with the line.
export async function returnToStock(db: Db, target: { useId: number } | { jobLineId: number }) {
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db
    const where = 'useId' in target ? eq(stockUses.id, target.useId) : eq(stockUses.jobLineId, target.jobLineId)
    const removed = await t.delete(stockUses).where(where).returning()
    if (removed.length === 0) throw new Error('That cost didn’t come from stock')
    if ('jobLineId' in target) await t.delete(jobLines).where(eq(jobLines.id, target.jobLineId))
    if (removed[0].jobId != null) await refreshJobStatus(t, removed[0].jobId)
  })
}

// Puts a stock use that's on the job but not the invoice onto the invoice.
export async function billStockUse(db: Db, useId: number, billedCents: number, description: string) {
  const [use] = await db.select().from(stockUses).where(eq(stockUses.id, useId))
  if (!use?.jobId) throw new Error('That stock use is gone')
  const line = await addJobLine(db, use.jobId, { type: 'part', description, amountCents: billedCents })
  await db.update(stockUses).set({ jobLineId: line.id }).where(eq(stockUses.id, useId))
  return line
}
