'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { ActionForm, SubmitButton } from '@/components/forms'
import { Card, Field, Input, MoneyInput, Notice, Select, Textarea } from '@/components/ui'
import type { ProductOption } from '@/components/sell-product'
import { quickSaleAction } from '@/app/actions/products'
import { centsToInput, parseMoney } from '@/lib/money'
import type { PaymentMethod } from '@/db/schema'

type CustomerOption = { id: number; name: string; phone: string | null }

const METHODS: [PaymentMethod, string][] = [
  ['paypal', 'PayPal'], ['venmo', 'Venmo'], ['zelle', 'Zelle'], ['card', 'Card (other)'],
  ['cash', 'Cash'], ['check', 'Check'], ['other', 'Other'],
]
const CARRIERS = ['USPS', 'UPS', 'FedEx', 'Pirate Ship']

// Entering a run of sales: the date, product, carrier and payment method stay
// as they were after saving; the buyer and amounts clear for the next one.
export function QuickSaleForm({ products, customers, today, initialProductId }: {
  products: ProductOption[]
  customers: CustomerOption[]
  today: string
  initialProductId: number | null
}) {
  const [round, setRound] = useState(0)
  const [saved, setSaved] = useState<{ id: number; message: string } | null>(null)
  const [soldOn, setSoldOn] = useState(today)
  const [productId, setProductId] = useState(initialProductId ? String(initialProductId) : '')
  const [quantity, setQuantity] = useState('1')
  const [price, setPrice] = useState<string | null>(null)
  const [carrier, setCarrier] = useState('USPS')
  const [method, setMethod] = useState<PaymentMethod>('paypal')
  const [paid, setPaid] = useState(true)
  const [amount, setAmount] = useState<string | null>(null)

  const product = products.find((p) => String(p.id) === productId)
  const qty = Math.max(1, Math.floor(Number(quantity)) || 1)
  const priceText = price ?? (product ? centsToInput(product.priceCents * qty) : '')
  const amountText = amount ?? priceText
  const short = product?.hasParts && product.canBuild < qty

  return (
    <ActionForm action={quickSaleAction} onSuccess={(s) => {
      setSaved(s?.id ? { id: s.id, message: s.message ?? 'Saved' } : null)
      setRound((r) => r + 1)
      setQuantity('1')
      setPrice(null)
      setAmount(null)
    }}>
      {saved && (
        <Notice tone="good" className="mb-4">
          {saved.message}. <Link href={`/jobs/${saved.id}`} className="underline">Open it</Link> or enter the next sale.
        </Notice>
      )}
      <Card className="space-y-4 p-4">
        <div className="grid grid-cols-[1fr_9rem] gap-3">
          <Field label="Product">
            <Select name="productId" value={productId} onChange={(e) => { setProductId(e.target.value); setPrice(null); setAmount(null) }} required>
              <option value="">Pick a product…</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}{p.hasParts ? ` (can make ${p.canBuild})` : ''}</option>)}
            </Select>
          </Field>
          <Field label="Sold on"><Input type="date" name="soldOn" value={soldOn} onChange={(e) => setSoldOn(e.target.value)} required /></Field>
        </div>
        <div className="grid grid-cols-[5rem_1fr] gap-3">
          <Field label="How many">
            <Input name="quantity" value={quantity} onChange={(e) => { setQuantity(e.target.value); setPrice(null); setAmount(null) }} inputMode="numeric" required />
          </Field>
          <Field label="Price" hint="Including any shipping you charged">
            <MoneyInput name="price" value={priceText} onChange={(e) => { setPrice(e.target.value); setAmount(null) }} required />
          </Field>
        </div>
        {short && (
          <Notice>Stock only covers {product.canBuild}. Add the parts you bought for it to stock first, or the sale won’t save.</Notice>
        )}

        <BuyerPicker key={`buyer-${round}`} customers={customers} />

        <div>
          <span className="mb-1 block text-sm font-medium text-fg-muted">Shipping label</span>
          <div className="grid grid-cols-[1fr_8rem] gap-3">
            <Input name="carrier" value={carrier} onChange={(e) => setCarrier(e.target.value)} list="carriers" aria-label="Carrier" />
            <MoneyInput key={`ship-${round}`} name="shipping" placeholder="Cost" aria-label="Label cost" />
          </div>
          <datalist id="carriers">{CARRIERS.map((c) => <option key={c} value={c} />)}</datalist>
          <div className="mt-1 text-xs text-fg-subtle">Entered as a purchase on the sale, so it counts against this sale’s profit.</div>
        </div>

        <div>
          <label className="mb-2 flex items-center gap-2 text-sm font-medium text-fg-muted">
            <input type="checkbox" name="paid" value="1" checked={paid} onChange={(e) => setPaid(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
            Paid on the sale date
          </label>
          {paid && (
            <div className="grid grid-cols-3 gap-3">
              <Field label="Amount"><MoneyInput name="amount" value={amountText} onChange={(e) => setAmount(e.target.value)} required /></Field>
              <Field label="Method">
                <Select name="method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                  {METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select>
              </Field>
              <Field label="Fee taken"><MoneyInput key={`fee-${round}`} name="fee" placeholder="0.00" /></Field>
              <Field label="Note" className="col-span-3">
                <Input key={`note-${round}`} name="paymentNote" placeholder="Order or transaction number" />
              </Field>
            </div>
          )}
        </div>

        <Field label="Notes"><Textarea key={`notes-${round}`} name="notes" /></Field>
      </Card>
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-sm text-fg-muted">
          {paid && parseMoney(amountText) != null && parseMoney(priceText) != null && parseMoney(amountText) !== parseMoney(priceText)
            ? 'The payment doesn’t match the price, so the sale stays unpaid for the difference.' : ''}
        </span>
        <SubmitButton size="lg">Save sale</SubmitButton>
      </div>
    </ActionForm>
  )
}

function BuyerPicker({ customers }: { customers: CustomerOption[] }) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<CustomerOption | null>(null)
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
            <Input name="customerEmail" type="email" placeholder="Email (optional)" />
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
