import Link from 'next/link'
import { Download } from 'lucide-react'
import { StatusBadge } from '@/components/job-bits'
import { Card, cx, Money, PageHeader } from '@/components/ui'
import { formatDate } from '@/lib/dates'
import { authedDb } from '@/server/session'
import { jobNumber, vehicleLabel } from '@/server/jobs'
import { jobsReport } from '@/server/reports'
import { today } from '@/server/settings'
import { YearTabs } from '@/components/year-tabs'

export const metadata = { title: 'Jobs report' }

export default async function JobsReportPage({ searchParams }: PageProps<'/reports/jobs'>) {
  const sp = await searchParams
  const db = await authedDb()
  const thisYear = Number((await today(db)).slice(0, 4))
  const year = typeof sp.year === 'string' ? Number(sp.year) : thisYear
  const kind = typeof sp.kind === 'string' ? sp.kind : ''
  const { rows: all } = await jobsReport(db, year)
  const rows = kind ? all.filter((r) => r.job.kind === kind) : all
  const t = rows.reduce((a, r) => ({
    billed: a.billed + r.totals.billedCents, cost: a.cost + r.totals.costCents, fee: a.fee + r.totals.feeCents,
    profit: a.profit + r.totals.profitCents, balance: a.balance + r.totals.balanceCents,
  }), { billed: 0, cost: 0, fee: 0, profit: 0, balance: 0 })
  const margin = (p: number, b: number) => (b > 0 ? `${Math.round((p / b) * 100)}%` : '')
  return (
    <div>
      <PageHeader back={{ href: `/reports?year=${year}`, label: 'Reports' }} title={`Jobs ${year}`}
        subtitle={<YearTabs year={year} thisYear={thisYear} path="/reports/jobs" />}
        actions={<a href={`/api/export?kind=csv&name=jobs&year=${year}`} className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"><Download size={14} />CSV</a>} />
      <div className="mb-3 flex gap-3 text-sm">
        {[['', 'All'], ['service', 'Service'], ['fabrication', 'Fabrication'], ['sale', 'Sales']].map(([k, l]) => (
          <Link key={k} href={`/reports/jobs?year=${year}${k ? `&kind=${k}` : ''}`} className={k === kind ? 'font-semibold' : 'text-fg-muted hover:text-fg'}>{l}</Link>
        ))}
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[48rem] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-fg-subtle">
              <th className="px-4 py-2 font-medium">Job</th>
              <th className="px-2 py-2 font-medium">Customer</th>
              <th className="px-2 py-2 font-medium">Status</th>
              <th className="px-2 py-2 text-right font-medium">Billed</th>
              <th className="px-2 py-2 text-right font-medium">Costs</th>
              <th className="px-2 py-2 text-right font-medium">Fees</th>
              <th className="px-2 py-2 text-right font-medium">Profit</th>
              <th className="px-2 py-2 text-right font-medium">Margin</th>
              <th className="px-4 py-2 text-right font-medium">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.job.id} className="hover:bg-hover">
                <td className="px-4 py-2">
                  <Link href={`/jobs/${r.job.id}`} className="hover:underline">
                    <span className="text-fg-subtle tabular">{jobNumber(r.job)}</span> {r.job.title}
                  </Link>
                  <div className="text-xs text-fg-subtle">{formatDate(r.job.openedOn)}</div>
                </td>
                <td className="px-2 py-2">{r.customer.name}<div className="text-xs text-fg-subtle">{vehicleLabel(r.vehicle)}</div></td>
                <td className="px-2 py-2"><StatusBadge status={r.job.status} balanceCents={r.totals.balanceCents} /></td>
                <td className="px-2 py-2 text-right"><Money cents={r.totals.billedCents} /></td>
                <td className="px-2 py-2 text-right text-fg-muted"><Money cents={r.totals.costCents} /></td>
                <td className="px-2 py-2 text-right text-fg-muted"><Money cents={r.totals.feeCents} /></td>
                <td className={cx('px-2 py-2 text-right font-medium', r.totals.profitCents < 0 && 'text-danger')}><Money cents={r.totals.profitCents} /></td>
                <td className="px-2 py-2 text-right text-fg-muted">{margin(r.totals.profitCents, r.totals.billedCents)}</td>
                <td className="px-4 py-2 text-right">{r.totals.balanceCents ? <Money cents={r.totals.balanceCents} signed /> : ''}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-line font-semibold">
              <td className="px-4 py-2" colSpan={3}>{rows.length} jobs</td>
              <td className="px-2 py-2 text-right"><Money cents={t.billed} /></td>
              <td className="px-2 py-2 text-right"><Money cents={t.cost} /></td>
              <td className="px-2 py-2 text-right"><Money cents={t.fee} /></td>
              <td className="px-2 py-2 text-right"><Money cents={t.profit} /></td>
              <td className="px-2 py-2 text-right">{margin(t.profit, t.billed)}</td>
              <td className="px-4 py-2 text-right"><Money cents={t.balance} /></td>
            </tr>
          </tfoot>
        </table>
      </Card>
      <div className="mt-2 text-xs text-fg-subtle">Job profit counts all of a job’s billed lines and costs regardless of date. The monthly report and tax worksheet count by payment and purchase date instead.</div>
    </div>
  )
}
