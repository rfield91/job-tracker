import Link from 'next/link'
import { AlertTriangle, CreditCard, Plus, Receipt, Search } from 'lucide-react'
import { Card, CardHeader, Input, LinkButton, Stat } from '@/components/ui'
import { JobList } from '@/components/job-bits'
import { monthName } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { authedDb } from '@/server/session'
import { dashboard } from '@/server/reports'
import { today } from '@/server/settings'

export default async function Home() {
  const db = await authedDb()
  const d = await dashboard(db, await today(db))
  const m = d.thisMonth
  const costs = m.cogsCents + m.expenseCents + m.feeCents
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <LinkButton href="/jobs/new" variant="primary" size="lg"><Plus size={18} />Job</LinkButton>
        <LinkButton href="/purchases/new" size="lg"><Receipt size={18} />Purchase</LinkButton>
        <LinkButton href="/payments/new" size="lg"><CreditCard size={18} />Payment</LinkButton>
      </div>

      <form action="/jobs" className="relative">
        <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-subtle" />
        <Input name="q" placeholder="Search jobs, customers, cars, job numbers" className="pl-9" />
      </form>

      <Card className="p-4">
        <div className="mb-2 text-sm font-semibold">{monthName(d.month, true)}</div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Paid" cents={m.revenueCents} />
          <Stat label="Costs" cents={costs} tone="muted" />
          <Stat label="Profit" cents={m.profitCents} tone={m.profitCents < 0 ? 'danger' : 'good'} />
          <Stat label="Unpaid" cents={d.unpaidCents} tone="muted" hint={`${d.unpaid.length} job${d.unpaid.length === 1 ? '' : 's'}`} />
        </div>
        {m.equipmentCents > 0 && (
          <div className="mt-2 text-xs text-fg-subtle">Plus {formatMoney(m.equipmentCents)} of equipment (tracked separately for depreciation)</div>
        )}
      </Card>

      {(d.unmatchedPayments > 0 || d.needsHomeCount > 0) && (
        <div className="space-y-2">
          {d.unmatchedPayments > 0 && (
            <Link href="/payments/unmatched" className="flex items-center gap-2 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
              <CreditCard size={16} />
              {d.unmatchedPayments} Stripe payment{d.unmatchedPayments === 1 ? '' : 's'} to match to a job
            </Link>
          )}
          {d.needsHomeCount > 0 && (
            <Link href="/purchases?needsHome=1" className="flex items-center gap-2 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
              <AlertTriangle size={16} />
              {d.needsHomeCount} purchase{d.needsHomeCount === 1 ? '' : 's'} need a job or category
            </Link>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={`In progress (${d.open.length})`} action={<Link href="/jobs?status=open" className="text-xs text-fg-muted hover:text-fg">All</Link>} />
          <JobList rows={d.open} empty="Nothing in progress" />
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title={`Waiting on payment (${d.unpaid.length})`} />
            <JobList rows={d.unpaid} empty="Everything’s paid" />
          </Card>
          <Card>
            <details>
              <summary className="cursor-pointer list-none px-4 py-3.5 text-sm font-semibold">
                Done this month ({d.doneThisMonth.length}) <span className="text-fg-subtle">▸</span>
              </summary>
              <JobList rows={d.doneThisMonth} empty="None yet" />
            </details>
          </Card>
        </div>
      </div>
    </div>
  )
}
