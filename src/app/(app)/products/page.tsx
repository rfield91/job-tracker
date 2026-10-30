import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Badge, Card, Empty, LinkButton, Money, PageHeader } from '@/components/ui'
import { formatMoney } from '@/lib/money'
import { authedDb } from '@/server/session'
import { listProducts, type ProductSummary } from '@/server/products'
import { today } from '@/server/settings'

export const metadata = { title: 'Products' }

export default async function ProductsPage() {
  const db = await authedDb()
  const year = Number((await today(db)).slice(0, 4))
  const all = await listProducts(db, year)
  const active = all.filter((p) => p.active)
  const retired = all.filter((p) => !p.active)
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title="Products"
        subtitle="Things you sell ready-made. Each lists the stock parts that go into one, so selling it takes them off the shelf and counts their cost on the sale."
        actions={<>
          {active.length > 0 && <LinkButton href="/sales/new" size="sm"><Plus size={14} />Sale</LinkButton>}
          <LinkButton href="/products/new" size="sm" variant="primary"><Plus size={14} />New product</LinkButton>
        </>}
      />
      <Card>
        {active.length === 0 ? (
          <Empty>No products yet. Add one with the stock parts that make it, like a bracket kit made from cut parts and hardware.</Empty>
        ) : (
          <div className="divide-y divide-line">
            {active.map((p) => <ProductRow key={p.id} p={p} year={year} />)}
          </div>
        )}
      </Card>
      {retired.length > 0 && (
        <Card>
          <div className="px-4 pt-3 text-xs font-medium tracking-wide text-fg-subtle uppercase">No longer sold</div>
          <div className="divide-y divide-line">
            {retired.map((p) => <ProductRow key={p.id} p={p} year={year} />)}
          </div>
        </Card>
      )}
    </div>
  )
}

function ProductRow({ p, year }: { p: ProductSummary; year: number }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <Link href={`/products/${p.id}`} className="text-sm font-medium hover:underline">{p.name}</Link>
        <div className="mt-0.5 text-xs text-fg-muted">
          {p.parts.length === 0 ? 'No stock parts listed'
            : p.canBuild > 0 ? <>Can make {p.canBuild}{p.limitedBy && p.parts.length > 1 ? `, limited by ${p.limitedBy}` : ''}</>
            : <Badge tone="warn">Out of {p.limitedBy}</Badge>}
          {p.costCents != null && p.parts.length > 0 && <> · parts {formatMoney(p.costCents)}, {formatMoney(p.priceCents - p.costCents)} over cost</>}
        </div>
        {p.soldThisYear > 0 && <div className="text-xs text-fg-subtle">{p.soldThisYear} sold in {year}</div>}
      </div>
      <div className="flex items-center gap-3">
        <Money cents={p.priceCents} className="text-sm" />
        {p.active && <LinkButton href={`/sales/new?product=${p.id}`} size="sm">Sell</LinkButton>}
      </div>
    </div>
  )
}
