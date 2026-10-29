import Link from 'next/link'
import { Paperclip, Plus, Search } from 'lucide-react'
import { Badge, Card, Empty, Input, LinkButton, Money, PageHeader, Select } from '@/components/ui'
import { formatDate, monthEnd } from '@/lib/dates'
import { authedDb } from '@/server/session'
import { jobNumber } from '@/server/jobs'
import { listCategories, listPurchases } from '@/server/purchases'
import { today } from '@/server/settings'

export const metadata = { title: 'Purchases' }

export default async function PurchasesPage({ searchParams }: PageProps<'/purchases'>) {
  const sp = await searchParams
  const db = await authedDb()
  const thisYear = Number((await today(db)).slice(0, 4))
  const q = typeof sp.q === 'string' ? sp.q : ''
  const needsHome = sp.needsHome === '1'
  const categoryId = typeof sp.category === 'string' && sp.category ? Number(sp.category) : undefined
  const yearParam = typeof sp.year === 'string' ? sp.year : needsHome ? 'all' : String(thisYear)
  const month = typeof sp.month === 'string' ? sp.month : ''
  const year = yearParam === 'all' ? null : Number(yearParam)
  const from = year ? (month ? `${year}-${month}-01` : `${year}-01-01`) : undefined
  const to = year ? (month ? monthEnd(`${year}-${month}`) : `${year}-12-31`) : undefined
  const rows = await listPurchases(db, { q, needsHome, categoryId, from, to })
  const cats = await listCategories(db)
  const total = rows.reduce((a, r) => a + r.totalCents, 0)
  const years = Array.from({ length: 6 }, (_, i) => thisYear - i)
  return (
    <div>
      <PageHeader title="Purchases" actions={<LinkButton href="/purchases/new" variant="primary"><Plus size={16} />New purchase</LinkButton>} />
      <form className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto_auto]">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-subtle" />
          <Input name="q" defaultValue={q} placeholder="Vendor or item" className="pl-9" />
        </div>
        <Select name="category" defaultValue={categoryId ?? ''}>
          <option value="">All categories</option>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select name="month" defaultValue={month}>
          <option value="">Whole year</option>
          {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map((m) => (
            <option key={m} value={m}>{new Date(2000, Number(m) - 1).toLocaleString('en-US', { month: 'long' })}</option>
          ))}
        </Select>
        <Select name="year" defaultValue={yearParam}>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
          <option value="all">All years</option>
        </Select>
        <button className="h-10 rounded-lg border border-line bg-surface px-3 text-sm hover:bg-hover">Filter</button>
        {needsHome && <input type="hidden" name="needsHome" value="1" />}
      </form>
      {needsHome && (
        <div className="mb-3 text-sm text-fg-muted">
          Showing purchases with a line that isn’t on a job, a category or the equipment list. <Link href="/purchases" className="underline">Show all</Link>
        </div>
      )}
      <Card>
        <div className="flex justify-between border-b border-line px-4 py-2 text-xs text-fg-subtle">
          <span>{rows.length} purchase{rows.length === 1 ? '' : 's'}</span>
          <span>Total <Money cents={total} /></span>
        </div>
        {rows.length === 0 ? <Empty>No purchases{q ? ` match “${q}”` : ''}</Empty> : (
          <div className="divide-y divide-line">
            {rows.map((r) => (
              <Link key={r.purchase.id} href={`/purchases/${r.purchase.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-hover">
                <span className="w-14 shrink-0 text-xs text-fg-subtle">{formatDate(r.purchase.purchasedOn, { year: false })}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <span className="truncate">{r.purchase.vendor}</span>
                    {r.fileCount > 0 && <Paperclip size={12} className="shrink-0 text-fg-subtle" />}
                  </span>
                  <span className="block truncate text-xs text-fg-muted">
                    {r.lines.map((l) => l.job ? `#${jobNumber(l.job)}` : l.category ? l.category.name : l.line.assetId ? 'Equipment' : l.line.stock ? 'Stock' : 'Needs a home').join(' · ')}
                  </span>
                </span>
                {r.needsHome && <Badge tone="warn">Needs a home</Badge>}
                <Money cents={r.totalCents} className="shrink-0 text-sm" />
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
