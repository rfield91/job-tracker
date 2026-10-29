import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, max, or, type SQL } from 'drizzle-orm'
import type { Db } from '@/db'
import {
  assets, categories, customers, files, jobLines, jobs, purchaseLines, purchases, stockUses,
  type Category, type PurchaseLine,
} from '@/db/schema'
import { allocate, formatQuantity } from '@/lib/money'
import { deleteObjectsFor } from './files'
import { refreshJobStatus } from './jobs'

export type LineTarget =
  | { kind: 'job'; jobId: number; bill?: { amountCents: number; description: string } | null }
  | { kind: 'category'; categoryId: number }
  | { kind: 'asset'; businessUsePct: number; description?: string | null }
  | { kind: 'stock' }
  | { kind: 'none' }

export type PurchaseLineInput = {
  id?: number | null
  description?: string | null
  partNumber?: string | null
  // Defaults to 1 (100).
  quantityHundredths?: number
  amountCents: number
  target: LineTarget
  payee?: string | null
}

export type PurchaseInput = {
  purchasedOn: string
  vendor: string
  method?: string | null
  taxCents?: number
  shippingCents?: number
  notes?: string | null
  lines: PurchaseLineInput[]
}

function validate(input: PurchaseInput) {
  if (!input.vendor.trim()) throw new Error('Enter a vendor')
  if (input.lines.length === 0) throw new Error('Add at least one line')
  for (const l of input.lines) {
    if (l.quantityHundredths != null && l.quantityHundredths <= 0) throw new Error('Quantity must be more than 0')
    if (l.target.kind === 'asset' && (l.target.businessUsePct < 1 || l.target.businessUsePct > 100)) {
      throw new Error('Business use must be between 1 and 100%')
    }
  }
}

export async function createPurchase(db: Db, input: PurchaseInput) {
  validate(input)
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db
    const [p] = await t.insert(purchases).values({
      purchasedOn: input.purchasedOn,
      vendor: input.vendor.trim(),
      method: input.method || null,
      taxCents: input.taxCents ?? 0,
      shippingCents: input.shippingCents ?? 0,
      notes: input.notes || null,
    }).returning()
    await writeLines(t, p.id, input, [])
    return p
  })
}

export async function updatePurchase(db: Db, id: number, input: PurchaseInput) {
  validate(input)
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db
    const [p] = await t.update(purchases).set({
      purchasedOn: input.purchasedOn,
      vendor: input.vendor.trim(),
      method: input.method || null,
      taxCents: input.taxCents ?? 0,
      shippingCents: input.shippingCents ?? 0,
      notes: input.notes || null,
    }).where(eq(purchases.id, id)).returning()
    if (!p) throw new Error('Purchase not found')
    const existing = await t.select().from(purchaseLines).where(eq(purchaseLines.purchaseId, id))
    await writeLines(t, id, input, existing)
    return p
  })
}

// Inserts, updates and removes lines; keeps equipment rows and billed job
// lines in step with them.
async function writeLines(db: Db, purchaseId: number, input: PurchaseInput, existing: PurchaseLine[]) {
  const alloc = allocate(input.lines.map((l) => l.amountCents), (input.taxCents ?? 0) + (input.shippingCents ?? 0))
  const kept = new Set<number>()
  const touchedJobs = new Set<number>()
  for (const j of existing) if (j.jobId) touchedJobs.add(j.jobId)
  const used = await usedByLine(db, existing.map((e) => e.id))

  // Stock already put on jobs has to stay stock, and stay at least that many.
  for (const e of existing) {
    const u = used.get(e.id)
    if (!u) continue
    const l = input.lines.find((x) => x.id === e.id)
    const name = e.description || 'a stock line'
    const what = `${formatQuantity(u)} of ${name}`
    if (!l) throw new Error(`${what} has been used. Put it back in stock before removing the line.`)
    if (l.target.kind !== 'stock') throw new Error(`${what} has been used, so it has to stay Stock.`)
    if ((l.quantityHundredths ?? 100) < u) throw new Error(`${what} has been used; the quantity can’t be less.`)
  }

  for (const [i, l] of input.lines.entries()) {
    const prev = l.id ? existing.find((e) => e.id === l.id) : undefined
    let assetId: number | null = null
    if (l.target.kind === 'asset') {
      const values = {
        description: l.target.description?.trim() || l.description?.trim() || input.vendor,
        placedInServiceOn: input.purchasedOn,
        costCents: alloc[i],
        businessUsePct: l.target.businessUsePct,
      }
      if (prev?.assetId) {
        await db.update(assets).set(values).where(eq(assets.id, prev.assetId))
        assetId = prev.assetId
      } else {
        assetId = (await db.insert(assets).values(values).returning())[0].id
      }
    }
    if (prev?.assetId && prev.assetId !== assetId) await db.delete(assets).where(eq(assets.id, prev.assetId))

    const values = {
      purchaseId,
      description: l.description?.trim() || null,
      partNumber: l.partNumber?.trim() || null,
      quantityHundredths: l.quantityHundredths ?? 100,
      amountCents: l.amountCents,
      jobId: l.target.kind === 'job' ? l.target.jobId : null,
      categoryId: l.target.kind === 'category' ? l.target.categoryId : null,
      assetId,
      stock: l.target.kind === 'stock',
      payee: l.payee?.trim() || null,
      sortOrder: i,
    }
    let lineId: number
    if (prev) {
      await db.update(purchaseLines).set(values).where(eq(purchaseLines.id, prev.id))
      lineId = prev.id
      kept.add(prev.id)
      // A line moved off its job shouldn't stay billed there.
      if (prev.jobId && prev.jobId !== values.jobId) {
        await db.delete(jobLines).where(eq(jobLines.purchaseLineId, prev.id))
      }
    } else {
      lineId = (await db.insert(purchaseLines).values(values).returning())[0].id
    }
    if (l.target.kind === 'job') {
      touchedJobs.add(l.target.jobId)
      // Billing is offered for new lines; existing ones are billed from the job.
      if (l.target.bill && !prev) {
        const [{ m }] = await db.select({ m: max(jobLines.sortOrder) }).from(jobLines)
          .where(eq(jobLines.jobId, l.target.jobId))
        await db.insert(jobLines).values({
          jobId: l.target.jobId,
          type: 'part',
          description: l.target.bill.description || l.description || input.vendor,
          amountCents: l.target.bill.amountCents,
          purchaseLineId: lineId,
          sortOrder: (m ?? -1) + 1,
        })
      }
    }
  }
  for (const e of existing) {
    if (kept.has(e.id)) continue
    if (e.assetId) await db.delete(assets).where(eq(assets.id, e.assetId))
    await db.delete(purchaseLines).where(eq(purchaseLines.id, e.id))
  }
  for (const jobId of touchedJobs) await refreshJobStatus(db, jobId)
}

// Quantity of each stock line that's gone on jobs.
async function usedByLine(db: Db, lineIds: number[]) {
  const out = new Map<number, number>()
  if (lineIds.length === 0) return out
  for (const u of await db.select().from(stockUses).where(inArray(stockUses.purchaseLineId, lineIds))) {
    out.set(u.purchaseLineId, (out.get(u.purchaseLineId) ?? 0) + u.quantityHundredths)
  }
  return out
}

export async function deletePurchase(db: Db, id: number) {
  const lines = await db.select().from(purchaseLines).where(eq(purchaseLines.purchaseId, id))
  const uses = lines.length ? await db.select().from(stockUses).where(inArray(stockUses.purchaseLineId, lines.map((l) => l.id))) : []
  await deleteObjectsFor(db, { purchaseId: id })
  await db.transaction(async (tx) => {
    const t = tx as unknown as Db
    const assetIds = lines.map((l) => l.assetId).filter((x): x is number => x != null)
    if (assetIds.length) await t.delete(assets).where(inArray(assets.id, assetIds))
    await t.delete(purchases).where(eq(purchases.id, id))
  })
  for (const jobId of new Set([...lines.map((l) => l.jobId), ...uses.map((u) => u.jobId)].filter((x): x is number => x != null))) {
    await refreshJobStatus(db, jobId)
  }
}

export async function getPurchase(db: Db, id: number) {
  const [p] = await db.select().from(purchases).where(eq(purchases.id, id))
  if (!p) return null
  const lines = await db.select({ line: purchaseLines, job: jobs, customer: customers, category: categories, asset: assets })
    .from(purchaseLines)
    .leftJoin(jobs, eq(jobs.id, purchaseLines.jobId))
    .leftJoin(customers, eq(customers.id, jobs.customerId))
    .leftJoin(categories, eq(categories.id, purchaseLines.categoryId))
    .leftJoin(assets, eq(assets.id, purchaseLines.assetId))
    .where(eq(purchaseLines.purchaseId, id))
    .orderBy(asc(purchaseLines.sortOrder), asc(purchaseLines.id))
  const billed = lines.length
    ? await db.select().from(jobLines).where(inArray(jobLines.purchaseLineId, lines.map((l) => l.line.id)))
    : []
  const uses = lines.length
    ? await db.select({ use: stockUses, job: jobs, category: categories }).from(stockUses)
      .leftJoin(jobs, eq(jobs.id, stockUses.jobId))
      .leftJoin(categories, eq(categories.id, stockUses.categoryId))
      .where(inArray(stockUses.purchaseLineId, lines.map((l) => l.line.id))).orderBy(asc(stockUses.usedOn), asc(stockUses.id))
    : []
  const attachments = await db.select().from(files).where(eq(files.purchaseId, id)).orderBy(asc(files.id))
  const alloc = allocate(lines.map((l) => l.line.amountCents), p.taxCents + p.shippingCents)
  return {
    purchase: p,
    lines: lines.map((l, i) => ({
      ...l,
      allocatedCents: alloc[i],
      billed: billed.filter((b) => b.purchaseLineId === l.line.id),
      uses: uses.filter((u) => u.use.purchaseLineId === l.line.id),
    })),
    files: attachments,
    totalCents: lines.reduce((a, l) => a + l.line.amountCents, 0) + p.taxCents + p.shippingCents,
  }
}

export type PurchaseDetail = NonNullable<Awaited<ReturnType<typeof getPurchase>>>

export type PurchaseFilter = {
  from?: string
  to?: string
  categoryId?: number
  q?: string
  needsHome?: boolean
  limit?: number
}

export async function listPurchases(db: Db, f: PurchaseFilter = {}) {
  const where: SQL[] = []
  if (f.from) where.push(gte(purchases.purchasedOn, f.from))
  if (f.to) where.push(lte(purchases.purchasedOn, f.to))
  if (f.q?.trim()) {
    const like = `%${f.q.trim()}%`
    where.push(or(ilike(purchases.vendor, like), ilike(purchases.notes, like),
      inArray(purchases.id, db.select({ id: purchaseLines.purchaseId }).from(purchaseLines)
        .where(or(ilike(purchaseLines.description, like), ilike(purchaseLines.partNumber, like)))))!)
  }
  if (f.categoryId) {
    where.push(inArray(purchases.id, db.select({ id: purchaseLines.purchaseId }).from(purchaseLines)
      .where(eq(purchaseLines.categoryId, f.categoryId))))
  }
  if (f.needsHome) {
    where.push(inArray(purchases.id, db.select({ id: purchaseLines.purchaseId }).from(purchaseLines)
      .where(and(isNull(purchaseLines.jobId), isNull(purchaseLines.categoryId), isNull(purchaseLines.assetId), eq(purchaseLines.stock, false)))))
  }
  const ps = await db.select().from(purchases).where(where.length ? and(...where) : undefined)
    .orderBy(desc(purchases.purchasedOn), desc(purchases.id)).limit(f.limit ?? 500)
  if (ps.length === 0) return []
  const ids = ps.map((p) => p.id)
  const lines = await db.select({ line: purchaseLines, job: jobs, category: categories })
    .from(purchaseLines)
    .leftJoin(jobs, eq(jobs.id, purchaseLines.jobId))
    .leftJoin(categories, eq(categories.id, purchaseLines.categoryId))
    .where(inArray(purchaseLines.purchaseId, ids))
    .orderBy(asc(purchaseLines.sortOrder))
  const fileRows = await db.select({ purchaseId: files.purchaseId }).from(files).where(inArray(files.purchaseId, ids))
  return ps.map((p) => {
    const ls = lines.filter((l) => l.line.purchaseId === p.id)
    return {
      purchase: p,
      lines: ls,
      totalCents: ls.reduce((a, l) => a + l.line.amountCents, 0) + p.taxCents + p.shippingCents,
      fileCount: fileRows.filter((r) => r.purchaseId === p.id).length,
      needsHome: ls.some((l) => !l.line.jobId && !l.line.categoryId && !l.line.assetId && !l.line.stock),
    }
  })
}

export type PurchaseListRow = Awaited<ReturnType<typeof listPurchases>>[number]

// Vendors used before, most recent first, with the category last used for
// each, so a new purchase from a known vendor needs one less tap.
export async function vendorSuggestions(db: Db) {
  const rows = await db.select({ vendor: purchases.vendor, categoryId: purchaseLines.categoryId, on: purchases.purchasedOn })
    .from(purchases)
    .leftJoin(purchaseLines, eq(purchaseLines.purchaseId, purchases.id))
    .orderBy(desc(purchases.purchasedOn), desc(purchases.id))
    .limit(1000)
  const seen = new Map<string, { vendor: string; categoryId: number | null }>()
  for (const r of rows) {
    const key = r.vendor.toLowerCase()
    const cur = seen.get(key)
    if (!cur) seen.set(key, { vendor: r.vendor, categoryId: r.categoryId })
    else if (cur.categoryId == null && r.categoryId != null) cur.categoryId = r.categoryId
  }
  return [...seen.values()]
}

export async function listCategories(db: Db, opts: { activeOnly?: boolean } = {}): Promise<Category[]> {
  return db.select().from(categories)
    .where(opts.activeOnly ? eq(categories.active, true) : undefined)
    .orderBy(asc(categories.sortOrder), asc(categories.name))
}
