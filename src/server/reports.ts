import { and, count, gte, isNull, lte } from 'drizzle-orm'
import type { Db } from '@/db'
import { assets, categories, payments, trips, type PaymentMethod } from '@/db/schema'
import { estimatedTaxDueDates, monthKey } from '@/lib/dates'
import { lineLabel } from '@/lib/schedule-c'
import { allocatedLines, costDate, stockOnHandCents, type AllocatedLine } from './ledger'
import { listJobs } from './jobs'
import { getSettings } from './settings'

// Everything here is cash basis: income on the date it was received, costs
// on the date they were bought. Materials bought for stock count when they
// go on a job (see costDate).

type Period = { from: string; to: string }

async function periodData(db: Db, p: Period) {
  const lines = await allocatedLines(db, p)
  const pays = await db.select().from(payments)
    .where(and(gte(payments.receivedOn, p.from), lte(payments.receivedOn, p.to)))
  return { lines, pays }
}

function lineKind(l: AllocatedLine) {
  if (l.stock) return 'stock'
  if (l.jobId) return 'cogs'
  if (l.categoryId) return 'expense'
  if (l.assetId) return 'equipment'
  return 'unassigned'
}

export type MonthRow = {
  month: string
  revenueCents: number
  cogsCents: number
  expenseCents: number
  feeCents: number
  equipmentCents: number
  // Bought this month and still on the shelf; not in profit until used.
  stockCents: number
  unassignedCents: number
  profitCents: number
}

function summarize(month: string, lines: AllocatedLine[], pays: { amountCents: number; feeCents: number }[]): MonthRow {
  const row: MonthRow = {
    month, revenueCents: 0, cogsCents: 0, expenseCents: 0, feeCents: 0,
    equipmentCents: 0, stockCents: 0, unassignedCents: 0, profitCents: 0,
  }
  for (const p of pays) {
    row.revenueCents += p.amountCents
    row.feeCents += p.feeCents
  }
  for (const l of lines) {
    const k = lineKind(l)
    if (k === 'cogs') row.cogsCents += l.allocatedCents
    else if (k === 'expense') row.expenseCents += l.allocatedCents
    else if (k === 'equipment') row.equipmentCents += l.allocatedCents
    else if (k === 'stock') row.stockCents += l.allocatedCents
    else row.unassignedCents += l.allocatedCents
  }
  row.profitCents = row.revenueCents - row.cogsCents - row.expenseCents - row.feeCents
  return row
}

export async function monthlyReport(db: Db, year: number) {
  const { lines, pays } = await periodData(db, { from: `${year}-01-01`, to: `${year}-12-31` })
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)
  const rows = months.map((m) => summarize(
    m,
    lines.filter((l) => monthKey(costDate(l)) === m),
    pays.filter((p) => monthKey(p.receivedOn) === m),
  ))
  const total = summarize('total', lines, pays)
  return { rows, total }
}

export async function dashboard(db: Db, today: string) {
  const month = monthKey(today)
  const year = Number(today.slice(0, 4))
  const { lines, pays } = await periodData(db, { from: `${month}-01`, to: `${month}-31` })
  const thisMonth = summarize(month, lines, pays)
  const open = await listJobs(db, { status: 'open' })
  const done = await listJobs(db, { status: 'done' })
  const unpaid = done.filter((j) => j.totals.balanceCents > 0)
  const recentDone = (await listJobs(db, { status: 'paid', limit: 50 }))
    .concat(done.filter((j) => j.totals.balanceCents <= 0))
    .filter((j) => j.job.completedOn && monthKey(j.job.completedOn) === month)
  const [{ n: unmatched }] = await db.select({ n: count() }).from(payments).where(isNull(payments.jobId))
  const homeless = (await allocatedLines(db)).filter((l) => lineKind(l) === 'unassigned')
  return {
    month,
    year,
    thisMonth,
    open,
    unpaid,
    unpaidCents: unpaid.reduce((a, j) => a + j.totals.balanceCents, 0),
    doneThisMonth: recentDone,
    unmatchedPayments: unmatched,
    needsHomeCount: new Set(homeless.map((l) => l.purchaseId)).size,
  }
}

export const METHOD_ORDER: PaymentMethod[] = ['stripe', 'paypal', 'venmo', 'zelle', 'card', 'check', 'cash', 'other']

export async function taxWorksheet(db: Db, year: number) {
  const settings = await getSettings(db)
  const period = { from: `${year}-01-01`, to: `${year}-12-31` }
  const { lines, pays } = await periodData(db, period)
  const cats = await db.select().from(categories)
  const catById = new Map(cats.map((c) => [c.id, c]))
  const feeCategory = cats.find((c) => c.systemKey === 'payment_fees')

  // Part I
  const grossReceiptsCents = pays.filter((p) => p.amountCents > 0).reduce((a, p) => a + p.amountCents, 0)
  const returnsCents = pays.filter((p) => p.amountCents < 0).reduce((a, p) => a - p.amountCents, 0)
  const byMethod = METHOD_ORDER.map((method) => {
    const ps = pays.filter((p) => p.method === method)
    return {
      method,
      count: ps.length,
      grossCents: ps.filter((p) => p.amountCents > 0).reduce((a, p) => a + p.amountCents, 0),
      refundCents: ps.filter((p) => p.amountCents < 0).reduce((a, p) => a - p.amountCents, 0),
      feeCents: ps.reduce((a, p) => a + p.feeCents, 0),
    }
  }).filter((m) => m.count > 0)

  // Part III: cost of goods sold. Parts bought for a job are purchases in
  // the year bought. Stock is a purchase in the year bought too, and what's
  // still on the shelf at each year end is inventory, so it's deducted in the
  // year it's used.
  const sum = (ls: AllocatedLine[]) => ls.reduce((a, l) => a + l.allocatedCents, 0)
  const directJobLines = lines.filter((l) => l.jobId && l.usedOn == null)
  const cogsLaborCents = sum(directJobLines.filter((l) => l.payee))
  const stockLines = await allocatedLines(db, { stockOrigin: true })
  const stockBoughtCents = sum(stockLines.filter((l) => l.purchase.purchasedOn >= period.from && l.purchase.purchasedOn <= period.to))
  const cogsPurchasesCents = sum(directJobLines.filter((l) => !l.payee)) + stockBoughtCents
  const beginningStockCents = stockOnHandCents(stockLines, `${year - 1}-12-31`)
  const endingStockCents = stockOnHandCents(stockLines, period.to)
  const cogsCents = beginningStockCents + cogsPurchasesCents + cogsLaborCents - endingStockCents

  // Part II: expenses by line
  const byLine = new Map<string, { line: string; label: string; totalCents: number; items: { name: string; categoryId: number | null; totalCents: number }[] }>()
  const add = (line: string, name: string, categoryId: number | null, cents: number) => {
    if (!cents) return
    const entry = byLine.get(line) ?? { line, label: lineLabel(line), totalCents: 0, items: [] }
    entry.totalCents += cents
    const item = entry.items.find((i) => i.name === name)
    if (item) item.totalCents += cents
    else entry.items.push({ name, categoryId, totalCents: cents })
    byLine.set(line, entry)
  }
  for (const l of lines) {
    if (!l.categoryId) continue
    const c = catById.get(l.categoryId)!
    add(c.scheduleLine, c.name, c.id, l.allocatedCents)
  }
  const feeCents = pays.reduce((a, p) => a + p.feeCents, 0)
  add(feeCategory?.scheduleLine ?? '27a', feeCategory?.name ?? 'Payment processing fees', feeCategory?.id ?? null, feeCents)

  // Part IV / line 9: standard mileage
  const tripRows = await db.select().from(trips)
    .where(and(gte(trips.tripOn, period.from), lte(trips.tripOn, period.to)))
  const milesTenths = tripRows.reduce((a, t) => a + t.milesTenths, 0)
  const rate = settings.mileageRates[String(year)] ?? null
  const mileageCents = rate == null ? 0 : Math.round((milesTenths / 10) * rate)
  add('9', `Standard mileage (${(milesTenths / 10).toLocaleString()} mi)`, null, mileageCents)

  const expenses = [...byLine.values()].sort((a, b) => lineSort(a.line) - lineSort(b.line))
  const totalExpensesCents = expenses.reduce((a, e) => a + e.totalCents, 0)
  const otherExpenses = byLine.get('27a')?.items ?? []

  // Equipment placed in service this year
  const assetRows = await db.select().from(assets)
    .where(and(gte(assets.placedInServiceOn, period.from), lte(assets.placedInServiceOn, period.to)))

  // Contract labor by payee (1099-NEC check)
  const contractorMap = new Map<string, number>()
  for (const l of lines) {
    if (!l.payee) continue
    contractorMap.set(l.payee, (contractorMap.get(l.payee) ?? 0) + l.allocatedCents)
  }
  const contractors = [...contractorMap.entries()]
    .map(([payee, totalCents]) => ({ payee, totalCents, flagged: totalCents >= settings.contractorThresholdCents }))
    .sort((a, b) => b.totalCents - a.totalCents)

  const unassigned = lines.filter((l) => lineKind(l) === 'unassigned')
  const [{ n: unmatched }] = await db.select({ n: count() }).from(payments)
    .where(and(isNull(payments.jobId), gte(payments.receivedOn, period.from), lte(payments.receivedOn, period.to)))

  const grossIncomeCents = grossReceiptsCents - returnsCents
  const grossProfitCents = grossIncomeCents - cogsCents
  return {
    year,
    settings,
    grossReceiptsCents,
    returnsCents,
    grossIncomeCents,
    byMethod,
    cogs: {
      beginningStockCents,
      purchasesCents: cogsPurchasesCents,
      stockBoughtCents,
      laborCents: cogsLaborCents,
      endingStockCents,
      totalCents: cogsCents,
    },
    grossProfitCents,
    expenses,
    otherExpenses,
    totalExpensesCents,
    netBeforeDepreciationCents: grossProfitCents - totalExpensesCents,
    mileage: { milesTenths, rateCentsPerMile: rate, deductionCents: mileageCents, tripCount: tripRows.length },
    assets: assetRows,
    contractors,
    checks: {
      unassignedCount: new Set(unassigned.map((l) => l.purchaseId)).size,
      unassignedCents: unassigned.reduce((a, l) => a + l.allocatedCents, 0),
      unmatchedPayments: unmatched,
      missingMileageRate: milesTenths > 0 && rate == null,
      undecidedAssets: assetRows.filter((a) => a.treatment === 'undecided').length,
    },
  }
}

export type TaxWorksheet = Awaited<ReturnType<typeof taxWorksheet>>

function lineSort(line: string) {
  const n = parseFloat(line)
  return n * 10 + (line.endsWith('b') ? 1 : 0)
}

// Profit so far by estimated-tax quarter, with a set-aside suggestion.
export async function quarterlyEstimate(db: Db, year: number) {
  const settings = await getSettings(db)
  const { rows } = await monthlyReport(db, year)
  const ranges = [[1, 3], [4, 5], [6, 8], [9, 12]]
  const due = estimatedTaxDueDates(year)
  let cumulative = 0
  return {
    setAsidePct: settings.setAsidePct,
    quarters: ranges.map(([a, b], i) => {
      const profit = rows.slice(a - 1, b).reduce((s, r) => s + r.profitCents, 0)
      cumulative += profit
      return {
        ...due[i],
        profitCents: profit,
        setAsideCents: Math.max(0, Math.round((profit * settings.setAsidePct) / 100)),
        cumulativeCents: cumulative,
      }
    }),
  }
}

export async function jobsReport(db: Db, year: number) {
  const rows = await listJobs(db, { year })
  const totals = rows.reduce((a, r) => ({
    billedCents: a.billedCents + r.totals.billedCents,
    costCents: a.costCents + r.totals.costCents,
    feeCents: a.feeCents + r.totals.feeCents,
    paidCents: a.paidCents + r.totals.paidCents,
    balanceCents: a.balanceCents + r.totals.balanceCents,
    profitCents: a.profitCents + r.totals.profitCents,
  }), { billedCents: 0, costCents: 0, feeCents: 0, paidCents: 0, balanceCents: 0, profitCents: 0 })
  return { rows, totals }
}

