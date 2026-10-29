'use client'

import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { ActionForm, SubmitButton } from './forms'
import { FileInput } from './file-input'
import { Button, Card, cx, Field, Input, MoneyInput, Notice, Select, Textarea } from './ui'
import { createPurchaseAction, updatePurchaseAction } from '@/app/actions/purchases'
import { formatMoney, parseMoney, parseQuantity, withMarkup } from '@/lib/money'
import type { PurchaseFormData } from '@/server/pickers'

type Kind = 'job' | 'category' | 'stock' | 'asset' | null

export type LineState = {
  key: string
  id?: number | null
  description: string
  partNumber: string
  quantity: string
  amount: string
  kind: Kind
  jobId: string
  categoryId: string
  businessUse: string
  bill: boolean
  billed: string
  billedTouched: boolean
  contract: boolean
  payee: string
}

export type PurchaseInitial = {
  id: number
  vendor: string
  purchasedOn: string
  method: string
  tax: string
  shipping: string
  notes: string
  lines: LineState[]
}

let keySeq = 0
export function newLine(partial: Partial<LineState> = {}): LineState {
  return {
    key: `l${++keySeq}`, description: '', partNumber: '', quantity: '1', amount: '', kind: null, jobId: '', categoryId: '', businessUse: '100',
    bill: true, billed: '', billedTouched: false, contract: false, payee: '', ...partial,
  }
}

export function PurchaseForm({ data, today, initial, presetJobId, presetStock, returnTo }: {
  data: PurchaseFormData
  today: string
  initial?: PurchaseInitial
  presetJobId?: number | null
  presetStock?: boolean
  returnTo?: string
}) {
  const editing = Boolean(initial)
  const [vendor, setVendor] = useState(initial?.vendor ?? '')
  const [total, setTotal] = useState(initial && initial.lines.length === 1 ? initial.lines[0].amount : '')
  const [split, setSplit] = useState(Boolean(initial && (initial.lines.length > 1 || initial.tax || initial.shipping)))
  const [lines, setLines] = useState<LineState[]>(() => initial?.lines ?? [newLine(presetJobId ? { kind: 'job', jobId: String(presetJobId) } : presetStock ? { kind: 'stock' } : {})])
  const [tax, setTax] = useState(initial?.tax ?? '')
  const [shipping, setShipping] = useState(initial?.shipping ?? '')
  const [more, setMore] = useState(Boolean(initial?.method || initial?.notes))

  const catById = useMemo(() => new Map(data.categories.map((c) => [String(c.id), c])), [data.categories])
  const update = (key: string, patch: Partial<LineState>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? withBilled({ ...l, ...patch }) : l)))
  const withBilled = (l: LineState): LineState => {
    if (l.billedTouched || l.id) return l
    const c = parseMoney(split ? l.amount : total)
    return { ...l, billed: c != null ? (withMarkup(c, data.markupPct) / 100).toFixed(2) : '' }
  }

  function pickVendor(v: string) {
    setVendor(v)
    const known = data.vendors.find((x) => x.vendor.toLowerCase() === v.trim().toLowerCase())
    if (known?.categoryId && !split && lines[0].kind == null) {
      update(lines[0].key, { kind: 'category', categoryId: String(known.categoryId) })
    }
  }

  const sum = lines.reduce((a, l) => a + (parseMoney(l.amount) ?? 0), 0) + (parseMoney(tax) ?? 0) + (parseMoney(shipping) ?? 0)
  const receiptTotal = parseMoney(total)

  function serialize() {
    const out = lines.map((l) => {
      const amountCents = parseMoney(split ? l.amount : total)
      if (amountCents == null) throw new Error(split ? 'Enter an amount on each line' : 'Enter the total')
      const quantityHundredths = parseQuantity(l.quantity)
      if (quantityHundredths == null) throw new Error(split ? 'Enter a quantity on each line' : 'Enter a quantity')
      if (l.kind == null) throw new Error('Choose what it was for: a job, the shop, stock or equipment')
      const target = l.kind === 'job'
        ? {
          kind: 'job' as const,
          jobId: Number(l.jobId),
          bill: !l.id && l.bill && !l.contract && parseMoney(l.billed) != null
            ? { amountCents: parseMoney(l.billed)!, description: l.description || vendor }
            : null,
        }
        : l.kind === 'category'
          ? { kind: 'category' as const, categoryId: Number(l.categoryId) }
          : l.kind === 'stock'
            ? { kind: 'stock' as const }
            : { kind: 'asset' as const, businessUsePct: Number(l.businessUse) || 100, description: l.description || null }
      if (l.kind === 'job' && !l.jobId) throw new Error('Pick the job')
      if (l.kind === 'category' && !l.categoryId) throw new Error('Pick a category')
      const payee = l.contract || catById.get(l.categoryId)?.line === '11' ? l.payee : ''
      return {
        id: l.id ?? null, description: l.description || null, partNumber: l.partNumber || null,
        quantityHundredths, amountCents, target, payee: payee || null,
      }
    })
    return JSON.stringify(out)
  }

  let serialized = ''
  let problem: string | null = null
  try {
    serialized = serialize()
  } catch (e) {
    problem = (e as Error).message
  }

  return (
    <ActionForm action={editing ? updatePurchaseAction : createPurchaseAction} validate={() => problem}>
      {initial && <input type="hidden" name="id" value={initial.id} />}
      {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
      <input type="hidden" name="lines" value={serialized} />
      {!split && <><input type="hidden" name="tax" value="" /><input type="hidden" name="shipping" value="" /></>}
      <Card className="space-y-4 p-4">
        <FileInput name="receipt" label={editing ? 'Add receipt photo' : 'Snap the receipt'} />

        <div className="grid grid-cols-2 gap-3">
          <Field label="Vendor" className="col-span-2 sm:col-span-1">
            <Input name="vendor" list="vendor-list" value={vendor} onChange={(e) => pickVendor(e.target.value)} placeholder="Summit Racing, Airgas…" required autoComplete="off" />
            <datalist id="vendor-list">{data.vendors.map((v) => <option key={v.vendor} value={v.vendor} />)}</datalist>
          </Field>
          <Field label="Date">
            <Input type="date" name="purchasedOn" defaultValue={initial?.purchasedOn ?? today} required />
          </Field>
          {!split && (
            <Field label="Total">
              <MoneyInput value={total} onChange={(e) => { setTotal(e.target.value); setLines((ls) => ls.map(withBilledFor(e.target.value))) }} required />
            </Field>
          )}
        </div>

        {lines.map((l, i) => (
          <LineEditor
            key={l.key}
            line={l}
            index={i}
            split={split}
            data={data}
            catById={catById}
            totalCents={parseMoney(split ? l.amount : total)}
            onChange={(patch) => update(l.key, patch)}
            onRemove={lines.length > 1 ? () => setLines((ls) => ls.filter((x) => x.key !== l.key)) : undefined}
          />
        ))}

        {split ? (
          <div className="space-y-3">
            <Button size="sm" onClick={() => setLines((ls) => [...ls, newLine()])}><Plus size={14} />Line</Button>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Tax"><MoneyInput name="tax" value={tax} onChange={(e) => setTax(e.target.value)} /></Field>
              <Field label="Shipping"><MoneyInput name="shipping" value={shipping} onChange={(e) => setShipping(e.target.value)} /></Field>
              <Field label="Receipt total" hint="To check against">
                <MoneyInput value={total} onChange={(e) => setTotal(e.target.value)} />
              </Field>
            </div>
            <div className="text-sm text-fg-muted">
              Lines + tax + shipping = <span className="font-medium text-fg">{formatMoney(sum)}</span>
              {receiptTotal != null && receiptTotal !== sum && (
                <span className="text-warn"> · {formatMoney(receiptTotal - sum)} {receiptTotal > sum ? 'not assigned yet' : 'over the receipt'}</span>
              )}
            </div>
            <div className="text-xs text-fg-subtle">Tax and shipping are spread across the lines by amount.</div>
          </div>
        ) : (
          <button type="button" className="text-sm text-fg-muted hover:text-fg" onClick={() => {
            setSplit(true)
            setLines((ls) => ls.map((l) => ({ ...l, amount: total })))
          }}>
            Split across jobs or categories…
          </button>
        )}

        {more ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Paid with"><Input name="method" defaultValue={initial?.method} placeholder="Business card, cash…" /></Field>
            <Field label="Notes" className="sm:col-span-2"><Textarea name="notes" defaultValue={initial?.notes} rows={2} /></Field>
          </div>
        ) : (
          <button type="button" className="ml-4 text-sm text-fg-muted hover:text-fg" onClick={() => setMore(true)}>Payment method, notes…</button>
        )}
      </Card>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {!editing && <SubmitButton variant="secondary" size="lg" name="another" value="1">Save and add another</SubmitButton>}
        <SubmitButton size="lg">{editing ? 'Save' : 'Save purchase'}</SubmitButton>
      </div>
    </ActionForm>
  )

  function withBilledFor(totalValue: string) {
    return (l: LineState): LineState => {
      if (l.billedTouched || l.id) return l
      const c = parseMoney(totalValue)
      return { ...l, billed: c != null ? (withMarkup(c, data.markupPct) / 100).toFixed(2) : '' }
    }
  }
}

function QuantityFields({ line, totalCents, onChange }: {
  line: LineState
  totalCents: number | null
  onChange: (patch: Partial<LineState>) => void
}) {
  const qty = parseQuantity(line.quantity)
  return (
    <div className="grid grid-cols-[1fr_6rem] gap-3">
      <Field label="Part number">
        <Input value={line.partNumber} onChange={(e) => onChange({ partNumber: e.target.value })} placeholder="Optional" autoComplete="off" />
      </Field>
      <Field label="Qty" hint={qty != null && qty !== 100 && totalCents != null ? `${formatMoney(Math.round((totalCents * 100) / qty))} each` : undefined}>
        <Input value={line.quantity} onChange={(e) => onChange({ quantity: e.target.value })} inputMode="decimal" required />
      </Field>
    </div>
  )
}

function LineEditor({ line, index, split, data, catById, totalCents, onChange, onRemove }: {
  line: LineState
  index: number
  split: boolean
  data: PurchaseFormData
  catById: Map<string, PurchaseFormData['categories'][number]>
  totalCents: number | null
  onChange: (patch: Partial<LineState>) => void
  onRemove?: () => void
}) {
  const openJobs = data.jobs.filter((j) => j.open)
  const recentJobs = data.jobs.filter((j) => !j.open)
  const cat = catById.get(line.categoryId)
  const bigForShop = line.kind === 'category' && totalCents != null && totalCents >= data.assetThresholdCents
  return (
    <div className={cx(split && 'rounded-lg border border-line p-3', 'space-y-3')}>
      {split && (
        <div className="flex items-end gap-2">
          <Field label={`Line ${index + 1}`} className="flex-1">
            <Input value={line.description} onChange={(e) => onChange({ description: e.target.value })} placeholder="What was it" />
          </Field>
          <Field label="Amount" className="w-32">
            <MoneyInput value={line.amount} onChange={(e) => onChange({ amount: e.target.value })} />
          </Field>
          {onRemove && <Button variant="ghost" onClick={onRemove} aria-label="Remove line"><Trash2 size={16} /></Button>}
        </div>
      )}
      <div>
        <span className="mb-1 block text-sm font-medium text-fg-muted">What was it for?</span>
        <div className="grid grid-cols-4 gap-2">
          {([['job', 'A job'], ['category', 'The shop'], ['stock', 'Stock'], ['asset', 'Equipment']] as const).map(([k, label]) => (
            <button key={k} type="button" onClick={() => onChange({ kind: k })}
              className={cx('h-10 rounded-lg border text-sm',
                line.kind === k ? 'border-accent bg-accent-soft font-medium text-accent' : 'border-line bg-surface text-fg-muted hover:bg-hover')}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {line.kind === 'job' && (
        <div className="space-y-3">
          <Select value={line.jobId} onChange={(e) => onChange({ jobId: e.target.value })} required>
            <option value="">Pick a job…</option>
            {openJobs.length > 0 && (
              <optgroup label="Open">
                {openJobs.map((j) => <option key={j.id} value={j.id}>{j.label} — {j.sub}</option>)}
              </optgroup>
            )}
            {recentJobs.length > 0 && (
              <optgroup label="Recent">
                {recentJobs.map((j) => <option key={j.id} value={j.id}>{j.label} — {j.sub}</option>)}
              </optgroup>
            )}
          </Select>
          {!split && (
            <Input value={line.description} onChange={(e) => onChange({ description: e.target.value })} placeholder="What was it (shows on the invoice)" />
          )}
          {!line.id && !line.contract && (
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={line.bill} onChange={(e) => onChange({ bill: e.target.checked })} className="h-4 w-4 accent-[var(--accent)]" />
                Bill it to the customer
              </label>
              {line.bill && (
                <MoneyInput className="w-36" value={line.billed} onChange={(e) => onChange({ billed: e.target.value, billedTouched: true })} aria-label="Billed price" />
              )}
              {line.bill && <span className="text-xs text-fg-subtle">{data.markupPct}% markup</span>}
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-fg-muted">
            <input type="checkbox" checked={line.contract} onChange={(e) => onChange({ contract: e.target.checked })} className="h-4 w-4 accent-[var(--accent)]" />
            Subcontracted labor (paint, machining…)
          </label>
          {line.contract && (
            <Input value={line.payee} onChange={(e) => onChange({ payee: e.target.value })} placeholder="Paid to (for the 1099 list)" />
          )}
        </div>
      )}

      {line.kind === 'category' && (
        <div className="space-y-3">
          <Select value={line.categoryId} onChange={(e) => onChange({ categoryId: e.target.value })} required>
            <option value="">Pick a category…</option>
            {data.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          {cat?.line === '11' && (
            <Input value={line.payee} onChange={(e) => onChange({ payee: e.target.value })} placeholder="Paid to (for the 1099 list)" />
          )}
          {!split && (
            <Input value={line.description} onChange={(e) => onChange({ description: e.target.value })} placeholder="What was it (optional)" />
          )}
          {bigForShop && (
            <Notice>
              Over {formatMoney(data.assetThresholdCents, { whole: true })} for one item? It’s probably equipment.{' '}
              <button type="button" className="underline" onClick={() => onChange({ kind: 'asset' })}>Make it equipment</button>
            </Notice>
          )}
        </div>
      )}

      {line.kind === 'stock' && (
        <div className="space-y-3">
          {!split && (
            <Input value={line.description} onChange={(e) => onChange({ description: e.target.value })} placeholder="What was it (2.5in mandrel bends…)" required />
          )}
          <div className="text-xs text-fg-subtle">Materials for future jobs. Put them on a job from the Stock page or the job when you use them.</div>
        </div>
      )}

      {line.kind === 'asset' && (
        <div className="grid grid-cols-[1fr_7rem] gap-3">
          {!split
            ? <Field label="Item"><Input value={line.description} onChange={(e) => onChange({ description: e.target.value })} placeholder="Lathe, TIG welder…" required /></Field>
            : <div />}
          <Field label="Business use">
            <div className="relative">
              <Input value={line.businessUse} onChange={(e) => onChange({ businessUse: e.target.value.replace(/\D/g, '') })} inputMode="numeric" className="pr-7" />
              <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-fg-subtle">%</span>
            </div>
          </Field>
          <div className="col-span-2 text-xs text-fg-subtle">Goes on the equipment list for depreciation. Lower the % if you also use it for personal projects.</div>
        </div>
      )}

      {line.kind != null && <QuantityFields line={line} totalCents={totalCents} onChange={onChange} />}
    </div>
  )
}
