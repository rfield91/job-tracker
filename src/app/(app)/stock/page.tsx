import { Plus } from 'lucide-react'
import { Card, CardHeader, Empty, LinkButton, Money, PageHeader } from '@/components/ui'
import { authedDb } from '@/server/session'
import { jobOptions } from '@/server/pickers'
import { getSettings, today } from '@/server/settings'
import { listStock } from '@/server/stock'
import { StockRow } from './stock-row'

export const metadata = { title: 'Stock' }

export default async function StockPage() {
  const db = await authedDb()
  const items = await listStock(db)
  const jobs = await jobOptions(db)
  const s = await getSettings(db)
  const now = await today(db)
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title="Stock"
        subtitle="Materials bought ahead for future jobs. Their cost counts when you put them on a job, so what’s left at year end carries over to next year."
        actions={<LinkButton href="/purchases/new?stock=1" size="sm"><Plus size={14} />Add stock</LinkButton>}
      />
      <Card>
        <CardHeader title="On the shelf" action={<Money cents={items.reduce((a, i) => a + i.allocatedCents, 0)} className="text-sm font-semibold" />} />
        {items.length === 0 ? (
          <Empty>Nothing in stock. When you log a purchase, choose Stock for materials you’re keeping on hand.</Empty>
        ) : (
          <div className="divide-y divide-line border-t border-line">
            {items.map((i) => (
              <StockRow key={i.key} item={i} jobs={jobs} today={now} markupPct={s.partsMarkupPct} />
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
