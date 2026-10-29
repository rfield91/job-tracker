import { ActionForm, SubmitButton } from '@/components/forms'
import { Card, Empty, Money, PageHeader, Select } from '@/components/ui'
import { assignPaymentAction } from '@/app/actions/jobs'
import { formatDate } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { authedDb } from '@/server/session'
import { unmatchedPayments } from '@/server/payments'
import { jobOptions } from '@/server/pickers'

export const metadata = { title: 'Stripe payments to match' }

export default async function UnmatchedPage() {
  const db = await authedDb()
  const rows = await unmatchedPayments(db)
  const jobs = await jobOptions(db)
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Stripe payments to match" back={{ href: '/', label: 'Home' }}
        subtitle="Payments from your website, or Stripe invoices not sent from a job. Assign each one to its job." />
      <Card>
        {rows.length === 0 ? <Empty>All caught up.</Empty> : (
          <div className="divide-y divide-line">
            {rows.map((p) => (
              <div key={p.id} className="space-y-2 px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{p.payerName ?? 'Unknown payer'}</div>
                    <div className="text-xs text-fg-muted">
                      {formatDate(p.receivedOn)}{p.note ? ` · ${p.note}` : ''}{p.feeCents ? ` · fee ${formatMoney(p.feeCents)}` : ''}
                    </div>
                  </div>
                  <Money cents={p.amountCents} signed className="text-sm font-medium" />
                </div>
                <ActionForm action={assignPaymentAction} className="grid grid-cols-[1fr_8rem_auto] gap-2">
                  <input type="hidden" name="id" value={p.id} />
                  <Select name="jobId" required defaultValue="">
                    <option value="">Pick a job…</option>
                    {jobs.map((j) => <option key={j.id} value={j.id}>{j.label} — {j.sub}</option>)}
                  </Select>
                  <Select name="purpose" defaultValue={p.amountCents < 0 ? 'refund' : 'final'}>
                    <option value="deposit">Deposit</option>
                    <option value="progress">Progress</option>
                    <option value="final">Final</option>
                    <option value="refund">Refund</option>
                  </Select>
                  <SubmitButton>Assign</SubmitButton>
                </ActionForm>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
