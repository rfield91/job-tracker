import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm'
import type { Db } from '@/db'
import * as schema from '@/db/schema'
import { dollars, objectsToCsv, toCsv } from '@/lib/csv'
import { formatQuantity } from '@/lib/money'
import { allocatedLines } from './ledger'
import { jobNumber } from './jobs'
import { taxWorksheet } from './reports'
import { METHOD_LABELS } from './payments'

const TABLES = {
  customers: schema.customers,
  vehicles: schema.vehicles,
  jobs: schema.jobs,
  job_lines: schema.jobLines,
  payments: schema.payments,
  payment_requests: schema.paymentRequests,
  purchases: schema.purchases,
  purchase_lines: schema.purchaseLines,
  stock_uses: schema.stockUses,
  products: schema.products,
  product_parts: schema.productParts,
  categories: schema.categories,
  assets: schema.assets,
  trips: schema.trips,
  job_templates: schema.jobTemplates,
  files: schema.files,
  settings: schema.settings,
} as const

// Raw rows of every table, for backups.
export async function dumpTables(db: Db) {
  const out: Record<string, Record<string, unknown>[]> = {}
  for (const [name, table] of Object.entries(TABLES)) {
    out[name] = (await db.select().from(table)) as Record<string, unknown>[]
  }
  return out
}

export async function tablesAsCsv(db: Db) {
  const dump = await dumpTables(db)
  return Object.fromEntries(Object.entries(dump).map(([k, rows]) => [`${k}.csv`, objectsToCsv(rows)]))
}

function safeName(s: string) {
  return s.replace(/[^\w.-]+/g, '_').replace(/_+/g, '_').slice(0, 60)
}

// Receipts named by date and vendor, e.g. receipts/2026-03-04_Summit_Racing_12.jpg
export async function receiptFiles(db: Db, year?: number) {
  const where = year
    ? and(gte(schema.purchases.purchasedOn, `${year}-01-01`), lte(schema.purchases.purchasedOn, `${year}-12-31`))
    : undefined
  const ps = await db.select().from(schema.purchases).where(where)
  if (ps.length === 0) return []
  const fs = await db.select().from(schema.files).where(inArray(schema.files.purchaseId, ps.map((p) => p.id)))
  const byId = new Map(ps.map((p) => [p.id, p]))
  return fs.map((f) => {
    const p = byId.get(f.purchaseId!)!
    const ext = f.filename.match(/\.[a-z0-9]+$/i)?.[0] ?? ''
    return { id: f.id, path: `receipts/${p.purchasedOn}_${safeName(p.vendor)}_${f.id}${ext}` }
  })
}

export async function photoFiles(db: Db) {
  const fs = await db.select().from(schema.files)
  return fs.filter((f) => !f.purchaseId).map((f) => ({ id: f.id, path: `${f.kind}s/${f.id}_${safeName(f.filename)}` }))
}

export async function purchasesCsv(db: Db, year: number) {
  const lines = await allocatedLines(db, { from: `${year}-01-01`, to: `${year}-12-31`, dateBy: 'purchase' })
  const cats = new Map((await db.select().from(schema.categories)).map((c) => [c.id, c]))
  const jobIds = [...new Set(lines.map((l) => l.jobId).filter((x): x is number => x != null))]
  const jobs = new Map(jobIds.length ? (await db.select().from(schema.jobs).where(inArray(schema.jobs.id, jobIds))).map((j) => [j.id, j]) : [])
  lines.sort((a, b) => a.purchase.purchasedOn.localeCompare(b.purchase.purchasedOn) || a.purchaseId - b.purchaseId)
  return toCsv([
    ['Date', 'Vendor', 'Description', 'Part number', 'Qty', 'Amount', 'Amount with tax and shipping', 'Treated as', 'Job', 'Used from stock on', 'Category', 'Schedule C line', 'Paid to', 'Purchase id'],
    ...lines.map((l) => {
      const c = l.categoryId ? cats.get(l.categoryId) : null
      const j = l.jobId ? jobs.get(l.jobId) : null
      return [
        l.purchase.purchasedOn, l.purchase.vendor, l.description, l.partNumber, formatQuantity(l.quantityHundredths),
        dollars(l.amountCents), dollars(l.allocatedCents),
        l.jobId ? 'Cost of goods sold' : l.categoryId ? 'Expense' : l.assetId ? 'Equipment' : l.stock ? 'Stock (inventory)' : 'Unassigned',
        j ? `${jobNumber(j)} ${j.title}` : '', l.usedOn, c?.name ?? '', c ? c.scheduleLine : l.jobId ? 'Part III' : '', l.payee, l.purchaseId,
      ]
    }),
  ])
}

export async function paymentsCsv(db: Db, year: number) {
  const rows = await db.select({ p: schema.payments, j: schema.jobs, c: schema.customers })
    .from(schema.payments)
    .leftJoin(schema.jobs, eq(schema.jobs.id, schema.payments.jobId))
    .leftJoin(schema.customers, eq(schema.customers.id, schema.jobs.customerId))
    .where(and(gte(schema.payments.receivedOn, `${year}-01-01`), lte(schema.payments.receivedOn, `${year}-12-31`)))
    .orderBy(asc(schema.payments.receivedOn))
  return toCsv([
    ['Date', 'Amount', 'Fee', 'Purpose', 'Method', 'Job', 'Customer', 'Payer', 'Note', 'Stripe charge'],
    ...rows.map(({ p, j, c }) => [
      p.receivedOn, dollars(p.amountCents), dollars(p.feeCents), p.purpose, METHOD_LABELS[p.method],
      j ? `${jobNumber(j)} ${j.title}` : 'Unmatched', c?.name, p.payerName, p.note, p.stripeChargeId,
    ]),
  ])
}

export async function taxWorksheetCsv(db: Db, year: number) {
  const w = await taxWorksheet(db, year)
  const rows: (string | number | null)[][] = [
    [`Schedule C worksheet ${year}`, ''],
    ['Line', 'Item', 'Amount'],
    ['1', 'Gross receipts', dollars(w.grossReceiptsCents)],
    ['2', 'Returns and allowances (refunds)', dollars(w.returnsCents)],
    ['35', 'Inventory at beginning of year (stock)', dollars(w.cogs.beginningStockCents)],
    ['36', 'Purchases (parts and materials for jobs)', dollars(w.cogs.purchasesCents)],
    ['37', 'Cost of labor (subcontracted on jobs)', dollars(w.cogs.laborCents)],
    ['41', 'Inventory at end of year (stock)', dollars(w.cogs.endingStockCents)],
    ['42 / 4', 'Cost of goods sold', dollars(w.cogs.totalCents)],
    ['5', 'Gross profit', dollars(w.grossProfitCents)],
  ]
  for (const e of w.expenses) {
    rows.push([e.line, e.label, dollars(e.totalCents)])
    for (const i of e.items) rows.push(['', `  ${i.name}`, dollars(i.totalCents)])
  }
  rows.push(['28', 'Total expenses (before depreciation, line 13)', dollars(w.totalExpensesCents)])
  rows.push(['', 'Net profit before depreciation', dollars(w.netBeforeDepreciationCents)])
  rows.push(['44a', 'Business miles', (w.mileage.milesTenths / 10).toFixed(1)])
  rows.push([], ['Payments by method (compare with 1099-K forms)', '', ''])
  for (const m of w.byMethod) rows.push(['', METHOD_LABELS[m.method], dollars(m.grossCents)])
  rows.push([], ['Equipment placed in service (Form 4562)', '', ''], ['Date', 'Description', 'Cost', 'Business use %', 'Treatment'])
  for (const a of w.assets) rows.push([a.placedInServiceOn, a.description, dollars(a.costCents), a.businessUsePct, a.treatment])
  rows.push([], ['Contract labor by payee (1099-NEC)', '', ''])
  for (const c of w.contractors) rows.push(['', c.payee, dollars(c.totalCents), c.flagged ? 'At or over threshold' : ''])
  return toCsv(rows)
}
