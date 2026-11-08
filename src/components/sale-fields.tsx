'use client'

import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { Input, MoneyInput } from './ui'

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

// The label is a cost on the sale. costKey clears the amount between sales.
export function ShippingLabelFields({ carrier, onCarrier, costKey }: { carrier: string; onCarrier: (v: string) => void; costKey?: string }) {
  return (
    <div>
      <span className="mb-1 block text-sm font-medium text-fg-muted">Shipping label</span>
      <div className="grid grid-cols-[1fr_8rem] gap-3">
        <Input name="carrier" value={carrier} onChange={(e) => onCarrier(e.target.value)} list="carriers" aria-label="Carrier" />
        <MoneyInput key={costKey} name="shipping" placeholder="Cost" aria-label="Label cost" />
      </div>
      <datalist id="carriers">{CARRIERS.map((c) => <option key={c} value={c} />)}</datalist>
      <div className="mt-1 text-xs text-fg-subtle">Entered as a purchase on the sale, so it counts against this sale’s profit.</div>
    </div>
  )
}
