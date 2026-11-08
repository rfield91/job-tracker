'use client'

import { useState } from 'react'
import { ActionForm, SubmitButton } from '@/components/forms'
import { BuyerPicker, ShippingFields, type BuyerOption } from '@/components/sale-fields'
import { Card, Field, Input, LinkButton, MoneyInput, Notice, Select, Textarea } from '@/components/ui'
import type { ProductOption } from '@/components/sell-product'
import { saleFromPaymentAction } from '@/app/actions/products'
import { centsToInput, formatMoney, parseMoney } from '@/lib/money'

const OTHER = 'other'

// The payment is what really came in, so the price starts as whatever's left
// of it after any shipping the buyer was charged.
export function PaymentSaleForm({ paymentId, amountCents, receivedOn, products, customers, buyer, buyerName, buyerEmail }: {
  paymentId: number
  amountCents: number
  receivedOn: string
  products: ProductOption[]
  customers: BuyerOption[]
  buyer: BuyerOption | null
  buyerName: string
  buyerEmail: string
}) {
  const [choice, setChoice] = useState(products.length === 0 ? OTHER : products.length === 1 ? String(products[0].id) : '')
  const [quantity, setQuantity] = useState('1')
  const [price, setPrice] = useState<string | null>(null)
  const [shippingBilled, setShippingBilled] = useState('')
  const [carrier, setCarrier] = useState('USPS')

  const product = products.find((p) => String(p.id) === choice)
  const qty = Math.max(1, Math.floor(Number(quantity)) || 1)
  const billedShipping = parseMoney(shippingBilled) ?? 0
  const priceText = price ?? centsToInput(Math.max(0, amountCents - billedShipping))
  const total = (parseMoney(priceText) ?? 0) + billedShipping
  const short = product?.hasParts && product.canBuild < qty

  return (
    <ActionForm action={saleFromPaymentAction}>
      <input type="hidden" name="paymentId" value={paymentId} />
      <Card className="space-y-4 p-4">
        <div className="grid grid-cols-[1fr_9rem] gap-3">
          <Field label="Product">
            <Select name={choice === OTHER ? undefined : 'productId'} value={choice} onChange={(e) => setChoice(e.target.value)} required>
              <option value="">Pick a product…</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}{p.hasParts ? ` (can make ${p.canBuild})` : ''}</option>)}
              <option value={OTHER}>Something else…</option>
            </Select>
          </Field>
          <Field label="Sold on"><Input type="date" name="soldOn" defaultValue={receivedOn} required /></Field>
        </div>
        {choice === OTHER && <Field label="What was sold"><Input name="description" required autoFocus /></Field>}
        <div className="grid grid-cols-[5rem_1fr] gap-3">
          <Field label="How many">
            <Input name="quantity" value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="numeric" required />
          </Field>
          <Field label="Price" hint="The payment, less any shipping charged">
            <MoneyInput name="price" value={priceText} onChange={(e) => setPrice(e.target.value)} required />
          </Field>
        </div>
        {short && (
          <Notice>Stock only covers {product.canBuild}. Add the parts you bought for it to stock first, or the sale won’t save.</Notice>
        )}

        <BuyerPicker customers={customers} initial={buyer} initialName={buyerName} initialEmail={buyerEmail} />
        <ShippingFields carrier={carrier} onCarrier={setCarrier} charged={{ value: shippingBilled, onChange: setShippingBilled }} />
        {total !== amountCents && (
          <Notice>This comes to {formatMoney(total)} but the payment is {formatMoney(amountCents)}, so the sale won’t balance.</Notice>
        )}
        <Field label="Notes"><Textarea name="notes" /></Field>
      </Card>
      <div className="mt-4 flex justify-end gap-2">
        <LinkButton href="/payments/unmatched" size="lg">Cancel</LinkButton>
        <SubmitButton size="lg">Make it a sale</SubmitButton>
      </div>
    </ActionForm>
  )
}
