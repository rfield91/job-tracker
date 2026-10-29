import type { Db } from '@/db'
import { dollars, toCsv } from '@/lib/csv'
import { jobNumber, STATUS_LABELS, vehicleLabel } from './jobs'
import { jobsReport } from './reports'

export async function jobsReportCsv(db: Db, year: number) {
  const { rows } = await jobsReport(db, year)
  return toCsv([
    ['Job', 'Opened', 'Completed', 'Customer', 'Car', 'Title', 'Kind', 'Status', 'Billed', 'Costs', 'Fees', 'Profit', 'Paid', 'Balance'],
    ...rows.map((r) => [
      jobNumber(r.job), r.job.openedOn, r.job.completedOn, r.customer.name, vehicleLabel(r.vehicle), r.job.title,
      r.job.kind, STATUS_LABELS[r.job.status], dollars(r.totals.billedCents), dollars(r.totals.costCents),
      dollars(r.totals.feeCents), dollars(r.totals.profitCents), dollars(r.totals.paidCents), dollars(r.totals.balanceCents),
    ]),
  ])
}
