import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/ui'
import { PurchaseForm, type PurchaseInitial } from '@/components/purchase-form'
import { centsToInput, formatQuantity } from '@/lib/money'
import { authedDb } from '@/server/session'
import { purchaseFormData } from '@/server/pickers'
import { getPurchase } from '@/server/purchases'
import { today } from '@/server/settings'

export const metadata = { title: 'Edit purchase' }

export default async function EditPurchasePage({ params }: PageProps<'/purchases/[id]/edit'>) {
  const id = Number((await params).id)
  const db = await authedDb()
  const d = await getPurchase(db, id)
  if (!d) notFound()
  const p = d.purchase
  const initial: PurchaseInitial = {
    id,
    vendor: p.vendor,
    purchasedOn: p.purchasedOn,
    method: p.method ?? '',
    tax: p.taxCents ? centsToInput(p.taxCents) : '',
    shipping: p.shippingCents ? centsToInput(p.shippingCents) : '',
    notes: p.notes ?? '',
    lines: d.lines.map(({ line, asset }) => ({
      key: `e${line.id}`,
      id: line.id,
      description: line.description ?? (asset?.description ?? ''),
      partNumber: line.partNumber ?? '',
      quantity: formatQuantity(line.quantityHundredths),
      amount: centsToInput(line.amountCents),
      kind: line.jobId ? 'job' : line.categoryId ? 'category' : line.assetId ? 'asset' : line.stock ? 'stock' : null,
      jobId: line.jobId ? String(line.jobId) : '',
      categoryId: line.categoryId ? String(line.categoryId) : '',
      businessUse: String(asset?.businessUsePct ?? 100),
      bill: false,
      billed: '',
      billedTouched: true,
      contract: Boolean(line.jobId && line.payee),
      payee: line.payee ?? '',
    })),
  }
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Edit purchase" back={{ href: `/purchases/${id}`, label: p.vendor }} />
      <PurchaseForm data={await purchaseFormData(db)} today={await today(db)} initial={initial} />
    </div>
  )
}
