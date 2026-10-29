import { Plus, Search } from 'lucide-react'
import { Card, Input, LinkButton, Money, PageHeader, Select } from '@/components/ui'
import { JobList } from '@/components/job-bits'
import { authedDb } from '@/server/session'
import { listJobs, type JobListFilter } from '@/server/jobs'
import { today } from '@/server/settings'

export const metadata = { title: 'Jobs' }

const STATUS_OPTIONS = [
  ['', 'All statuses'],
  ['open', 'Quotes and in progress'],
  ['quote', 'Quotes'],
  ['in_progress', 'In progress'],
  ['unpaid', 'Done, not paid'],
  ['paid', 'Paid'],
] as const

export default async function JobsPage({ searchParams }: PageProps<'/jobs'>) {
  const sp = await searchParams
  const db = await authedDb()
  const thisYear = Number((await today(db)).slice(0, 4))
  const q = typeof sp.q === 'string' ? sp.q : ''
  const status = typeof sp.status === 'string' ? sp.status : ''
  const kind = typeof sp.kind === 'string' ? sp.kind : ''
  const yearParam = typeof sp.year === 'string' ? sp.year : q ? 'all' : String(thisYear)
  const filter: JobListFilter = {
    q,
    status: (status || undefined) as JobListFilter['status'],
    kind: (kind || undefined) as JobListFilter['kind'],
    year: yearParam === 'all' ? undefined : Number(yearParam),
  }
  let rows = await listJobs(db, filter)
  if (status === 'unpaid') rows = rows.filter((r) => r.totals.balanceCents > 0)
  const billed = rows.reduce((a, r) => a + r.totals.billedCents, 0)
  const years = Array.from({ length: 6 }, (_, i) => thisYear - i)
  return (
    <div>
      <PageHeader title="Jobs" actions={<LinkButton href="/jobs/new" variant="primary"><Plus size={16} />New job</LinkButton>} />
      <form className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto_auto]">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-subtle" />
          <Input name="q" defaultValue={q} placeholder="Customer, car, job number…" className="pl-9" />
        </div>
        <Select name="status" defaultValue={status}>
          {STATUS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
        <Select name="kind" defaultValue={kind}>
          <option value="">Service and fab</option>
          <option value="service">Service</option>
          <option value="fabrication">Fabrication</option>
        </Select>
        <Select name="year" defaultValue={yearParam}>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
          <option value="all">All years</option>
        </Select>
        <button className="h-10 rounded-lg border border-line bg-surface px-3 text-sm hover:bg-hover">Filter</button>
      </form>
      <Card>
        <div className="flex justify-between border-b border-line px-4 py-2 text-xs text-fg-subtle">
          <span>{rows.length} job{rows.length === 1 ? '' : 's'}</span>
          <span>Billed <Money cents={billed} /></span>
        </div>
        <JobList rows={rows} empty={q ? `No jobs match “${q}”` : 'No jobs yet'} />
      </Card>
    </div>
  )
}
