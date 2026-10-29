import { notFound } from 'next/navigation'
import { Plus, Trash2 } from 'lucide-react'
import { ActionButton, ActionForm, SubmitButton } from '@/components/forms'
import { JobList } from '@/components/job-bits'
import { Card, CardHeader, Field, Input, LinkButton, Money, PageHeader, Textarea } from '@/components/ui'
import { addVehicleAction, deleteCustomerAction, deleteVehicleAction, updateCustomerAction } from '@/app/actions/misc'
import { authedDb } from '@/server/session'
import { getCustomer } from '@/server/customers'
import { vehicleLabel } from '@/server/jobs'

export const metadata = { title: 'Customer' }

export default async function CustomerPage({ params }: PageProps<'/customers/[id]'>) {
  const id = Number((await params).id)
  const d = await getCustomer(await authedDb(), id)
  if (!d) notFound()
  const { customer: c } = d
  const billed = d.jobs.reduce((a, j) => a + j.totals.billedCents, 0)
  const profit = d.jobs.reduce((a, j) => a + j.totals.profitCents, 0)
  return (
    <div className="space-y-4">
      <PageHeader
        back={{ href: '/customers', label: 'Customers' }}
        title={c.name}
        subtitle={<>{d.jobs.length} job{d.jobs.length === 1 ? '' : 's'} · billed <Money cents={billed} /> · profit <Money cents={profit} /></>}
        actions={<LinkButton href={`/jobs/new?customer=${c.id}`} variant="primary"><Plus size={16} />New job</LinkButton>}
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <Card>
          <CardHeader title="Jobs" />
          <JobList rows={d.jobs} empty="No jobs yet" />
        </Card>
        <div className="space-y-4">
          <Card className="p-4">
            <ActionForm action={updateCustomerAction} className="space-y-3">
              <input type="hidden" name="id" value={c.id} />
              <Field label="Name"><Input name="name" defaultValue={c.name} required /></Field>
              <Field label="Phone"><Input name="phone" defaultValue={c.phone ?? ''} inputMode="tel" /></Field>
              <Field label="Email" hint="Needed for Stripe payment requests"><Input name="email" type="email" defaultValue={c.email ?? ''} /></Field>
              <Field label="Notes"><Textarea name="notes" defaultValue={c.notes ?? ''} rows={2} /></Field>
              <div className="flex justify-end"><SubmitButton variant="secondary">Save</SubmitButton></div>
            </ActionForm>
          </Card>
          <Card>
            <CardHeader title="Cars" />
            <div className="divide-y divide-line border-t border-line">
              {d.vehicles.map((v) => (
                <div key={v.id} className="flex items-center gap-2 px-4 py-2 text-sm">
                  <span className="flex-1">{vehicleLabel(v)}{v.vin && <span className="block text-xs text-fg-subtle">VIN {v.vin}</span>}</span>
                  <ActionButton action={deleteVehicleAction} fields={{ id: v.id }} confirm="Remove this car? Jobs keep their history."><Trash2 size={14} /></ActionButton>
                </div>
              ))}
            </div>
            <ActionForm action={addVehicleAction} resetOnSuccess className="flex gap-2 border-t border-line px-4 py-3">
              <input type="hidden" name="customerId" value={c.id} />
              <Input name="vehicleText" placeholder="2019 Honda Civic Si" />
              <SubmitButton variant="secondary">Add</SubmitButton>
            </ActionForm>
          </Card>
          {d.jobs.length === 0 && (
            <ActionButton action={deleteCustomerAction} fields={{ id: c.id }} variant="danger" size="md" confirm="Delete this customer?">
              <Trash2 size={15} />Delete customer
            </ActionButton>
          )}
        </div>
      </div>
    </div>
  )
}
