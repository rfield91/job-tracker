import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/ui'
import { PrintButton } from '@/components/print-button'
import { addDays, formatDate } from '@/lib/dates'
import { formatMoney, formatScaled } from '@/lib/money'
import { authedDb } from '@/server/session'
import { getJobDetail, jobNumber, vehicleLabel } from '@/server/jobs'
import { PURPOSE_LABELS, METHOD_LABELS } from '@/server/payments'
import { getSettings, today } from '@/server/settings'

export const metadata = { title: 'Invoice' }

export default async function InvoicePage({ params }: PageProps<'/jobs/[id]/invoice'>) {
  const id = Number((await params).id)
  const db = await authedDb()
  const d = await getJobDetail(db, id)
  if (!d) notFound()
  const s = await getSettings(db)
  const estimate = d.job.status === 'quote'
  const number = jobNumber(d.job)
  const issued = d.job.completedOn ?? await today(db)
  const groups = [
    { title: 'Labor', rows: d.lines.filter((l) => l.type === 'labor') },
    { title: 'Parts', rows: d.lines.filter((l) => l.type === 'part') },
    { title: 'Other', rows: d.lines.filter((l) => l.type === 'fee' || l.type === 'discount') },
  ].filter((g) => g.rows.length)
  return (
    <div>
      <div className="no-print">
        <PageHeader back={{ href: `/jobs/${id}`, label: `Job #${number}` }} title={estimate ? 'Estimate' : 'Invoice'}
          actions={<PrintButton />} />
      </div>
      <div className="print-plain mx-auto max-w-3xl rounded-xl border border-line bg-surface p-8 text-sm text-fg">
        <div className="flex items-start justify-between gap-6">
          <div>
            {s.logoFileId && <img src={`/files/${s.logoFileId}`} alt="" className="mb-3 max-h-16 max-w-48 object-contain" />}
            <div className="text-lg font-semibold">{s.businessName || 'Your business name'}</div>
            {s.ownerName && <div>{s.ownerName}</div>}
            {s.address && <div className="whitespace-pre-line text-fg-muted">{s.address}</div>}
            <div className="text-fg-muted">{[s.phone, s.email, s.website].filter(Boolean).join(' · ')}</div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-semibold tracking-tight">{estimate ? 'Estimate' : 'Invoice'}</div>
            <div className="text-fg-muted">#{number}</div>
            <div className="mt-2 text-fg-muted">Date: {formatDate(issued)}</div>
            {!estimate && d.totals.balanceCents > 0 && <div className="text-fg-muted">Due: {formatDate(addDays(issued, s.invoiceDueDays))}</div>}
          </div>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-6">
          <div>
            <div className="text-xs font-medium tracking-wide text-fg-subtle uppercase">Bill to</div>
            <div className="font-medium">{d.customer.name}</div>
            <div className="text-fg-muted">{[d.customer.phone, d.customer.email].filter(Boolean).join(' · ')}</div>
          </div>
          <div>
            <div className="text-xs font-medium tracking-wide text-fg-subtle uppercase">Vehicle</div>
            <div>{vehicleLabel(d.vehicle) || '—'}</div>
            {d.vehicle?.vin && <div className="text-fg-muted">VIN {d.vehicle.vin}</div>}
          </div>
        </div>

        <div className="mt-6 font-medium">{d.job.title}</div>

        <table className="mt-3 w-full border-collapse">
          <thead>
            <tr className="border-b border-line text-left text-xs text-fg-subtle">
              <th className="py-2 font-medium">Description</th>
              <th className="py-2 text-right font-medium">Qty</th>
              <th className="py-2 text-right font-medium">Rate</th>
              <th className="py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          {groups.map((g) => (
            <tbody key={g.title}>
              {groups.length > 1 && (
                <tr><td colSpan={4} className="pt-3 pb-1 text-xs font-medium tracking-wide text-fg-subtle uppercase">{g.title}</td></tr>
              )}
              {g.rows.map((l) => (
                <tr key={l.id} className="border-b border-line/60">
                  <td className="py-1.5 pr-2">{l.description}</td>
                  <td className="py-1.5 text-right tabular">{l.hoursHundredths != null ? `${formatScaled(l.hoursHundredths, 100)} h` : ''}</td>
                  <td className="py-1.5 text-right tabular">{l.rateCents != null && l.hoursHundredths != null ? formatMoney(l.rateCents) : ''}</td>
                  <td className="py-1.5 text-right tabular">{formatMoney(l.amountCents)}</td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>

        <div className="mt-4 ml-auto w-full max-w-xs space-y-1">
          <Row label={estimate ? 'Estimated total' : 'Total'} value={formatMoney(d.totals.billedCents)} strong />
          {d.payments.map((p) => (
            <Row key={p.id}
              label={`${PURPOSE_LABELS[p.purpose]} · ${METHOD_LABELS[p.method]} · ${formatDate(p.receivedOn, { year: false })}`}
              value={formatMoney(-p.amountCents)} muted />
          ))}
          {d.payments.length > 0 && (
            <Row label={d.totals.balanceCents > 0 ? 'Balance due' : 'Balance'} value={formatMoney(Math.max(0, d.totals.balanceCents))} strong />
          )}
        </div>

        {!estimate && d.totals.balanceCents > 0 && s.paymentInstructions && (
          <div className="mt-8">
            <div className="text-xs font-medium tracking-wide text-fg-subtle uppercase">How to pay</div>
            <div className="whitespace-pre-line">{s.paymentInstructions}</div>
          </div>
        )}
        {estimate && <div className="mt-8 text-fg-muted">This is an estimate. Final cost may change with parts prices and actual hours.</div>}
        {s.invoiceFooter && <div className="mt-8 text-center text-fg-muted">{s.invoiceFooter}</div>}
      </div>
    </div>
  )
}

function Row({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? 'border-t border-line pt-1 font-semibold' : ''} ${muted ? 'text-fg-muted' : ''}`}>
      <span>{label}</span>
      <span className="tabular">{value}</span>
    </div>
  )
}
