'use client'

import { useState } from 'react'
import { ActionForm, SubmitButton } from './forms'
import { Button, Field, Input, MoneyInput, Select } from './ui'
import { takeFromStockAction } from '@/app/actions/stock'
import { formatMoney, formatQuantity, parseQuantity, withMarkup } from '@/lib/money'
import type { JobOption } from '@/server/pickers'
import type { StockGroup } from '@/server/stock'

export type StockOption = StockGroup

export function stockOptionLabel(s: StockOption) {
  return `${s.label}${s.partNumber ? ` #${s.partNumber}` : ''} (${formatQuantity(s.quantityHundredths)} left)`
}

// What using qty costs, oldest receipts first (mirrors takeFifo on the server).
function fifoCost(item: StockOption, qty: number) {
  let need = Math.min(qty, item.quantityHundredths)
  let cents = 0
  for (const lot of item.lots) {
    if (need <= 0) break
    const q = Math.min(need, lot.quantityHundredths)
    cents += Math.round((lot.allocatedCents * q) / lot.quantityHundredths)
    need -= q
  }
  return cents
}

// Puts some of a stock item on a job. From the Stock page pass the one item
// and `jobs` to pick from; from a job pass every item and its `jobId`.
export function UseStockForm({ items, jobs, jobId, today, markupPct, onDone }: {
  items: StockOption[]
  jobs?: JobOption[]
  jobId?: number
  today: string
  markupPct: number
  onDone: () => void
}) {
  const [key, setKey] = useState(items.length === 1 ? items[0].key : '')
  const item = items.find((i) => i.key === key)
  const [qty, setQty] = useState(item ? formatQuantity(Math.min(100, item.quantityHundredths)) : '')
  const [bill, setBill] = useState(true)
  const [billed, setBilled] = useState<string | null>(null)
  const used = parseQuantity(qty)
  const costCents = item && used != null ? fifoCost(item, used) : null
  const suggested = costCents != null ? (withMarkup(costCents, markupPct) / 100).toFixed(2) : ''
  return (
    <ActionForm action={takeFromStockAction} onSuccess={onDone} className="space-y-3">
      <input type="hidden" name="usedOn" value={today} />
      {jobId != null && <input type="hidden" name="jobId" value={jobId} />}
      {jobs ? <input type="hidden" name="stockKey" value={key} /> : (
        <Field label="From stock">
          <Select name="stockKey" value={key} required onChange={(e) => {
            setKey(e.target.value)
            const next = items.find((i) => i.key === e.target.value)
            setQty(next ? formatQuantity(Math.min(100, next.quantityHundredths)) : '')
            setBilled(null)
          }}>
            <option value="">Pick an item…</option>
            {items.map((i) => <option key={i.key} value={i.key}>{stockOptionLabel(i)}</option>)}
          </Select>
        </Field>
      )}
      {jobs && (
        <Field label="Job">
          <Select name="jobId" required defaultValue="">
            <option value="">Pick a job…</option>
            {jobs.map((j) => <option key={j.id} value={j.id}>{j.label} — {j.sub}</option>)}
          </Select>
        </Field>
      )}
      <div className="grid grid-cols-[6rem_1fr] gap-3">
        <Field label="Qty used" hint={item ? `of ${formatQuantity(item.quantityHundredths)}` : undefined}>
          <Input name="quantity" value={qty} onChange={(e) => { setQty(e.target.value); setBilled(null) }} inputMode="decimal" required />
        </Field>
        <Field label="Cost" hint="With its share of tax and shipping">
          <div className="flex h-10 items-center text-sm tabular">{costCents != null ? formatMoney(costCents) : '—'}</div>
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="bill" value="1" checked={bill} onChange={(e) => setBill(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
          Bill it to the customer
        </label>
        {bill && (
          <>
            <MoneyInput name="billed" className="w-36" value={billed ?? suggested} onChange={(e) => setBilled(e.target.value)} aria-label="Billed price" />
            <span className="text-xs text-fg-subtle">{markupPct}% markup</span>
          </>
        )}
      </div>
      {bill && <input type="hidden" name="description" value={item?.label ?? ''} />}
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <SubmitButton>Use on job</SubmitButton>
      </div>
    </ActionForm>
  )
}
