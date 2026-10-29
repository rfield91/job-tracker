import Link from 'next/link'
import { Plus } from 'lucide-react'
import { ActionButton } from '@/components/forms'
import { Card, CardHeader, Empty, LinkButton, Money, PageHeader } from '@/components/ui'
import { returnToStockAction } from '@/app/actions/stock'
import { formatDate } from '@/lib/dates'
import { formatQuantity } from '@/lib/money'
import { allocatedLines } from '@/server/ledger'
import { authedDb } from '@/server/session'
import { jobOptions } from '@/server/pickers'
import { listCategories } from '@/server/purchases'
import { getSettings, today } from '@/server/settings'
import { listShopUses, listStock } from '@/server/stock'
import { StockRow } from './stock-row'

export const metadata = { title: 'Stock' }

export default async function StockPage() {
  const db = await authedDb()
  const items = await listStock(db)
  const jobs = await jobOptions(db)
  const cats = (await listCategories(db, { activeOnly: true })).filter((c) => !c.systemKey)
  const s = await getSettings(db)
  const now = await today(db)
  const year = Number(now.slice(0, 4))
  const shopUses = await listShopUses(db, year)
  const costByUse = new Map((await allocatedLines(db, { stockOrigin: true }))
    .filter((l) => l.useId != null).map((l) => [l.useId!, l.allocatedCents]))
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title="Stock"
        subtitle="Materials bought ahead for future jobs. Their cost counts when you put them on a job or use them in the shop, so what’s left at year end carries over to next year."
        actions={<LinkButton href="/purchases/new?stock=1" size="sm"><Plus size={14} />Add stock</LinkButton>}
      />
      <Card>
        <CardHeader title="On the shelf" action={<Money cents={items.reduce((a, i) => a + i.allocatedCents, 0)} className="text-sm font-semibold" />} />
        {items.length === 0 ? (
          <Empty>Nothing in stock. When you log a purchase, choose Stock for materials you’re keeping on hand.</Empty>
        ) : (
          <div className="divide-y divide-line border-t border-line">
            {items.map((i) => (
              <StockRow key={i.key} item={i} jobs={jobs} categories={cats} today={now} markupPct={s.partsMarkupPct} />
            ))}
          </div>
        )}
      </Card>
      {shopUses.length > 0 && (
        <Card>
          <CardHeader title={`Used by the shop in ${year}`}
            action={<Money cents={shopUses.reduce((a, u) => a + (costByUse.get(u.use.id) ?? 0), 0)} className="text-sm font-semibold" />} />
          <div className="divide-y divide-line border-t border-line">
            {shopUses.map(({ use, line, purchase, category }) => (
              <div key={use.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-14 shrink-0 text-xs text-fg-subtle">{formatDate(use.usedOn, { year: false })}</span>
                <span className="min-w-0 flex-1 text-sm">
                  <span className="text-fg-muted tabular">{formatQuantity(use.quantityHundredths)} × </span>
                  <Link href={`/purchases/${purchase.id}`} className="hover:underline">{line.description || purchase.vendor}</Link>
                  <span className="block text-xs text-fg-subtle">{category.name}{use.note && ` · ${use.note}`}</span>
                </span>
                <Money cents={costByUse.get(use.id) ?? 0} className="text-sm" />
                <ActionButton action={returnToStockAction} fields={{ useId: use.id }} confirm="Put this back on the shelf?">Put back</ActionButton>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
