import Link from 'next/link'
import { Search } from 'lucide-react'
import { Card, Empty, Input, PageHeader } from '@/components/ui'
import { formatDate } from '@/lib/dates'
import { authedDb } from '@/server/session'
import { listCustomers } from '@/server/customers'
import { vehicleLabel } from '@/server/jobs'

export const metadata = { title: 'Customers' }

export default async function CustomersPage({ searchParams }: PageProps<'/customers'>) {
  const sp = await searchParams
  const q = typeof sp.q === 'string' ? sp.q : ''
  const rows = await listCustomers(await authedDb(), q)
  return (
    <div>
      <PageHeader title="Customers" subtitle="New customers are added when you start a job." />
      <form className="relative mb-4">
        <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-subtle" />
        <Input name="q" defaultValue={q} placeholder="Name, phone or email" className="pl-9" />
      </form>
      <Card>
        {rows.length === 0 ? <Empty>No customers{q ? ` match “${q}”` : ' yet'}</Empty> : (
          <div className="divide-y divide-line">
            {rows.map((r) => (
              <Link key={r.customer.id} href={`/customers/${r.customer.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-hover">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{r.customer.name}</span>
                  <span className="block truncate text-xs text-fg-muted">
                    {[r.customer.phone, ...r.vehicles.map(vehicleLabel)].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className="shrink-0 text-right text-xs text-fg-subtle">
                  {r.jobCount} job{r.jobCount === 1 ? '' : 's'}
                  {r.lastJob && <span className="block">{formatDate(r.lastJob)}</span>}
                </span>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
