import { and, asc, eq, gte, inArray, lte, or, type SQL } from 'drizzle-orm'
import type { Db } from '@/db'
import { purchaseLines, purchases, stockUses, type Purchase, type PurchaseLine, type StockUse } from '@/db/schema'
import { allocate } from '@/lib/money'

export type AllocatedLine = PurchaseLine & {
  // Line amount plus its share of the receipt's tax and shipping.
  allocatedCents: number
  purchase: Purchase
  // Stock lines come out in pieces: one per use (with useId and usedOn set,
  // and jobId, or categoryId when the shop used it) and what's still on the
  // shelf (stock true). The others come out whole.
  useId: number | null
  usedOn: string | null
  useNote: string | null
  // For a use: the invoice line it's billed on.
  jobLineId: number | null
  // Unique across pieces (id is the purchase line's, shared by them).
  key: string
}

// The day a cost counts: the purchase date, or for materials taken from
// stock, the day they went on the job.
export function costDate(l: AllocatedLine) {
  return l.usedOn ?? l.purchase.purchasedOn
}

// Purchase lines with tax and shipping spread in. Allocation needs every line
// of a receipt, so this always loads whole purchases and filters afterwards.
// A from/to range matches each piece's costDate, or with dateBy 'purchase',
// the receipt's date.
export async function allocatedLines(
  db: Db,
  filter: {
    jobIds?: number[]; from?: string; to?: string; purchaseIds?: number[]; stockOrigin?: boolean
    dateBy?: 'cost' | 'purchase'
  } = {},
): Promise<AllocatedLine[]> {
  let ids: number[] | undefined = filter.purchaseIds
  const usePurchases = (where: SQL) => db.select({ id: purchaseLines.purchaseId }).from(stockUses)
    .innerJoin(purchaseLines, eq(purchaseLines.id, stockUses.purchaseLineId)).where(where)
  if (filter.jobIds) {
    if (filter.jobIds.length === 0) return []
    const direct = await db.selectDistinct({ id: purchaseLines.purchaseId }).from(purchaseLines)
      .where(inArray(purchaseLines.jobId, filter.jobIds))
    const used = await usePurchases(inArray(stockUses.jobId, filter.jobIds))
    ids = [...new Set([...direct, ...used].map((r) => r.id))]
  }
  if (filter.stockOrigin) {
    const rows = await db.selectDistinct({ id: purchaseLines.purchaseId }).from(purchaseLines).where(eq(purchaseLines.stock, true))
    const stockIds = rows.map((r) => r.id)
    ids = ids ? ids.filter((id) => stockIds.includes(id)) : stockIds
  }
  const where: SQL[] = []
  if (ids) {
    if (ids.length === 0) return []
    where.push(inArray(purchases.id, ids))
  }
  if (filter.from || filter.to) {
    const range = (col: typeof purchases.purchasedOn | typeof stockUses.usedOn) => and(
      filter.from ? gte(col, filter.from) : undefined,
      filter.to ? lte(col, filter.to) : undefined,
    )!
    where.push(filter.dateBy === 'purchase' ? range(purchases.purchasedOn) : or(
      range(purchases.purchasedOn),
      inArray(purchases.id, usePurchases(range(stockUses.usedOn))),
    )!)
  }

  const ps = await db.select().from(purchases).where(where.length ? and(...where) : undefined)
  if (ps.length === 0) return []
  const lines = await db.select().from(purchaseLines)
    .where(inArray(purchaseLines.purchaseId, ps.map((p) => p.id)))
    .orderBy(asc(purchaseLines.sortOrder), asc(purchaseLines.id))
  const stockIds = lines.filter((l) => l.stock).map((l) => l.id)
  const uses = stockIds.length
    ? await db.select().from(stockUses).where(inArray(stockUses.purchaseLineId, stockIds))
      .orderBy(asc(stockUses.usedOn), asc(stockUses.id))
    : []

  const byPurchase = new Map<number, PurchaseLine[]>()
  for (const l of lines) {
    const list = byPurchase.get(l.purchaseId) ?? []
    list.push(l)
    byPurchase.set(l.purchaseId, list)
  }
  let out: AllocatedLine[] = []
  for (const p of ps) {
    const ls = byPurchase.get(p.id) ?? []
    const alloc = allocate(ls.map((l) => l.amountCents), p.taxCents + p.shippingCents)
    ls.forEach((l, i) => {
      const whole = { ...l, allocatedCents: alloc[i], purchase: p, useId: null, usedOn: null, useNote: null, jobLineId: null, key: `l${l.id}` }
      if (!l.stock) out.push(whole)
      else out.push(...splitStock(whole, uses.filter((u) => u.purchaseLineId === l.id)))
    })
  }
  if (filter.jobIds) out = out.filter((l) => l.jobId != null && filter.jobIds!.includes(l.jobId))
  if (filter.stockOrigin) out = out.filter((l) => l.stock || l.useId != null)
  const day = filter.dateBy === 'purchase' ? (l: AllocatedLine) => l.purchase.purchasedOn : costDate
  if (filter.from) out = out.filter((l) => day(l) >= filter.from!)
  if (filter.to) out = out.filter((l) => day(l) <= filter.to!)
  return out
}

// A stock line as one piece per use plus what's left on the shelf, with the
// cost shared by quantity so the pieces add up to the line exactly.
function splitStock(line: AllocatedLine, uses: StockUse[]): AllocatedLine[] {
  const usedQty = uses.reduce((a, u) => a + u.quantityHundredths, 0)
  const left = Math.max(0, line.quantityHundredths - usedQty)
  const shelf = left > 0 || uses.length === 0
  const qtys = [...uses.map((u) => u.quantityHundredths), ...(shelf ? [left] : [])]
  const total = qtys.reduce((a, q) => a + q, 0)
  const amounts = split(line.amountCents, qtys, total)
  const shares = split(line.allocatedCents, qtys, total)
  const pieces: AllocatedLine[] = uses.map((u, i) => ({
    ...line,
    stock: false,
    jobId: u.jobId,
    categoryId: u.categoryId,
    quantityHundredths: u.quantityHundredths,
    amountCents: amounts[i],
    allocatedCents: shares[i],
    useId: u.id,
    usedOn: u.usedOn,
    useNote: u.note,
    jobLineId: u.jobLineId,
    key: `u${u.id}`,
  }))
  if (shelf) {
    pieces.push({ ...line, quantityHundredths: left, amountCents: amounts.at(-1)!, allocatedCents: shares.at(-1)!, key: `s${line.id}` })
  }
  return pieces
}

// Shares of cents in proportion to qtys, summing to cents exactly.
function split(cents: number, qtys: number[], total: number) {
  if (total === 0) return qtys.map((_, i) => (i === qtys.length - 1 ? cents : 0))
  return allocate(qtys, cents).map((x, i) => x - qtys[i])
}

// Materials on the shelf at the end of a day, at cost: bought by then and
// not yet used.
export function stockOnHandCents(lines: AllocatedLine[], day: string) {
  return lines
    .filter((l) => l.purchase.purchasedOn <= day && (l.stock || (l.usedOn != null && l.usedOn > day)))
    .reduce((a, l) => a + l.allocatedCents, 0)
}

export function purchaseTotal(p: Pick<Purchase, 'taxCents' | 'shippingCents'>, lines: { amountCents: number }[]) {
  return lines.reduce((a, l) => a + l.amountCents, 0) + p.taxCents + p.shippingCents
}
