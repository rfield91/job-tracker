import { and, eq, isNull } from 'drizzle-orm'
import type { Db } from '@/db'
import { jobLines, purchaseLines } from '@/db/schema'
import { formatQuantity } from '@/lib/money'
import { allocatedLines } from './ledger'
import { addJobLine, refreshJobStatus } from './jobs'

// Materials bought ahead (tubing, bends, flanges) sit on purchase lines marked
// stock. Using some on a job splits the line, so the receipt, its shipping
// share and the purchase date stay with the cost.

export async function listStock(db: Db) {
  const lines = await allocatedLines(db, { stockOrigin: true })
  return lines
    .filter((l) => l.stock)
    .sort((a, b) => (a.description ?? a.purchase.vendor).localeCompare(b.description ?? b.purchase.vendor)
      || b.purchase.purchasedOn.localeCompare(a.purchase.purchasedOn))
}

export type StockItem = Awaited<ReturnType<typeof listStock>>[number]

export async function takeFromStock(db: Db, lineId: number, input: {
  jobId: number
  quantityHundredths: number
  usedOn: string
  // Adds a part line to the invoice when set.
  bill?: { amountCents: number; description: string } | null
}) {
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db
    const [l] = await t.select().from(purchaseLines).where(eq(purchaseLines.id, lineId))
    if (!l?.stock) throw new Error('That isn’t in stock any more')
    const qty = input.quantityHundredths
    if (qty <= 0) throw new Error('Quantity must be more than 0')
    if (qty > l.quantityHundredths) throw new Error(`Only ${formatQuantity(l.quantityHundredths)} in stock`)

    let usedId = l.id
    if (qty === l.quantityHundredths) {
      await t.update(purchaseLines).set({ stock: false, jobId: input.jobId, usedOn: input.usedOn })
        .where(eq(purchaseLines.id, l.id))
    } else {
      const amountCents = Math.round((l.amountCents * qty) / l.quantityHundredths)
      await t.update(purchaseLines).set({
        quantityHundredths: l.quantityHundredths - qty,
        amountCents: l.amountCents - amountCents,
      }).where(eq(purchaseLines.id, l.id))
      const [used] = await t.insert(purchaseLines).values({
        purchaseId: l.purchaseId,
        description: l.description,
        partNumber: l.partNumber,
        quantityHundredths: qty,
        amountCents,
        jobId: input.jobId,
        usedOn: input.usedOn,
        sortOrder: l.sortOrder,
      }).returning()
      usedId = used.id
    }
    if (input.bill) {
      await addJobLine(t, input.jobId, {
        type: 'part',
        description: input.bill.description || l.description || 'Part',
        amountCents: input.bill.amountCents,
        purchaseLineId: usedId,
      })
    } else {
      await refreshJobStatus(t, input.jobId)
    }
    return usedId
  })
}

// Undoes takeFromStock: takes the cost (and any invoice line for it) off the job
// and puts it back on the shelf, merged into what's left of the same item.
export async function returnToStock(db: Db, lineId: number) {
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db
    const [l] = await t.select().from(purchaseLines).where(eq(purchaseLines.id, lineId))
    if (!l?.usedOn) throw new Error('That cost didn’t come from stock')
    await t.delete(jobLines).where(eq(jobLines.purchaseLineId, l.id))
    const [rest] = await t.select().from(purchaseLines).where(and(
      eq(purchaseLines.purchaseId, l.purchaseId),
      eq(purchaseLines.stock, true),
      l.description == null ? isNull(purchaseLines.description) : eq(purchaseLines.description, l.description),
      l.partNumber == null ? isNull(purchaseLines.partNumber) : eq(purchaseLines.partNumber, l.partNumber),
    ))
    if (rest) {
      await t.update(purchaseLines).set({
        quantityHundredths: rest.quantityHundredths + l.quantityHundredths,
        amountCents: rest.amountCents + l.amountCents,
      }).where(eq(purchaseLines.id, rest.id))
      await t.delete(purchaseLines).where(eq(purchaseLines.id, l.id))
    } else {
      await t.update(purchaseLines).set({ stock: true, jobId: null, usedOn: null }).where(eq(purchaseLines.id, l.id))
    }
    if (l.jobId) await refreshJobStatus(t, l.jobId)
  })
}

export function toStockOption(s: StockItem) {
  return {
    id: s.id,
    label: s.description || s.purchase.vendor,
    partNumber: s.partNumber,
    quantityHundredths: s.quantityHundredths,
    allocatedCents: s.allocatedCents,
    vendor: s.purchase.vendor,
  }
}
