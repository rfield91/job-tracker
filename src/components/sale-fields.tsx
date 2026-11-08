'use client'

import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { Field, Input, MoneyInput } from './ui'

export type BuyerOption = { id: number; name: string; phone: string | null }

const CARRIERS = ['USPS', 'UPS', 'FedEx', 'Pirate Ship']

export function BuyerPicker({ customers, initial = null, initialName = '', initialEmail = '' }: {
  customers: BuyerOption[]
  initial?: BuyerOption | null
  initialName?: string
  initialEmail?: string
}) {
  const [query, setQuery] = useState(initialName)
  const [selected, setSelected] = useState<BuyerOption | null>(initial)
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q || selected) return []
    return customers.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 5)
  }, [query, customers, selected])
  return (
    <div>
      <span className="mb-1 block text-sm font-medium text-fg-muted">Buyer</span>
      {selected ? (
        <div className="flex h-10 items-center justify-between rounded-lg border border-line bg-raised px-3">
          <span className="text-sm font-medium">{selected.name}{selected.phone ? <span className="font-normal text-fg-muted"> · {selected.phone}</span> : null}</span>
          <button type="button" onClick={() => setSelected(null)} className="text-fg-subtle hover:text-fg" aria-label="Change buyer"><X size={16} /></button>
          <input type="hidden" name="customerId" value={selected.id} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Input name="customerName" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name" autoComplete="off" required />
            <Input name="customerEmail" type="email" defaultValue={initialEmail} placeholder="Email (optional)" />
          </div>
          {matches.length > 0 && (
            <div className="mt-1 divide-y divide-line overflow-hidden rounded-lg border border-line">
              {matches.map((c) => (
                <button key={c.id} type="button" onClick={() => { setSelected(c); setQuery('') }} className="block w-full px-3 py-2 text-left text-sm hover:bg-hover">
                  {c.name}{c.phone && <span className="text-fg-muted"> · {c.phone}</span>}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// Everything about shipping in one place. What the buyer paid for it (when the
// form asks) is income; the label is a cost on the sale. costKey clears the
// per-sale fields between sales.
export function ShippingFields({ carrier, onCarrier, costKey, charged }: {
  carrier: string
  onCarrier: (v: string) => void
  costKey?: string
  charged?: { value: string; onChange: (v: string) => void }
}) {
  return (
    <div className="space-y-3 rounded-lg border border-line p-3">
      <div className="text-sm font-medium">Shipping</div>
      <div className="grid grid-cols-2 gap-3">
        {charged && (
          <Field label="Charged to buyer" hint="Its own line on the sale">
            <MoneyInput name="shippingBilled" value={charged.value} onChange={(e) => charged.onChange(e.target.value)} placeholder="0.00" />
          </Field>
        )}
        <Field label="Label cost" hint="What you paid, against this sale’s profit">
          <MoneyInput key={costKey} name="shipping" placeholder="0.00" />
        </Field>
        <Field label="Carrier">
          <Input name="carrier" value={carrier} onChange={(e) => onCarrier(e.target.value)} list="carriers" />
        </Field>
        <Field label="Tracking number" className={charged ? undefined : 'col-span-2'}>
          <Input key={costKey} name="trackingNumber" autoComplete="off" />
        </Field>
      </div>
      <datalist id="carriers">{CARRIERS.map((c) => <option key={c} value={c} />)}</datalist>
    </div>
  )
}
