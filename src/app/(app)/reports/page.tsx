import Link from 'next/link'
import { FileText, Download } from 'lucide-react'
import { Card, CardHeader, cx, LinkButton, Money, PageHeader } from '@/components/ui'
import { formatDate, monthName } from '@/lib/dates'
import { authedDb } from '@/server/session'
import { monthlyReport, quarterlyEstimate } from '@/server/reports'
import { today } from '@/server/settings'
import { YearTabs } from '@/components/year-tabs'

export const metadata = { title: 'Reports' }

export default async function ReportsPage({ searchParams }: PageProps<'/reports'>) {
  const sp = await searchParams
  const db = await authedDb()
  const now = await today(db)
  const thisYear = Number(now.slice(0, 4))
  const year = typeof sp.year === 'string' ? Number(sp.year) : thisYear
  const { rows, total } = await monthlyReport(db, year)
  const q = await quarterlyEstimate(db, year)
  const showRows = year === thisYear ? rows.filter((r) => r.month <= now.slice(0, 7)) : rows
  return (
    <div className="space-y-4">
      <PageHeader
        title="Reports"
        subtitle={<YearTabs year={year} thisYear={thisYear} path="/reports" />}
        actions={<>
          <LinkButton href={`/reports/jobs?year=${year}`}>Jobs {year}</LinkButton>
          <LinkButton href={`/reports/tax?year=${year}`} variant="primary"><FileText size={15} />Tax worksheet</LinkButton>
        </>}
      />
      <Card>
        <CardHeader title="Profit by month" action={
          <a href={`/api/export?kind=csv&name=purchases&year=${year}`} className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg"><Download size={13} />Purchases CSV</a>
        } />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="border-y border-line text-left text-xs text-fg-subtle">
                <th className="px-4 py-2 font-medium">Month</th>
                <th className="px-2 py-2 text-right font-medium">Paid</th>
                <th className="px-2 py-2 text-right font-medium">Parts / COGS</th>
                <th className="px-2 py-2 text-right font-medium">Expenses</th>
                <th className="px-2 py-2 text-right font-medium">Fees</th>
                <th className="px-4 py-2 text-right font-medium">Profit</th>
                <th className="px-2 py-2 text-right font-medium text-fg-subtle">Stock</th>
                <th className="px-4 py-2 text-right font-medium text-fg-subtle">Equipment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {showRows.map((r) => (
                <tr key={r.month} className="hover:bg-hover">
                  <td className="px-4 py-2">
                    <Link href={`/purchases?year=${year}&month=${r.month.slice(5)}`} className="hover:underline">{monthName(r.month, true)}</Link>
                  </td>
                  <td className="px-2 py-2 text-right"><Money cents={r.revenueCents} /></td>
                  <td className="px-2 py-2 text-right text-fg-muted"><Money cents={r.cogsCents} /></td>
                  <td className="px-2 py-2 text-right text-fg-muted"><Money cents={r.expenseCents} /></td>
                  <td className="px-2 py-2 text-right text-fg-muted"><Money cents={r.feeCents} /></td>
                  <td className={cx('px-4 py-2 text-right font-medium', r.profitCents < 0 && 'text-danger')}><Money cents={r.profitCents} /></td>
                  <td className="px-2 py-2 text-right text-fg-subtle">{r.stockCents ? <Money cents={r.stockCents} /> : ''}</td>
                  <td className="px-4 py-2 text-right text-fg-subtle">{r.equipmentCents ? <Money cents={r.equipmentCents} /> : ''}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-line font-semibold">
                <td className="px-4 py-2">{year}</td>
                <td className="px-2 py-2 text-right"><Money cents={total.revenueCents} /></td>
                <td className="px-2 py-2 text-right"><Money cents={total.cogsCents} /></td>
                <td className="px-2 py-2 text-right"><Money cents={total.expenseCents} /></td>
                <td className="px-2 py-2 text-right"><Money cents={total.feeCents} /></td>
                <td className={cx('px-4 py-2 text-right', total.profitCents < 0 && 'text-danger')}><Money cents={total.profitCents} /></td>
                <td className="px-2 py-2 text-right text-fg-subtle">{total.stockCents ? <Money cents={total.stockCents} /> : ''}</td>
                <td className="px-4 py-2 text-right text-fg-subtle">{total.equipmentCents ? <Money cents={total.equipmentCents} /> : ''}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="px-4 py-2 text-xs text-fg-subtle">
          Cash basis: income on the day it was paid, costs on the day they were bought. Stock counts when it goes on a job; the Stock column is what’s still on the shelf. Equipment is depreciated on the return, so it’s not in profit here.
          {total.unassignedCents > 0 && <> <Link href="/purchases?needsHome=1" className="text-warn underline">Some purchases still need a job or category.</Link></>}
        </div>
      </Card>

      <Card>
        <CardHeader title="Estimated tax set-aside" action={<span className="text-xs text-fg-subtle">{q.setAsidePct}% of profit (change in settings)</span>} />
        <div className="grid grid-cols-2 divide-line border-t border-line sm:grid-cols-4 sm:divide-x">
          {q.quarters.map((x) => (
            <div key={x.quarter} className="px-4 py-3">
              <div className="text-xs text-fg-subtle">{x.quarter} · {x.covers}</div>
              <div className="text-lg font-semibold tabular"><Money cents={x.setAsideCents} whole /></div>
              <div className="text-xs text-fg-muted">profit <Money cents={x.profitCents} whole /> · due {formatDate(x.due)}</div>
            </div>
          ))}
        </div>
        <div className="px-4 py-2 text-xs text-fg-subtle">A rough guide for federal estimated payments (Form 1040-ES), covering income and self-employment tax together. New Hampshire has no tax on wages, but check the Business Profits Tax threshold on the tax worksheet.</div>
      </Card>
    </div>
  )
}
