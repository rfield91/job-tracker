import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Pencil, Trash2 } from 'lucide-react'
import { ActionButton, ActionForm, SubmitButton } from '@/components/forms'
import { FileInput, Thumb } from '@/components/file-input'
import { Badge, Card, CardHeader, LinkButton, Money, Notice, PageHeader } from '@/components/ui'
import { deletePurchaseAction, uploadReceiptAction } from '@/app/actions/purchases'
import { deleteFileAction } from '@/app/actions/jobs'
import { formatDate } from '@/lib/dates'
import { formatMoney, formatQuantity } from '@/lib/money'
import { lineLabel } from '@/lib/schedule-c'
import { authedDb } from '@/server/session'
import { jobNumber } from '@/server/jobs'
import { getPurchase } from '@/server/purchases'

export const metadata = { title: 'Purchase' }

export default async function PurchasePage({ params, searchParams }: PageProps<'/purchases/[id]'>) {
  const id = Number((await params).id)
  const sp = await searchParams
  const db = await authedDb()
  const d = await getPurchase(db, id)
  if (!d) notFound()
  const { purchase: p } = d
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        back={{ href: '/purchases', label: 'Purchases' }}
        title={p.vendor}
        subtitle={<>{formatDate(p.purchasedOn)}{p.method ? ` · ${p.method}` : ''}</>}
        actions={<>
          <LinkButton href={`/purchases/${id}/edit`} size="sm"><Pencil size={14} />Edit</LinkButton>
          <ActionButton action={deletePurchaseAction} fields={{ id }} variant="danger" size="sm"
            confirm="Delete this purchase and its receipt? Any equipment row it created goes too.">
            <Trash2 size={14} />Delete
          </ActionButton>
        </>}
      />
      {sp.saved && <Notice tone="good">Saved.</Notice>}
      <Card>
        <div className="divide-y divide-line">
          {d.lines.map(({ line, job, category, asset, allocatedCents, billed, uses }) => (
            <div key={line.id} className="flex items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm">
                  {line.quantityHundredths !== 100 && <span className="text-fg-muted tabular">{formatQuantity(line.quantityHundredths)} × </span>}
                  {line.description || p.vendor}
                  {line.partNumber && <span className="ml-1.5 text-xs text-fg-subtle tabular">#{line.partNumber}</span>}
                </div>
                <div className="mt-0.5 text-xs text-fg-muted">
                  {job ? <Link href={`/jobs/${job.id}`} className="hover:underline">Job #{jobNumber(job)} {job.title}</Link>
                    : line.stock ? (
                      <Link href="/stock" className="hover:underline">
                        Stock{uses.length > 0 && ` · ${formatQuantity(line.quantityHundredths - uses.reduce((a, u) => a + u.use.quantityHundredths, 0))} left`}
                      </Link>
                    )
                    : category ? <>{category.name} <span className="text-fg-subtle">· Schedule C {category.scheduleLine}, {lineLabel(category.scheduleLine)}</span></>
                    : asset ? <Link href="/equipment" className="hover:underline">Equipment · {asset.businessUsePct}% business use</Link>
                    : <Badge tone="warn">Needs a job or category</Badge>}
                  {line.payee && <> · paid to {line.payee}</>}
                  {billed.length > 0 && <> · billed {formatMoney(billed.reduce((a, b) => a + b.amountCents, 0))}</>}
                </div>
                {uses.map(({ use, job: j, category: c }) => (
                  <div key={use.id} className="text-xs text-fg-subtle">
                    {formatQuantity(use.quantityHundredths)} used {j
                      ? <>on <Link href={`/jobs/${j.id}`} className="hover:underline">#{jobNumber(j)} {j.title}</Link></>
                      : <>by the <Link href="/stock" className="hover:underline">shop</Link> · {c?.name}{use.note && ` · ${use.note}`}</>}
                    {' '}· {formatDate(use.usedOn, { year: false })}
                  </div>
                ))}
              </div>
              <div className="text-right text-sm">
                <Money cents={line.amountCents} />
                {allocatedCents !== line.amountCents && <div className="text-xs text-fg-subtle">{formatMoney(allocatedCents)} with tax/ship</div>}
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-between border-t border-line bg-raised px-4 py-3 text-sm rounded-b-xl">
          <span className="text-fg-muted">
            {p.taxCents ? `Tax ${formatMoney(p.taxCents)} ` : ''}{p.shippingCents ? `Shipping ${formatMoney(p.shippingCents)}` : ''}
          </span>
          <span className="font-semibold">Total <Money cents={d.totalCents} /></span>
        </div>
      </Card>
      {p.notes && <Card className="p-4 text-sm whitespace-pre-wrap text-fg-muted">{p.notes}</Card>}
      <Card>
        <CardHeader title="Receipt" />
        <div className="flex flex-wrap gap-2 px-4">
          {d.files.map((f) => (
            <div key={f.id} className="relative">
              <Thumb id={f.id} contentType={f.contentType} filename={f.filename} />
              <ActionButton action={deleteFileAction} fields={{ id: f.id }} confirm="Delete this file?" className="absolute -top-2 -right-2"><Trash2 size={12} /></ActionButton>
            </div>
          ))}
          {d.files.length === 0 && <div className="text-sm text-fg-subtle">No receipt attached.</div>}
        </div>
        <ReceiptUpload id={id} />
      </Card>
    </div>
  )
}

function ReceiptUpload({ id }: { id: number }) {
  return (
    <ActionForm action={uploadReceiptAction} resetOnSuccess className="flex items-start gap-2 px-4 py-3">
      <input type="hidden" name="id" value={id} />
      <FileInput name="receipt" label="Attach receipt" />
      <SubmitButton variant="secondary">Upload</SubmitButton>
    </ActionForm>
  )
}
