import Link from 'next/link'
import { Card, Empty, LinkButton, Money, PageHeader } from '@/components/ui'
import { formatDate } from '@/lib/dates'
import { authedDb } from '@/server/session'
import { customerOptions } from '@/server/customers'
import { jobNumber, listJobs } from '@/server/jobs'
import { listProducts } from '@/server/products'
import { today } from '@/server/settings'
import { QuickSaleForm } from './quick-sale-form'

export const metadata = { title: 'New sale' }

export default async function NewSalePage({ searchParams }: PageProps<'/sales/new'>) {
  const sp = await searchParams
  const db = await authedDb()
  const now = await today(db)
  const products = await listProducts(db, Number(now.slice(0, 4)), { activeOnly: true })
  const customers = await customerOptions(db)
  const recent = await listJobs(db, { kind: 'sale', limit: 10 })
  const productId = typeof sp.product === 'string' ? Number(sp.product) : null
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PageHeader
        title="New sale"
        subtitle="A product sold on its own: the sale, its shipping label and the payment in one go. The form stays open for the next one."
        back={{ href: '/products', label: 'Products' }}
      />
      {products.length === 0 ? (
        <Card><Empty>Add a product first. <Link href="/products/new" className="underline">New product</Link></Empty></Card>
      ) : (
        <QuickSaleForm
          products={products.map((p) => ({ id: p.id, name: p.name, priceCents: p.priceCents, canBuild: p.canBuild, hasParts: p.parts.length > 0 }))}
          customers={customers.map((c) => ({ id: c.id, name: c.name, phone: c.phone }))}
          today={now}
          initialProductId={products.some((p) => p.id === productId) ? productId : products.length === 1 ? products[0].id : null}
        />
      )}
      {recent.length > 0 && (
        <Card>
          <div className="flex items-center justify-between px-4 pt-3">
            <span className="text-xs font-medium tracking-wide text-fg-subtle uppercase">Recent sales</span>
            <LinkButton href="/jobs?kind=sale&year=all" size="sm" variant="ghost">All</LinkButton>
          </div>
          <div className="divide-y divide-line">
            {recent.map(({ job, customer, totals }) => (
              <Link key={job.id} href={`/jobs/${job.id}`} className="flex items-center gap-3 px-4 py-2 hover:bg-hover">
                <span className="w-14 shrink-0 text-xs text-fg-subtle">{formatDate(job.openedOn, { year: false })}</span>
                <span className="min-w-0 flex-1 text-sm">
                  {customer.name}
                  <span className="block text-xs text-fg-subtle">#{jobNumber(job)} {job.title}</span>
                </span>
                <span className="text-right">
                  <Money cents={totals.billedCents} className="block text-sm" />
                  <span className="block text-xs text-fg-subtle">profit <Money cents={totals.profitCents} /></span>
                </span>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
