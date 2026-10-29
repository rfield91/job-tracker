'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Button, Money } from '@/components/ui'
import { ShopUseForm, UseStockForm, type StockOption } from '@/components/use-stock'
import { formatDate } from '@/lib/dates'
import { formatMoney, formatQuantity } from '@/lib/money'
import type { JobOption } from '@/server/pickers'

export function StockRow({ item, jobs, categories, today, markupPct }: {
  item: StockOption
  jobs: JobOption[]
  categories: { id: number; name: string }[]
  today: string
  markupPct: number
}) {
  const [open, setOpen] = useState<'job' | 'shop' | null>(null)
  const each = (cents: number, qty: number) => formatMoney(Math.round((cents * 100) / qty))
  return (
    <div className="px-4 py-2.5">
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="block text-sm">
            <span className="text-fg-muted tabular">{formatQuantity(item.quantityHundredths)} × </span>
            {item.label}
            {item.partNumber && <span className="ml-1.5 text-xs text-fg-subtle tabular">#{item.partNumber}</span>}
          </span>
          {item.lots.map((lot) => (
            <Link key={lot.lineId} href={`/purchases/${lot.purchaseId}`} className="block text-xs text-fg-subtle hover:underline">
              {item.lots.length > 1 && `${formatQuantity(lot.quantityHundredths)} from `}
              {lot.vendor} · {formatDate(lot.purchasedOn)} · {each(lot.allocatedCents, lot.quantityHundredths)} each
            </Link>
          ))}
        </span>
        <Money cents={item.allocatedCents} className="text-sm" />
        {!open && (
          <>
            <Button size="sm" onClick={() => setOpen('job')}>Use on job</Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen('shop')}>Shop use</Button>
          </>
        )}
      </div>
      {open && (
        <div className="mt-3 rounded-lg border border-line bg-raised p-3">
          {open === 'job'
            ? <UseStockForm items={[item]} jobs={jobs} today={today} markupPct={markupPct} onDone={() => setOpen(null)} />
            : <ShopUseForm item={item} categories={categories} today={today} onDone={() => setOpen(null)} />}
          {item.lots.length > 1 && <div className="mt-2 text-xs text-fg-subtle">Takes from the oldest receipt first.</div>}
        </div>
      )}
    </div>
  )
}
