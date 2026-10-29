import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { JobList } from '@/components/job-bits'
import { Card, CardHeader, cx, Money, PageHeader, Stat } from '@/components/ui'
import { formatDate, monthName } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { authedDb } from '@/server/session'
import { monthLog } from '@/server/reports'

export const metadata = { title: 'Month' }

function shift(month: string, by: number) {
  const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + by, 1))
  return d.toISOString().slice(0, 7)
}

export default async function MonthPage({ searchParams }: PageProps<'/reports/month'>) {
  const sp = await searchParams
  const month = typeof sp.m === 'string' ? sp.m : ''
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) notFound()
  const db = await authedDb()
  const { summary: s, entries, finished } = await monthLog(db, month)
  const year = month.slice(0, 4)
  const costs = s.cogsCents + s.expenseCents + s.feeCents
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader back={{ href: `/reports?year=${year}`, label: `Reports ${year}` }} title={`${monthName(month, true)} ${year}`}
        actions={<>
          <Link href={`/reports/month?m=${shift(month, -1)}`} className="inline-flex h-9 items-center rounded-lg px-2 text-fg-muted hover:bg-hover hover:text-fg" aria-label="Previous month"><ChevronLeft size={18} /></Link>
          <Link href={`/reports/month?m=${shift(month, 1)}`} className="inline-flex h-9 items-center rounded-lg px-2 text-fg-muted hover:bg-hover hover:text-fg" aria-label="Next month"><ChevronRight size={18} /></Link>
        </>} />

      <Card className="p-4">
        <div className="grid grid-cols-3 gap-4">
          <Stat label="Paid" cents={s.revenueCents} />
          <Stat label="Costs" cents={costs} tone="muted" />
          <Stat label="Profit" cents={s.profitCents} tone={s.profitCents < 0 ? 'danger' : 'good'} />
        </div>
        {(s.stockCents > 0 || s.equipmentCents > 0) && (
          <div className="mt-2 text-xs text-fg-subtle">
            Not in profit: {[
              s.stockCents > 0 && `${formatMoney(s.stockCents)} bought for stock`,
              s.equipmentCents > 0 && `${formatMoney(s.equipmentCents)} of equipment`,
            ].filter(Boolean).join(', ')}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Money in and out" />
        {entries.length === 0 && <div className="px-4 pb-4 text-sm text-fg-subtle">Nothing this month.</div>}
        <div className="divide-y divide-line border-t border-line empty:border-0">
          {entries.map((e) => {
            const body = (
              <>
                <div className="flex items-baseline gap-3">
                  <span className="w-12 shrink-0 text-xs text-fg-subtle tabular">{formatDate(e.date, { year: false })}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{e.title}</span>
                    {e.detail && <span className="block truncate text-xs text-fg-muted">{e.detail}</span>}
                  </span>
                  <Money cents={e.amountCents} signed className={cx('shrink-0 text-sm', e.amountCents > 0 ? 'text-good' : e.profitCents === 0 && 'text-fg-subtle')} />
                </div>
                {e.items.length > 0 && (e.kind === 'income' || e.items.length > 1 || e.items[0].to) && (
                  <div className="mt-1 space-y-0.5 pl-15">
                    {e.items.map((i, n) => (
                      <div key={n} className={cx('flex gap-3 text-xs', i.inProfit ? 'text-fg-muted' : 'text-fg-subtle')}>
                        <span className="min-w-0 flex-1 truncate">{i.label}{i.to && <> → {i.to}</>}{!i.inProfit && ' (not in profit)'}</span>
                        <Money cents={i.cents} signed className="shrink-0" />
                      </div>
                    ))}
                  </div>
                )}
              </>
            )
            return e.href
              ? <Link key={e.key} href={e.href} className="block px-4 py-2.5 hover:bg-hover">{body}</Link>
              : <div key={e.key} className="px-4 py-2.5">{body}</div>
          })}
        </div>
        <div className="border-t border-line px-4 py-2 text-xs text-fg-subtle">
          Payments are shown after processing fees. Stock taken onto a job shows on the day it was used.
          {s.unassignedCents > 0 && <> <Link href="/purchases?needsHome=1" className="text-warn underline">Some purchases still need a job or category.</Link></>}
        </div>
      </Card>

      <Card>
        <CardHeader title={`Jobs finished (${finished.length})`} />
        <JobList rows={finished} empty="None this month" />
      </Card>
    </div>
  )
}
