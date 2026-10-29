import { asc } from 'drizzle-orm'
import { PageHeader } from '@/components/ui'
import { jobTemplates } from '@/db/schema'
import { authedDb } from '@/server/session'
import { customerOptions } from '@/server/customers'
import { today } from '@/server/settings'
import { NewJobForm } from './new-job-form'

export const metadata = { title: 'New job' }

export default async function NewJobPage({ searchParams }: PageProps<'/jobs/new'>) {
  const sp = await searchParams
  const db = await authedDb()
  const customers = await customerOptions(db)
  const templates = await db.select().from(jobTemplates).orderBy(asc(jobTemplates.name))
  const customerId = typeof sp.customer === 'string' ? Number(sp.customer) : null
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="New job" back={{ href: '/jobs', label: 'Jobs' }} />
      <NewJobForm
        customers={customers}
        templates={templates.map((t) => ({ id: t.id, name: t.name, title: t.title, kind: t.kind }))}
        today={await today(db)}
        initialCustomerId={customerId}
      />
    </div>
  )
}
