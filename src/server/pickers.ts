import type { Db } from '@/db'
import { jobNumber, listJobs, vehicleLabel } from './jobs'
import { listCategories, vendorSuggestions } from './purchases'
import { getSettings } from './settings'

export type JobOption = { id: number; label: string; sub: string; open: boolean }

// Jobs to offer when assigning a purchase or payment: open ones first, then
// the most recent others.
export async function jobOptions(db: Db, limit = 80): Promise<JobOption[]> {
  const rows = await listJobs(db, { limit: 400 })
  const open = rows.filter((r) => r.job.status === 'quote' || r.job.status === 'in_progress' || r.totals.balanceCents > 0)
  const rest = rows.filter((r) => !open.includes(r))
  return [...open, ...rest].slice(0, limit).map((r) => ({
    id: r.job.id,
    label: `${jobNumber(r.job)} ${r.job.title}`,
    sub: [r.customer.name, vehicleLabel(r.vehicle)].filter(Boolean).join(' · '),
    open: open.includes(r),
  }))
}

export async function purchaseFormData(db: Db) {
  const s = await getSettings(db)
  const cats = await listCategories(db, { activeOnly: true })
  return {
    jobs: await jobOptions(db),
    categories: cats.filter((c) => c.systemKey !== 'payment_fees').map((c) => ({ id: c.id, name: c.name, line: c.scheduleLine })),
    vendors: await vendorSuggestions(db),
    markupPct: s.partsMarkupPct,
    assetThresholdCents: s.assetThresholdCents,
  }
}

export type PurchaseFormData = Awaited<ReturnType<typeof purchaseFormData>>
