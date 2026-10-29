'use client'

import { useState } from 'react'
import { Field, Input, MoneyInput, Select } from './ui'
import type { PaymentMethod, PaymentPurpose } from '@/db/schema'

const PURPOSES: [PaymentPurpose, string][] = [['deposit', 'Deposit'], ['progress', 'Progress'], ['final', 'Final'], ['refund', 'Refund']]
const METHODS: [PaymentMethod, string][] = [
  ['cash', 'Cash'], ['check', 'Check'], ['venmo', 'Venmo'], ['paypal', 'PayPal'], ['zelle', 'Zelle'],
  ['card', 'Card (other)'], ['other', 'Other'],
]

export function PaymentFields({ today, defaults }: {
  today: string
  defaults?: { amount?: string; purpose?: PaymentPurpose; method?: PaymentMethod; receivedOn?: string; fee?: string; note?: string }
}) {
  const [method, setMethod] = useState<PaymentMethod>(defaults?.method ?? 'cash')
  const feeLikely = method === 'paypal' || method === 'venmo' || method === 'card' || method === 'stripe'
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Amount">
        <MoneyInput name="amount" defaultValue={defaults?.amount} required autoFocus />
      </Field>
      <Field label="For">
        <Select name="purpose" defaultValue={defaults?.purpose ?? 'final'}>
          {PURPOSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
      </Field>
      <Field label="Method">
        <Select name="method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
          {defaults?.method === 'stripe' && <option value="stripe">Stripe</option>}
          {METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
      </Field>
      <Field label="Date">
        <Input type="date" name="receivedOn" defaultValue={defaults?.receivedOn ?? today} required />
      </Field>
      {feeLikely || defaults?.fee ? (
        <Field label="Fee taken" hint="PayPal / Venmo business fee, if any">
          <MoneyInput name="fee" defaultValue={defaults?.fee} />
        </Field>
      ) : null}
      <Field label="Note" className={feeLikely || defaults?.fee ? '' : 'col-span-2'}>
        <Input name="note" defaultValue={defaults?.note} placeholder="Check #, etc." />
      </Field>
    </div>
  )
}
