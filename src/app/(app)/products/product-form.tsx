'use client'

import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { ActionButton, ActionForm, SubmitButton } from '@/components/forms'
import { Card, Field, Input, LinkButton, MoneyInput, Select, Textarea } from '@/components/ui'
import { deleteProductAction, saveProductAction } from '@/app/actions/products'
import { centsToInput, formatQuantity } from '@/lib/money'

export type StockChoice = { key: string; label: string; partNumber: string | null; quantityHundredths: number }
type PartRow = { id: number; key: string; label: string; qty: string }

let nextId = 1

export function ProductForm({ stock, product }: {
  stock: StockChoice[]
  product?: {
    id: number; name: string; priceCents: number; notes: string | null; active: boolean
    parts: { stockKey: string; label: string; quantityHundredths: number }[]
  }
}) {
  const [parts, setParts] = useState<PartRow[]>(() => product?.parts.length
    ? product.parts.map((p) => ({ id: nextId++, key: p.stockKey, label: p.label, qty: formatQuantity(p.quantityHundredths) }))
    : [{ id: nextId++, key: '', label: '', qty: '1' }])
  // Parts already on the product but with none left on the shelf.
  const missing = (product?.parts ?? []).filter((p) => !stock.some((s) => s.key === p.stockKey))
  const choices = [
    ...stock.map((s) => ({ key: s.key, label: s.label, text: `${s.label}${s.partNumber ? ` #${s.partNumber}` : ''} (${formatQuantity(s.quantityHundredths)} on hand)` })),
    ...missing.map((p) => ({ key: p.stockKey, label: p.label, text: `${p.label} (none on hand)` })),
  ]
  const set = (id: number, patch: Partial<PartRow>) => setParts((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)))

  return (
    <>
      <ActionForm action={saveProductAction}>
        {product && <input type="hidden" name="id" value={product.id} />}
        <Card className="space-y-4 p-4">
          <div className="grid grid-cols-[1fr_8rem] gap-3">
            <Field label="Name"><Input name="name" defaultValue={product?.name} placeholder="NC/RX8 Splitter Brackets" required autoFocus={!product} /></Field>
            <Field label="Price"><MoneyInput name="price" defaultValue={centsToInput(product?.priceCents)} required /></Field>
          </div>
          <div>
            <span className="mb-1 block text-sm font-medium text-fg-muted">Stock parts in one</span>
            <div className="space-y-2">
              {parts.map((p) => (
                <div key={p.id} className="grid grid-cols-[1fr_4.5rem_auto] items-center gap-2">
                  <Select name="partKey" value={p.key} aria-label="Stock item"
                    onChange={(e) => set(p.id, { key: e.target.value, label: choices.find((c) => c.key === e.target.value)?.label ?? '' })}>
                    <option value="">Pick a stock item…</option>
                    {choices.map((c) => <option key={c.key} value={c.key}>{c.text}</option>)}
                  </Select>
                  <input type="hidden" name="partLabel" value={p.label} />
                  <Input name="partQty" value={p.qty} onChange={(e) => set(p.id, { qty: e.target.value })} inputMode="decimal" aria-label="How many in one" />
                  <button type="button" onClick={() => setParts((ps) => ps.filter((x) => x.id !== p.id))}
                    className="text-fg-subtle hover:text-fg" aria-label="Remove part"><X size={16} /></button>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setParts((ps) => [...ps, { id: nextId++, key: '', label: '', qty: '1' }])}
              className="mt-2 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"><Plus size={14} />Another part</button>
            <div className="mt-2 text-xs text-fg-subtle">
              Parts come from Stock, matched by part number. Hardware bought by the pack can be a part too: 8 bolts from a
              100-pack is 0.08. Loose hardware from the bin can stay in Shop supplies.
            </div>
          </div>
          <Field label="Notes"><Textarea name="notes" defaultValue={product?.notes ?? ''} /></Field>
          {product && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="retired" value="1" defaultChecked={!product.active} className="h-4 w-4 accent-[var(--accent)]" />
              No longer sold (hides it from new sales)
            </label>
          )}
        </Card>
        <div className="mt-4 flex justify-end gap-2">
          <LinkButton href="/products">Cancel</LinkButton>
          <SubmitButton>{product ? 'Save' : 'Add product'}</SubmitButton>
        </div>
      </ActionForm>
      {product && (
        <div className="mt-3">
          <ActionButton action={deleteProductAction} fields={{ id: product.id }} variant="danger" size="md"
            confirm="Delete this product? Sales already entered keep their lines and costs.">
            Delete
          </ActionButton>
        </div>
      )}
    </>
  )
}
