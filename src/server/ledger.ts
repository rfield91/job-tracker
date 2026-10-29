import { and, asc, gte, inArray, lte, type SQL } from 'drizzle-orm'
import type { Db } from '@/db'
import { purchaseLines, purchases, type Purchase, type PurchaseLine } from '@/db/schema'
import { allocate } from '@/lib/money'

export type AllocatedLine = PurchaseLine & {
  // Line amount plus its share of the receipt's tax and shipping.
  allocatedCents: number
  purchase: Purchase
}

// Purchase lines with tax and shipping spread in. Allocation needs every line
// of a receipt, so this always loads whole purchases and filters afterwards.
export async function allocatedLines(
  db: Db,
  filter: { jobIds?: number[]; from?: string; to?: string; purchaseIds?: number[] } = {},
): Promise<AllocatedLine[]> {
  let ids: number[] | undefined = filter.purchaseIds
  if (filter.jobIds) {
    if (filter.jobIds.length === 0) return []
    const rows = await db.selectDistinct({ id: purchaseLines.purchaseId }).from(purchaseLines)
      .where(inArray(purchaseLines.jobId, filter.jobIds))
    ids = rows.map((r) => r.id)
  }
  const where: SQL[] = []
  if (ids) {
    if (ids.length === 0) return []
    where.push(inArray(purchases.id, ids))
  }
  if (filter.from) where.push(gte(purchases.purchasedOn, filter.from))
  if (filter.to) where.push(lte(purchases.purchasedOn, filter.to))

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
  const out: AllocatedLine[] = []
  for (const p of ps) {
    const ls = byPurchase.get(p.id) ?? []
    const alloc = allocate(ls.map((l) => l.amountCents), p.taxCents + p.shippingCents)
    ls.forEach((l, i) => out.push({ ...l, allocatedCents: alloc[i], purchase: p }))
  }
  return filter.jobIds ? out.filter((l) => l.jobId != null && filter.jobIds!.includes(l.jobId)) : out
}

export function purchaseTotal(p: Pick<Purchase, 'taxCents' | 'shippingCents'>, lines: { amountCents: number }[]) {
  return lines.reduce((a, l) => a + l.amountCents, 0) + p.taxCents + p.shippingCents
}
