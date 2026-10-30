'use client'

import { useState } from 'react'
import { ActionForm, SubmitButton } from './forms'
import { Button, Field, Input, MoneyInput, Select } from './ui'
import { sellProductAction } from '@/app/actions/products'
import { centsToInput } from '@/lib/money'

export type ProductOption = { id: number; name: string; priceCents: number; canBuild: number; hasParts: boolean }

// Puts a product on a job: one billed line, with its parts taken from stock.
export function SellProductForm({ products, jobId, today, onDone }: {
  products: ProductOption[]
  jobId: number
  today: string
  onDone: () => void
}) {
  const [productId, setProductId] = useState(products.length === 1 ? String(products[0].id) : '')
  const [quantity, setQuantity] = useState('1')
  const [price, setPrice] = useState<string | null>(null)
  const product = products.find((p) => String(p.id) === productId)
  const qty = Math.max(1, Math.floor(Number(quantity)) || 1)
  return (
    <ActionForm action={sellProductAction} onSuccess={onDone} className="space-y-3">
      <input type="hidden" name="jobId" value={jobId} />
      <Field label="Product">
        <Select name="productId" value={productId} onChange={(e) => { setProductId(e.target.value); setPrice(null) }} required>
          <option value="">Pick a product…</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}{p.hasParts ? ` (can make ${p.canBuild})` : ''}</option>)}
        </Select>
      </Field>
      <div className="grid grid-cols-[5rem_1fr_9rem] gap-3">
        <Field label="How many">
          <Input name="quantity" value={quantity} onChange={(e) => { setQuantity(e.target.value); setPrice(null) }} inputMode="numeric" required />
        </Field>
        <Field label="Bill customer">
          <MoneyInput name="price" value={price ?? (product ? centsToInput(product.priceCents * qty) : '')} onChange={(e) => setPrice(e.target.value)} required />
        </Field>
        <Field label="Parts used on"><Input type="date" name="usedOn" defaultValue={today} required /></Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <SubmitButton>Add product</SubmitButton>
      </div>
    </ActionForm>
  )
}
