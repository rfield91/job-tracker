import { notFound, redirect } from 'next/navigation'
import { Card, Money, PageHeader } from '@/components/ui'
import { formatDate } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { customerOptions } from '@/server/customers'
import { getPayment } from '@/server/payments'
import { listProducts } from '@/server/products'
import { authedDb } from '@/server/session'
import { PaymentSaleForm } from './payment-sale-form'

export const metadata = { title: 'Make it a sale' }

export default async function PaymentSalePage({ params }: PageProps<'/payments/[id]/sale'>) {
  const { id } = await params
  const db = await authedDb()
  const payment = await getPayment(db, Number(id))
  if (!payment) notFound()
  if (payment.jobId) redirect(`/jobs/${payment.jobId}`)
  if (payment.amountCents <= 0) redirect('/payments/unmatched')

  const products = await listProducts(db, Number(payment.receivedOn.slice(0, 4)), { activeOnly: true })
  const customers = await customerOptions(db)
  // Stripe gives a name or only an email; a known buyer is picked already.
  const payer = payment.payerName?.trim() ?? ''
  const email = payer.includes('@') ? payer : ''
  const known = customers.find((c) => email
    ? c.email?.toLowerCase() === email.toLowerCase()
    : payer && c.name.toLowerCase() === payer.toLowerCase())

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="Make it a sale" back={{ href: '/payments/unmatched', label: 'Stripe payments' }}
        subtitle="Creates the sale and puts this payment on it." />
      <Card className="flex items-baseline justify-between gap-3 p-4">
        <div className="min-w-0">
          <div className="text-sm font-medium">{payer || 'Unknown payer'}</div>
          <div className="text-xs text-fg-muted">
            {formatDate(payment.receivedOn)}{payment.note ? ` · ${payment.note}` : ''}{payment.feeCents ? ` · fee ${formatMoney(payment.feeCents)}` : ''}
          </div>
        </div>
        <Money cents={payment.amountCents} className="text-sm font-medium" />
      </Card>
      <PaymentSaleForm
        paymentId={payment.id}
        amountCents={payment.amountCents}
        receivedOn={payment.receivedOn}
        products={products.map((p) => ({ id: p.id, name: p.name, priceCents: p.priceCents, canBuild: p.canBuild, hasParts: p.parts.length > 0 }))}
        customers={customers.map((c) => ({ id: c.id, name: c.name, phone: c.phone }))}
        buyer={known ? { id: known.id, name: known.name, phone: known.phone } : null}
        buyerName={email ? '' : payer}
        buyerEmail={email}
      />
    </div>
  )
}
