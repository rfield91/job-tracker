import Link from 'next/link'
import type { JobStatus } from '@/db/schema'
import { jobNumber, STATUS_LABELS, vehicleLabel, type JobListRow } from '@/server/jobs'
import { Badge, Money } from './ui'

const STATUS_TONES = { quote: 'neutral', in_progress: 'accent', done: 'warn', paid: 'good' } as const

export function StatusBadge({ status, balanceCents }: { status: JobStatus; balanceCents?: number }) {
  if (status === 'done' && balanceCents != null && balanceCents > 0) return <Badge tone="warn">Waiting on payment</Badge>
  return <Badge tone={STATUS_TONES[status]}>{STATUS_LABELS[status]}</Badge>
}

export function JobRow({ row, show = 'auto' }: { row: JobListRow; show?: 'auto' | 'billed' | 'balance' }) {
  const { job, customer, vehicle, totals } = row
  const owing = totals.balanceCents > 0 && totals.billedCents > 0
  const mode = show === 'auto' ? (job.status === 'done' && owing ? 'balance' : 'billed') : show
  return (
    <Link href={`/jobs/${job.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-hover">
      <span className="w-16 shrink-0 text-xs text-fg-subtle tabular">{jobNumber(job)}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{job.title}</span>
        <span className="block truncate text-xs text-fg-muted">
          {customer.name}{vehicle ? ` · ${vehicleLabel(vehicle)}` : ''}
        </span>
      </span>
      <span className="shrink-0 text-right">
        {mode === 'balance'
          ? <span className="block text-sm font-medium"><Money cents={totals.balanceCents} /> due</span>
          : <span className="block text-sm"><Money cents={totals.billedCents} /></span>}
        {totals.paidCents > 0 && job.status !== 'paid' && (
          <span className="block text-xs text-fg-subtle"><Money cents={totals.paidCents} /> paid</span>
        )}
      </span>
    </Link>
  )
}

export function JobList({ rows, empty }: { rows: JobListRow[]; empty?: string }) {
  if (rows.length === 0) return <div className="px-4 py-6 text-center text-sm text-fg-subtle">{empty ?? 'No jobs'}</div>
  return <div className="divide-y divide-line">{rows.map((r) => <JobRow key={r.job.id} row={r} />)}</div>
}
