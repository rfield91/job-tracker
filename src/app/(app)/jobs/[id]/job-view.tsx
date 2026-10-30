'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ExternalLink, Phone, Plus, Printer, Trash2 } from 'lucide-react'
import { ActionButton, ActionForm, SubmitButton } from '@/components/forms'
import { FileInput, Thumb } from '@/components/file-input'
import { PaymentFields } from '@/components/payment-fields'
import { Badge, Button, Card, CardHeader, cx, Field, Input, LinkButton, Money, MoneyInput, Notice, Select, Textarea } from '@/components/ui'
import {
  addLineAction, addPartAction, addPaymentAction, billCostAction, deleteFileAction, deleteJobAction, deleteLineAction,
  deletePaymentAction, recordPartPurchaseAction, saveTemplateAction, setStatusAction, updateJobAction, updateLineAction, updatePaymentAction,
  uploadJobPhotosAction,
} from '@/app/actions/jobs'
import { billStockUseAction, returnToStockAction } from '@/app/actions/stock'
import { requestPaymentAction, voidRequestAction } from '@/app/actions/stripe'
import { UseStockForm, type StockOption } from '@/components/use-stock'
import { SellProductForm, type ProductOption } from '@/components/sell-product'
import { formatDate } from '@/lib/dates'
import { centsToInput, formatMoney, formatQuantity, formatScaled, withMarkup } from '@/lib/money'
import { KIND_LABELS } from '@/lib/job-kinds'
import type { JobDetail } from '@/server/jobs'
import type { JobLine, JobStatus, Payment, PaymentPurpose } from '@/db/schema'

const STATUSES: [JobStatus, string][] = [['quote', 'Quote'], ['in_progress', 'In progress'], ['done', 'Done'], ['paid', 'Paid']]
const PURPOSE: Record<PaymentPurpose, string> = { deposit: 'Deposit', progress: 'Progress', final: 'Final', refund: 'Refund' }
const METHOD: Record<string, string> = {
  cash: 'Cash', check: 'Check', venmo: 'Venmo', paypal: 'PayPal', zelle: 'Zelle', stripe: 'Stripe', card: 'Card', other: 'Other',
}

type Adding = null | 'labor' | 'part' | 'stock' | 'product' | 'fee' | 'discount' | 'payment' | 'request'

export function JobView({ detail, number, today, laborRateCents, markupPct, stripe, customerHasEmail, stock, products }: {
  detail: JobDetail
  number: string
  today: string
  laborRateCents: number
  markupPct: number
  stripe: boolean
  customerHasEmail: boolean
  stock: StockOption[]
  products: ProductOption[]
}) {
  const { job, customer, vehicle, lines, costs, payments, requests, photos, receiptFiles, totals, vehiclesForCustomer } = detail
  const [adding, setAdding] = useState<Adding>(null)
  const [editingLine, setEditingLine] = useState<number | null>(null)
  const [editingPayment, setEditingPayment] = useState<number | null>(null)
  const [editingDetails, setEditingDetails] = useState(false)

  // Ordinary costs link to invoice lines by purchase line; stock uses carry
  // the invoice line they're billed on.
  const costById = new Map(costs.filter((c) => c.useId == null).map((c) => [c.id, c]))
  const billedCostIds = new Set(lines.map((l) => l.purchaseLineId).filter((x): x is number => x != null))
  const unbilled = costs.filter((c) => (c.useId != null ? c.jobLineId == null : !billedCostIds.has(c.id)))
  const costsFor = (l: JobLine) => l.purchaseLineId
    ? [costById.get(l.purchaseLineId)].filter((c) => c != null)
    : costs.filter((c) => c.useId != null && c.jobLineId === l.id)
  const groups: { title: string; rows: JobLine[] }[] = [
    { title: 'Labor', rows: lines.filter((l) => l.type === 'labor') },
    { title: 'Parts', rows: lines.filter((l) => l.type === 'part') },
    { title: 'Fees and discounts', rows: lines.filter((l) => l.type === 'fee' || l.type === 'discount') },
  ]
  const isQuote = job.status === 'quote'
  // Quoted parts not bought yet: their expected cost, kept out of the books.
  const estCents = lines.reduce((a, l) => a + (l.purchaseLineId ? 0 : l.estCostCents ?? 0), 0)
  const suggestedPurpose: PaymentPurpose = totals.paidCents === 0 && (job.status === 'quote' || job.status === 'in_progress') ? 'deposit' : 'final'
  const partNumberOf = (l: JobLine) => l.productId ? null : l.purchaseLineId ? costById.get(l.purchaseLineId)?.partNumber : l.partNumber ?? costsFor(l)[0]?.partNumber
  const vehicleText = vehicle ? [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(' ') : ''

  return (
    <div className="space-y-4">
      <div>
        <Link href="/jobs" className="mb-1 inline-block text-sm text-fg-muted hover:text-fg">← Jobs</Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm text-fg-subtle tabular">#{number} · {KIND_LABELS[job.kind]} · opened {formatDate(job.openedOn)}</div>
            <h1 className="text-xl font-semibold tracking-tight">{job.title}</h1>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-fg-muted">
              <Link href={`/customers/${customer.id}`} className="font-medium text-fg hover:underline">{customer.name}</Link>
              {vehicleText && <span>· {vehicleText}</span>}
              {customer.phone && (
                <a href={`tel:${customer.phone}`} className="inline-flex items-center gap-1 hover:text-fg"><Phone size={13} />{customer.phone}</a>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <LinkButton href={`/jobs/${job.id}/invoice`} size="sm"><Printer size={15} />{isQuote ? 'Estimate' : 'Invoice'}</LinkButton>
            <Button size="sm" onClick={() => setEditingDetails((v) => !v)}>Edit</Button>
          </div>
        </div>
      </div>

      <ActionForm action={setStatusAction} className="grid grid-cols-4 gap-1 rounded-xl border border-line bg-surface p-1">
        <input type="hidden" name="id" value={job.id} />
        {STATUSES.map(([s, label]) => (
          <button key={s} type="submit" name="status" value={s}
            className={cx('h-9 rounded-lg text-sm', job.status === s ? 'bg-accent font-medium text-accent-fg' : 'text-fg-muted hover:bg-hover')}>
            {label}
          </button>
        ))}
      </ActionForm>
      {job.status === 'done' && totals.balanceCents > 0 && (
        <Notice>Waiting on {formatMoney(totals.balanceCents)}. It moves to Paid once payments cover the bill.</Notice>
      )}

      {editingDetails && (
        <Card className="p-4">
          <ActionForm id="job-details" action={updateJobAction} onSuccess={() => setEditingDetails(false)} className="space-y-3">
            <input type="hidden" name="id" value={job.id} />
            <input type="hidden" name="customerId" value={customer.id} />
            <Field label="Title"><Input name="title" defaultValue={job.title} required /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Kind">
                <Select name="kind" defaultValue={job.kind}>
                  <option value="service">Service</option>
                  <option value="fabrication">Fabrication</option>
                  <option value="sale">Sale</option>
                </Select>
              </Field>
              <VehicleChoice vehicles={vehiclesForCustomer} current={job.vehicleId} />
              <Field label="Opened"><Input type="date" name="openedOn" defaultValue={job.openedOn} required /></Field>
              <Field label="Completed"><Input type="date" name="completedOn" defaultValue={job.completedOn ?? ''} /></Field>
            </div>
            <Field label="Notes"><Textarea name="notes" defaultValue={job.notes ?? ''} /></Field>
          </ActionForm>
            <div className="mt-3 flex justify-between">
              <ActionButton action={deleteJobAction} fields={{ id: job.id }} variant="danger" size="md"
                confirm="Delete this job? Its purchases stay, marked as needing a new home.">
                <Trash2 size={15} />Delete job
              </ActionButton>
              <div className="flex gap-2">
                <Button onClick={() => setEditingDetails(false)}>Cancel</Button>
                <SubmitButton form="job-details">Save</SubmitButton>
              </div>
            </div>
        </Card>
      )}

      <Card>
        <CardHeader title={isQuote ? 'Estimate' : 'Charges'} />
        {lines.length === 0 && unbilled.length === 0 && adding == null && (
          <div className="px-4 pb-3 text-sm text-fg-subtle">Add labor and parts as the job goes.</div>
        )}
        {groups.map((g) => g.rows.length > 0 && (
          <div key={g.title} className="border-t border-line">
            <div className="px-4 pt-2 text-xs font-medium tracking-wide text-fg-subtle uppercase">{g.title}</div>
            {g.rows.map((l) => editingLine === l.id ? (
              <LineEditor key={l.id} line={l} today={today} fromStock={costsFor(l).some((c) => c.useId != null)} onDone={() => setEditingLine(null)} />
            ) : (
              <button key={l.id} type="button" onClick={() => setEditingLine(l.id)}
                className="flex w-full items-baseline gap-3 px-4 py-2 text-left hover:bg-hover">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm">
                    {l.description}
                    {partNumberOf(l) && <span className="ml-1.5 text-xs text-fg-subtle tabular">#{partNumberOf(l)}</span>}
                  </span>
                  <span className="block text-xs text-fg-subtle">
                    {l.type === 'labor' && l.hoursHundredths != null && `${formatScaled(l.hoursHundredths, 100)} h × ${formatMoney(l.rateCents ?? 0)}`}
                    {l.type === 'part' && (l.productId ? productLabel(l, costsFor(l)) : costsFor(l).length ? costLabel(costsFor(l)) : estimateLabel(l))}
                  </span>
                </span>
                <Money cents={l.amountCents} signed className="text-sm" />
              </button>
            ))}
          </div>
        ))}

        {unbilled.length > 0 && (
          <div className="border-t border-line">
            <div className="px-4 pt-2 text-xs font-medium tracking-wide text-fg-subtle uppercase">Costs not on the invoice</div>
            {unbilled.map((c) => (
              <UnbilledCost key={c.key} cost={c} markupPct={markupPct} />
            ))}
          </div>
        )}

        {adding === 'labor' && <AddLabor jobId={job.id} rate={laborRateCents} onDone={() => setAdding(null)} />}
        {adding === 'part' && <AddPart jobId={job.id} quote={isQuote} today={today} markupPct={markupPct} onDone={() => setAdding(null)} />}
        {adding === 'stock' && (
          <div className="border-t border-line p-4">
            <UseStockForm items={stock} jobId={job.id} today={today} markupPct={markupPct} onDone={() => setAdding(null)} />
          </div>
        )}
        {adding === 'product' && (
          <div className="border-t border-line p-4">
            <SellProductForm products={products} jobId={job.id} today={today} onDone={() => setAdding(null)} />
          </div>
        )}
        {(adding === 'fee' || adding === 'discount') && <AddCharge jobId={job.id} type={adding} onDone={() => setAdding(null)} />}

        <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3">
          <Button size="sm" onClick={() => setAdding('labor')}><Plus size={14} />Labor</Button>
          <Button size="sm" onClick={() => setAdding('part')}><Plus size={14} />Part</Button>
          {stock.length > 0 && <Button size="sm" onClick={() => setAdding('stock')}><Plus size={14} />From stock</Button>}
          {products.length > 0 && <Button size="sm" onClick={() => setAdding('product')}><Plus size={14} />Product</Button>}
          <Button size="sm" onClick={() => setAdding('fee')}><Plus size={14} />Fee</Button>
          <Button size="sm" onClick={() => setAdding('discount')}><Plus size={14} />Discount</Button>
        </div>
        <div className="grid grid-cols-4 gap-2 border-t border-line bg-raised px-4 py-3 rounded-b-xl">
          <Total label="Billed" cents={totals.billedCents} />
          <Total label={estCents ? 'Costs (est.)' : 'Costs'} cents={totals.costCents + estCents} />
          <Total label="Fees" cents={totals.feeCents} />
          <Total label={estCents ? 'Profit (est.)' : 'Profit'} cents={totals.profitCents - estCents} strong />
        </div>
      </Card>

      <Card>
        <CardHeader title="Payments" action={
          <span className="text-sm">
            {totals.balanceCents > 0
              ? <><Money cents={totals.balanceCents} className="font-semibold" /> due</>
              : totals.balanceCents < 0
                ? <span className="text-warn">Overpaid <Money cents={-totals.balanceCents} /></span>
                : totals.billedCents > 0 ? <Badge tone="good">Paid in full</Badge> : null}
          </span>
        } />
        {payments.length === 0 && adding !== 'payment' && <div className="px-4 pb-3 text-sm text-fg-subtle">No payments yet.</div>}
        <div className="divide-y divide-line border-t border-line empty:border-0">
          {payments.map((p) => editingPayment === p.id ? (
            <PaymentEditor key={p.id} payment={p} today={today} onDone={() => setEditingPayment(null)} />
          ) : (
            <button key={p.id} type="button" onClick={() => p.method !== 'stripe' && setEditingPayment(p.id)}
              className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-hover">
              <span className="w-16 shrink-0 text-xs text-fg-subtle">{formatDate(p.receivedOn, { year: false })}</span>
              <span className="min-w-0 flex-1 text-sm">
                <Badge tone={p.purpose === 'refund' ? 'danger' : p.purpose === 'deposit' ? 'accent' : 'neutral'}>{PURPOSE[p.purpose]}</Badge>
                <span className="ml-2 text-fg-muted">{METHOD[p.method]}{p.note ? ` · ${p.note}` : ''}</span>
              </span>
              <span className="shrink-0 text-right">
                <Money cents={p.amountCents} signed className="block text-sm" />
                {p.feeCents > 0 && <span className="block text-xs text-fg-subtle">fee {formatMoney(p.feeCents)}</span>}
              </span>
            </button>
          ))}
        </div>
        {adding === 'payment' && (
          <div className="border-t border-line p-4">
            <ActionForm action={addPaymentAction} onSuccess={() => setAdding(null)}>
              <input type="hidden" name="jobId" value={job.id} />
              <PaymentFields today={today} defaults={{
                amount: totals.balanceCents > 0 ? centsToInput(totals.balanceCents) : '',
                purpose: suggestedPurpose,
              }} />
              <div className="mt-3 flex justify-end gap-2">
                <Button onClick={() => setAdding(null)}>Cancel</Button>
                <SubmitButton>Add payment</SubmitButton>
              </div>
            </ActionForm>
          </div>
        )}
        {adding === 'request' && (
          <div className="border-t border-line p-4">
            {!customerHasEmail ? (
              <Notice>Add an email for {customer.name} first, so Stripe can send the invoice. <Link className="underline" href={`/customers/${customer.id}`}>Edit customer</Link></Notice>
            ) : (
              <ActionForm action={requestPaymentAction} onSuccess={() => setAdding(null)} className="space-y-3">
                <input type="hidden" name="jobId" value={job.id} />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Amount"><MoneyInput name="amount" defaultValue={totals.balanceCents > 0 ? centsToInput(totals.balanceCents) : ''} required /></Field>
                  <Field label="For">
                    <Select name="purpose" defaultValue={suggestedPurpose}>
                      <option value="deposit">Deposit</option>
                      <option value="progress">Progress</option>
                      <option value="final">Final</option>
                    </Select>
                  </Field>
                </div>
                <Field label="Itemize" hint="Final payments can list the job’s lines on the Stripe invoice">
                  <Select name="itemize" defaultValue={suggestedPurpose === 'final' ? 'lines' : 'single'}>
                    <option value="single">One line (e.g. “Deposit for job #{number}”)</option>
                    <option value="lines">Job lines, less payments received</option>
                  </Select>
                </Field>
                <div className="text-xs text-fg-subtle">Stripe emails {customer.email} a payment page for card or bank transfer. The payment shows up here when it’s paid.</div>
                <div className="flex justify-end gap-2">
                  <Button onClick={() => setAdding(null)}>Cancel</Button>
                  <SubmitButton>Send request</SubmitButton>
                </div>
              </ActionForm>
            )}
          </div>
        )}
        {requests.length > 0 && (
          <div className="border-t border-line px-4 py-2">
            <div className="text-xs font-medium tracking-wide text-fg-subtle uppercase">Stripe requests</div>
            {requests.map((r) => (
              <div key={r.id} className="flex items-center gap-2 py-1.5 text-sm">
                <span className="flex-1">{r.description}</span>
                <Badge tone={r.status === 'paid' ? 'good' : r.status === 'void' ? 'neutral' : 'warn'}>
                  {r.status === 'sent' ? 'Sent' : r.status === 'paid' ? 'Paid' : 'Void'}
                </Badge>
                <Money cents={r.amountCents} />
                {r.hostedUrl && <a href={r.hostedUrl} target="_blank" rel="noreferrer" className="text-fg-subtle hover:text-fg" aria-label="Open in Stripe"><ExternalLink size={14} /></a>}
                {r.status === 'sent' && (
                  <ActionButton action={voidRequestAction} fields={{ id: r.id }} confirm="Void this Stripe invoice?">Void</ActionButton>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3">
          <Button size="sm" onClick={() => setAdding('payment')}><Plus size={14} />Payment</Button>
          {stripe && <Button size="sm" onClick={() => setAdding('request')}>Request via Stripe</Button>}
        </div>
      </Card>

      <Card>
        <CardHeader title="Photos and receipts" />
        <div className="flex flex-wrap gap-2 px-4">
          {photos.map((f) => (
            <div key={f.id} className="relative">
              <Thumb id={f.id} contentType={f.contentType} filename={f.filename} />
              <ActionButton action={deleteFileAction} fields={{ id: f.id }} confirm="Delete this photo?"
                className="absolute -top-2 -right-2"><Trash2 size={12} /></ActionButton>
            </div>
          ))}
          {receiptFiles.map((f) => <Thumb key={f.id} id={f.id} contentType={f.contentType} filename={f.filename} />)}
        </div>
        <ActionForm action={uploadJobPhotosAction} resetOnSuccess className="flex items-start gap-2 px-4 py-3">
          <input type="hidden" name="jobId" value={job.id} />
          <FileInput name="photos" label="Add photos" />
          <SubmitButton variant="secondary">Upload</SubmitButton>
        </ActionForm>
      </Card>

      {job.notes && !editingDetails && (
        <Card className="p-4 text-sm whitespace-pre-wrap text-fg-muted">{job.notes}</Card>
      )}

      <details className="text-sm">
        <summary className="cursor-pointer text-fg-muted">Save as a template</summary>
        <ActionForm action={saveTemplateAction} className="mt-2 flex gap-2">
          <input type="hidden" name="jobId" value={job.id} />
          <Input name="name" placeholder="Template name" defaultValue={job.title} />
          <SubmitButton variant="secondary">Save</SubmitButton>
        </ActionForm>
        <div className="mt-1 text-xs text-fg-subtle">Copies this job’s labor, parts and fee lines (without costs) for next time.</div>
      </details>
    </div>
  )
}

// One cost, or for parts billed from stock, the uses behind the line.
function costLabel(cs: JobDetail['costs']) {
  const qty = cs.reduce((a, c) => a + c.quantityHundredths, 0)
  const vendors = [...new Set(cs.map((c) => c.purchase.vendor))].join(', ')
  const source = cs.some((c) => c.useId != null) ? `from stock, ${vendors}` : vendors
  return `${qty !== 100 ? `${formatQuantity(qty)} × ` : ''}cost ${formatMoney(cs.reduce((a, c) => a + c.allocatedCents, 0))} · ${source}`
}

// A product: its parts are different stock items, so only their total cost.
function productLabel(l: JobLine, cs: JobDetail['costs']) {
  const qty = l.quantityHundredths != null && l.quantityHundredths !== 100 ? `${formatQuantity(l.quantityHundredths)} × ` : ''
  return `${qty}product · parts cost ${formatMoney(cs.reduce((a, c) => a + c.allocatedCents, 0))} from stock`
}

function estimateLabel(l: JobLine) {
  if (l.estCostCents == null) return 'no cost recorded'
  const qty = l.quantityHundredths != null && l.quantityHundredths !== 100 ? `${formatQuantity(l.quantityHundredths)} × ` : ''
  return `${qty}est. cost ${formatMoney(l.estCostCents)} · not bought yet`
}

function Total({ label, cents, strong }: { label: string; cents: number; strong?: boolean }) {
  return (
    <div>
      <div className="text-xs text-fg-subtle">{label}</div>
      <Money cents={cents} signed className={cx('text-sm', strong && 'font-semibold')} />
    </div>
  )
}

function VehicleChoice({ vehicles, current }: { vehicles: JobDetail['vehiclesForCustomer']; current: number | null }) {
  const [v, setV] = useState(current ? String(current) : '')
  return (
    <Field label="Car">
      <Select name="vehicleId" value={v} onChange={(e) => setV(e.target.value)}>
        <option value="">None</option>
        {vehicles.map((x) => <option key={x.id} value={x.id}>{[x.year, x.make, x.model].filter(Boolean).join(' ')}</option>)}
        <option value="new">Add a car…</option>
      </Select>
      {v === 'new' && <Input name="vehicleText" placeholder="e.g. 2008 Subaru WRX" className="mt-2" />}
    </Field>
  )
}

function AddLabor({ jobId, rate, onDone }: { jobId: number; rate: number; onDone: () => void }) {
  const [flat, setFlat] = useState(false)
  return (
    <div className="border-t border-line p-4">
      <ActionForm action={addLineAction} resetOnSuccess className="space-y-3">
        <input type="hidden" name="jobId" value={jobId} />
        <input type="hidden" name="type" value="labor" />
        <Field label="Labor"><Input name="description" placeholder="Fabrication, install…" autoFocus /></Field>
        {flat ? (
          <Field label="Flat price"><MoneyInput name="amount" required /></Field>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Hours"><Input name="hours" inputMode="decimal" placeholder="1.5" required /></Field>
            <Field label="Rate"><MoneyInput name="rate" defaultValue={centsToInput(rate)} /></Field>
          </div>
        )}
        <div className="flex items-center justify-between">
          <button type="button" className="text-sm text-fg-muted hover:text-fg" onClick={() => setFlat((f) => !f)}>
            {flat ? 'Use hours × rate' : 'Flat price instead'}
          </button>
          <div className="flex gap-2">
            <Button onClick={onDone}>Done</Button>
            <SubmitButton>Add</SubmitButton>
          </div>
        </div>
      </ActionForm>
    </div>
  )
}

function AddPart({ jobId, quote, today, markupPct, onDone }: { jobId: number; quote: boolean; today: string; markupPct: number; onDone: () => void }) {
  const [billed, setBilled] = useState('')
  const [touched, setTouched] = useState(false)
  const [more, setMore] = useState(false)
  return (
    <div className="border-t border-line p-4">
      <ActionForm action={addPartAction} resetOnSuccess onSuccess={() => { setBilled(''); setTouched(false) }} className="space-y-3">
        <input type="hidden" name="jobId" value={jobId} />
        <Field label="Part"><Input name="description" placeholder="Vibrant resonator" autoFocus required /></Field>
        <div className="grid grid-cols-[1fr_6rem] gap-3">
          <Field label="Part number"><Input name="partNumber" placeholder="Optional" autoComplete="off" /></Field>
          <Field label="Qty"><Input name="quantity" defaultValue="1" inputMode="decimal" required /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={quote ? 'Expected cost' : 'Your cost'} hint={quote ? 'Not a purchase until you buy it' : 'Leave empty if the customer supplied it'}>
            <MoneyInput name="cost" onChange={(e) => {
              if (touched) return
              const c = parseFloat(e.target.value.replace(/[$,]/g, ''))
              setBilled(Number.isFinite(c) ? (withMarkup(Math.round(c * 100), markupPct) / 100).toFixed(2) : '')
            }} />
          </Field>
          <Field label="Bill customer" hint={`${markupPct}% markup by default`}>
            <MoneyInput name="billed" value={billed} onChange={(e) => { setBilled(e.target.value); setTouched(true) }} />
          </Field>
          {!quote && <>
            <Field label="Vendor"><Input name="vendor" placeholder="Summit, RockAuto…" /></Field>
            <Field label="Bought"><Input type="date" name="purchasedOn" defaultValue={today} /></Field>
          </>}
        </div>
        {quote && <input type="hidden" name="purchasedOn" value={today} />}
        {more && !quote ? (
          <Field label="Paid with"><Input name="method" placeholder="Card, cash…" /></Field>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {quote ? <span className="text-xs text-fg-subtle">When you buy it, open the line and choose Bought it.</span> : (
            <div className="flex items-center gap-3">
              <FileInput name="receipt" label="Receipt" />
              {!more && <button type="button" className="text-sm text-fg-muted hover:text-fg" onClick={() => setMore(true)}>More…</button>}
            </div>
          )}
          <div className="flex gap-2">
            <Button onClick={onDone}>Done</Button>
            <SubmitButton>Add</SubmitButton>
          </div>
        </div>
      </ActionForm>
    </div>
  )
}

function AddCharge({ jobId, type, onDone }: { jobId: number; type: 'fee' | 'discount'; onDone: () => void }) {
  return (
    <div className="border-t border-line p-4">
      <ActionForm action={addLineAction} onSuccess={onDone} className="space-y-3">
        <input type="hidden" name="jobId" value={jobId} />
        <input type="hidden" name="type" value={type} />
        <div className="grid grid-cols-[1fr_8rem] gap-3">
          <Field label={type === 'fee' ? 'Fee' : 'Discount'}>
            <Input name="description" placeholder={type === 'fee' ? 'Shop supplies, disposal…' : 'Repeat customer'} autoFocus />
          </Field>
          <Field label="Amount"><MoneyInput name="amount" required /></Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button onClick={onDone}>Cancel</Button>
          <SubmitButton>Add</SubmitButton>
        </div>
      </ActionForm>
    </div>
  )
}

function LineEditor({ line, today, fromStock, onDone }: { line: JobLine; today: string; fromStock: boolean; onDone: () => void }) {
  const hourly = line.type === 'labor' && line.hoursHundredths != null
  const unbought = line.type === 'part' && !line.purchaseLineId && !fromStock
  const [buying, setBuying] = useState(false)
  if (buying) {
    return (
      <div className="bg-raised px-4 py-3">
        <ActionForm action={recordPartPurchaseAction} onSuccess={onDone} className="space-y-3">
          <input type="hidden" name="id" value={line.id} />
          <div className="text-sm font-medium">Bought: {line.description}</div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Paid"><MoneyInput name="cost" defaultValue={centsToInput(line.estCostCents)} autoFocus required /></Field>
            <Field label="Bought"><Input type="date" name="purchasedOn" defaultValue={today} required /></Field>
            <Field label="Vendor"><Input name="vendor" placeholder="Summit, RockAuto…" /></Field>
            <Field label="Paid with"><Input name="method" placeholder="Card, cash…" /></Field>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <FileInput name="receipt" label="Receipt" />
            <div className="flex gap-2">
              <Button onClick={() => setBuying(false)}>Back</Button>
              <SubmitButton>Save purchase</SubmitButton>
            </div>
          </div>
        </ActionForm>
      </div>
    )
  }
  return (
    <div className="bg-raised px-4 py-3">
      <ActionForm id={`line-${line.id}`} action={updateLineAction} onSuccess={onDone} className="space-y-3">
        <input type="hidden" name="id" value={line.id} />
        <input type="hidden" name="type" value={line.type} />
        <Field label="Description"><Input name="description" defaultValue={line.description} autoFocus /></Field>
        {hourly ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Hours"><Input name="hours" inputMode="decimal" defaultValue={formatScaled(line.hoursHundredths, 100)} /></Field>
            <Field label="Rate"><MoneyInput name="rate" defaultValue={centsToInput(line.rateCents)} /></Field>
          </div>
        ) : (
          <div className={cx(unbought && 'grid grid-cols-2 gap-3')}>
            <Field label={line.type === 'part' ? 'Billed' : 'Amount'}>
              <MoneyInput name="amount" defaultValue={centsToInput(Math.abs(line.amountCents))} />
            </Field>
            {unbought && <Field label="Expected cost"><MoneyInput name="estCost" defaultValue={centsToInput(line.estCostCents)} /></Field>}
          </div>
        )}
      </ActionForm>
        <div className="mt-3 flex flex-wrap justify-between gap-2">
          <div className="flex gap-2">
            <ActionButton action={deleteLineAction} fields={{ id: line.id }} variant="danger" size="md"
              confirm={line.purchaseLineId || fromStock ? 'Remove this from the invoice? The cost stays on the job.' : 'Remove this line?'}>
              <Trash2 size={15} />Remove
            </ActionButton>
            {fromStock && (
              <ActionButton action={returnToStockAction} fields={{ jobLineId: line.id }} size="md"
                confirm="Take this off the job and the invoice, and put it back in stock?">
                Back to stock
              </ActionButton>
            )}
            {unbought && <Button size="md" onClick={() => setBuying(true)}>Bought it</Button>}
          </div>
          <div className="flex gap-2">
            <Button onClick={onDone}>Cancel</Button>
            <SubmitButton form={`line-${line.id}`}>Save</SubmitButton>
          </div>
        </div>
    </div>
  )
}

function UnbilledCost({ cost, markupPct }: { cost: JobDetail['costs'][number]; markupPct: number }) {
  const [open, setOpen] = useState(false)
  const label = cost.description || cost.purchase.vendor
  return (
    <div className="px-4 py-2">
      <div className="flex items-baseline gap-3">
        <span className="min-w-0 flex-1">
          <span className="block text-sm">{label}</span>
          <Link href={`/purchases/${cost.purchaseId}`} className="block text-xs text-fg-subtle hover:underline">
            {cost.quantityHundredths !== 100 && `${formatQuantity(cost.quantityHundredths)} × `}
            {cost.purchase.vendor} · {cost.usedOn ? `from stock ${formatDate(cost.usedOn, { year: false })}` : formatDate(cost.purchase.purchasedOn, { year: false })} · cost {formatMoney(cost.allocatedCents)}
          </Link>
        </span>
        {!open && cost.useId != null && (
          <ActionButton action={returnToStockAction} fields={{ useId: cost.useId }} size="sm" confirm="Take this off the job and put it back in stock?">
            Back to stock
          </ActionButton>
        )}
        {!open && <Button size="sm" onClick={() => setOpen(true)}>Bill it</Button>}
      </div>
      {open && (
        <ActionForm action={cost.useId != null ? billStockUseAction : billCostAction} onSuccess={() => setOpen(false)} className="mt-2 grid grid-cols-[1fr_8rem_auto] items-end gap-2">
          {cost.useId != null
            ? <input type="hidden" name="useId" value={cost.useId} />
            : <input type="hidden" name="purchaseLineId" value={cost.id} />}
          <Field label="On invoice as"><Input name="description" defaultValue={label} /></Field>
          <Field label="Billed"><MoneyInput name="billed" defaultValue={centsToInput(withMarkup(cost.allocatedCents, markupPct))} /></Field>
          <SubmitButton>Add</SubmitButton>
        </ActionForm>
      )}
    </div>
  )
}

function PaymentEditor({ payment, today, onDone }: { payment: Payment; today: string; onDone: () => void }) {
  return (
    <div className="bg-raised p-4">
      <ActionForm id={`payment-${payment.id}`} action={updatePaymentAction} onSuccess={onDone}>
        <input type="hidden" name="id" value={payment.id} />
        <PaymentFields today={today} defaults={{
          amount: centsToInput(Math.abs(payment.amountCents)),
          purpose: payment.purpose,
          method: payment.method,
          receivedOn: payment.receivedOn,
          fee: payment.feeCents ? centsToInput(payment.feeCents) : '',
          note: payment.note ?? '',
        }} />
      </ActionForm>
        <div className="mt-3 flex justify-between">
          <ActionButton action={deletePaymentAction} fields={{ id: payment.id }} variant="danger" size="md" confirm="Delete this payment?">
            <Trash2 size={15} />Delete
          </ActionButton>
          <div className="flex gap-2">
            <Button onClick={onDone}>Cancel</Button>
            <SubmitButton form={`payment-${payment.id}`}>Save</SubmitButton>
          </div>
        </div>
    </div>
  )
}
