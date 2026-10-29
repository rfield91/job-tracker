import { and, asc, gte, inArray, isNotNull, lte, or, type SQL } from 'drizzle-orm'
import type { Db } from '@/db'
import { purchaseLines, purchases, type Purchase, type PurchaseLine } from '@/db/schema'
import { allocate } from '@/lib/money'

export type AllocatedLine = PurchaseLine & {
  // Line amount plus its share of the receipt's tax and shipping.
  allocatedCents: number
  purchase: Purchase
}

// The day a cost counts: the purchase date, or for materials taken from
// stock, the day they went on the job.
export function costDate(l: AllocatedLine) {
  return l.usedOn ?? l.purchase.purchasedOn
}

// Purchase lines with tax and shipping spread in. Allocation needs every line
// of a receipt, so this always loads whole purchases and filters afterwards.
// A from/to range matches each line's costDate, or with dateBy 'purchase',
// the receipt's date.
export async function allocatedLines(
  db: Db,
  filter: {
    jobIds?: number[]; from?: string; to?: string; purchaseIds?: number[]; stockOrigin?: boolean
    dateBy?: 'cost' | 'purchase'
  } = {},
): Promise<AllocatedLine[]> {
  let ids: number[] | undefined = filter.purchaseIds
  if (filter.jobIds) {
    if (filter.jobIds.length === 0) return []
    const rows = await db.selectDistinct({ id: purchaseLines.purchaseId }).from(purchaseLines)
      .where(inArray(purchaseLines.jobId, filter.jobIds))
    ids = rows.map((r) => r.id)
  }
  if (filter.stockOrigin) {
    const rows = await db.selectDistinct({ id: purchaseLines.purchaseId }).from(purchaseLines)
      .where(or(purchaseLines.stock, isNotNull(purchaseLines.usedOn)))
    const stockIds = rows.map((r) => r.id)
    ids = ids ? ids.filter((id) => stockIds.includes(id)) : stockIds
  }
  const where: SQL[] = []
  if (ids) {
    if (ids.length === 0) return []
    where.push(inArray(purchases.id, ids))
  }
  if (filter.from || filter.to) {
    const range = (col: typeof purchases.purchasedOn | typeof purchaseLines.usedOn) => and(
      filter.from ? gte(col, filter.from) : undefined,
      filter.to ? lte(col, filter.to) : undefined,
    )
    where.push(filter.dateBy === 'purchase' ? range(purchases.purchasedOn)! : or(
      range(purchases.purchasedOn),
      inArray(purchases.id, db.select({ id: purchaseLines.purchaseId }).from(purchaseLines).where(range(purchaseLines.usedOn))),
    )!)
  }

  const ps = await db.select().from(purchases).where(where.length ? and(...where) : undefined)
  if (ps.length === 0) return []
  const lines = await db.select().from(purchaseLines)
    .where(inArray(purchaseLines.purchaseId, ps.map((p) => p.id)))
    .orderBy(asc(purchaseLines.sortOrder), asc(purchaseLines.id))

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
    ls.forEach((l, i) => out.push({ ...l, allocatedCents: alloc[i], purchase: p }))
  }
  if (filter.jobIds) out = out.filter((l) => l.jobId != null && filter.jobIds!.includes(l.jobId))
  if (filter.stockOrigin) out = out.filter((l) => l.stock || l.usedOn != null)
  const day = filter.dateBy === 'purchase' ? (l: AllocatedLine) => l.purchase.purchasedOn : costDate
  if (filter.from) out = out.filter((l) => day(l) >= filter.from!)
  if (filter.to) out = out.filter((l) => day(l) <= filter.to!)
  return out
}

// Materials on the shelf at the end of a day, at cost: bought by then and
// not yet used on a job.
export function stockOnHandCents(lines: AllocatedLine[], day: string) {
  return lines
    .filter((l) => l.purchase.purchasedOn <= day && (l.stock || (l.usedOn != null && l.usedOn > day)))
    .reduce((a, l) => a + l.allocatedCents, 0)
}

export function purchaseTotal(p: Pick<Purchase, 'taxCents' | 'shippingCents'>, lines: { amountCents: number }[]) {
  return lines.reduce((a, l) => a + l.amountCents, 0) + p.taxCents + p.shippingCents
}
