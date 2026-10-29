'use client'

import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { ActionForm, SubmitButton } from '@/components/forms'
import { Card, cx, Field, Input, Select, Textarea } from '@/components/ui'
import { createJobAction } from '@/app/actions/jobs'
import type { CustomerOption } from '@/server/customers'
import type { JobKind } from '@/db/schema'

const carLabel = (v: CustomerOption['vehicles'][number]) => [v.year, v.make, v.model, v.trim].filter(Boolean).join(' ')

export function NewJobForm({ customers, templates, today, initialCustomerId }: {
  customers: CustomerOption[]
  templates: { id: number; name: string; title: string; kind: JobKind }[]
  today: string
  initialCustomerId: number | null
}) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<CustomerOption | null>(
    () => customers.find((c) => c.id === initialCustomerId) ?? null)
  const [vehicleId, setVehicleId] = useState<string>(() => {
    const c = customers.find((x) => x.id === initialCustomerId)
    return c?.vehicles.length === 1 ? String(c.vehicles[0].id) : c?.vehicles.length ? '' : 'new'
  })
  const [templateId, setTemplateId] = useState('')
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<JobKind>('service')
  const [more, setMore] = useState(false)

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q || selected) return []
    return customers.filter((c) =>
      c.name.toLowerCase().includes(q)
      || c.phone?.replace(/\D/g, '').includes(q.replace(/\D/g, '') || '\u0000')
      || c.vehicles.some((v) => carLabel(v).toLowerCase().includes(q))).slice(0, 6)
  }, [query, customers, selected])

  function pick(c: CustomerOption) {
    setSelected(c)
    setQuery('')
    setVehicleId(c.vehicles.length === 1 ? String(c.vehicles[0].id) : c.vehicles.length ? '' : 'new')
  }

  function pickTemplate(id: string) {
    setTemplateId(id)
    const t = templates.find((x) => String(x.id) === id)
    if (t) {
      if (!title) setTitle(t.title)
      setKind(t.kind)
    }
  }

  return (
    <ActionForm action={createJobAction}>
      <Card className="space-y-4 p-4">
        <div>
          <span className="mb-1 block text-sm font-medium text-fg-muted">Customer</span>
          {selected ? (
            <div className="flex h-10 items-center justify-between rounded-lg border border-line bg-raised px-3">
              <span className="text-sm font-medium">{selected.name}{selected.phone ? <span className="font-normal text-fg-muted"> · {selected.phone}</span> : null}</span>
              <button type="button" onClick={() => setSelected(null)} className="text-fg-subtle hover:text-fg" aria-label="Change customer"><X size={16} /></button>
              <input type="hidden" name="customerId" value={selected.id} />
            </div>
          ) : (
            <>
              <Input
                name="customerName"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Name, phone or car"
                autoComplete="off"
                autoFocus
                required
              />
              {matches.length > 0 && (
                <div className="mt-1 divide-y divide-line overflow-hidden rounded-lg border border-line">
                  {matches.map((c) => (
                    <button key={c.id} type="button" onClick={() => pick(c)} className="block w-full px-3 py-2 text-left hover:bg-hover">
                      <span className="block text-sm font-medium">{c.name}</span>
                      <span className="block text-xs text-fg-muted">{[c.phone, ...c.vehicles.map(carLabel)].filter(Boolean).join(' · ')}</span>
                    </button>
                  ))}
                </div>
              )}
              {query.trim() && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Input name="customerPhone" placeholder="Phone (new customer)" inputMode="tel" />
                  <Input name="customerEmail" placeholder="Email" type="email" />
                </div>
              )}
            </>
          )}
        </div>

        <div>
          <span className="mb-1 block text-sm font-medium text-fg-muted">Car</span>
          {selected && selected.vehicles.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {selected.vehicles.map((v) => (
                <ChoiceChip key={v.id} active={vehicleId === String(v.id)} onClick={() => setVehicleId(String(v.id))}>{carLabel(v) || 'Car'}</ChoiceChip>
              ))}
              <ChoiceChip active={vehicleId === 'new'} onClick={() => setVehicleId('new')}>Another car</ChoiceChip>
            </div>
          )}
          <input type="hidden" name="vehicleId" value={vehicleId} />
          {(!selected || selected.vehicles.length === 0 || vehicleId === 'new') && (
            <Input name="vehicleText" placeholder="e.g. 2008 Subaru WRX" autoComplete="off" />
          )}
        </div>

        {templates.length > 0 && (
          <Field label="Start from a template">
            <Select name="templateId" value={templateId} onChange={(e) => pickTemplate(e.target.value)}>
              <option value="">None</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Field>
        )}

        <Field label="What’s the job?">
          <Input name="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Catback exhaust, brake job…" required />
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <ChoiceChip big active={kind === 'service'} onClick={() => setKind('service')}>Service</ChoiceChip>
          <ChoiceChip big active={kind === 'fabrication'} onClick={() => setKind('fabrication')}>Fabrication</ChoiceChip>
          <input type="hidden" name="kind" value={kind} />
        </div>

        {more ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date">
                <Input type="date" name="openedOn" defaultValue={today} required />
              </Field>
              <Field label="Starts as">
                <Select name="status" defaultValue="in_progress">
                  <option value="in_progress">In progress</option>
                  <option value="quote">Quote</option>
                </Select>
              </Field>
            </div>
            <Field label="Notes"><Textarea name="notes" /></Field>
          </div>
        ) : (
          <>
            <input type="hidden" name="openedOn" value={today} />
            <button type="button" onClick={() => setMore(true)} className="text-sm text-fg-muted hover:text-fg">
              Date, quote or notes…
            </button>
          </>
        )}
      </Card>
      <div className="mt-4 flex justify-end">
        <SubmitButton size="lg">Create job</SubmitButton>
      </div>
    </ActionForm>
  )
}

function ChoiceChip({ active, onClick, children, big }: { active: boolean; onClick: () => void; children: React.ReactNode; big?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx('rounded-lg border text-sm', big ? 'h-10' : 'h-8 px-3',
        active ? 'border-accent bg-accent-soft font-medium text-accent' : 'border-line bg-surface text-fg-muted hover:bg-hover')}
    >
      {children}
    </button>
  )
}
