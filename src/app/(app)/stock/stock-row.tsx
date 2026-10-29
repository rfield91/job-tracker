'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Button, Money } from '@/components/ui'
import { UseStockForm, type StockOption } from '@/components/use-stock'
import { formatDate } from '@/lib/dates'
import { formatMoney, formatQuantity } from '@/lib/money'
import type { JobOption } from '@/server/pickers'

export function StockRow({ item, purchaseId, purchasedOn, jobs, today, markupPct }: {
  item: StockOption
  purchaseId: number
  purchasedOn: string
  jobs: JobOption[]
  today: string
  markupPct: number
}) {
  const [open, setOpen] = useState(false)
  const each = Math.round((item.allocatedCents * 100) / item.quantityHundredths)
  return (
    <div className="px-4 py-2.5">
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="block text-sm">
            <span className="text-fg-muted tabular">{formatQuantity(item.quantityHundredths)} × </span>
            {item.label}
            {item.partNumber && <span className="ml-1.5 text-xs text-fg-subtle tabular">#{item.partNumber}</span>}
          </span>
          <Link href={`/purchases/${purchaseId}`} className="block text-xs text-fg-subtle hover:underline">
            {item.vendor} · {formatDate(purchasedOn)}{item.quantityHundredths !== 100 && ` · ${formatMoney(each)} each`}
          </Link>
        </span>
        <Money cents={item.allocatedCents} className="text-sm" />
        {!open && <Button size="sm" onClick={() => setOpen(true)}>Use</Button>}
      </div>
      {open && (
        <div className="mt-3 rounded-lg border border-line bg-raised p-3">
          <UseStockForm items={[item]} jobs={jobs} today={today} markupPct={markupPct} onDone={() => setOpen(false)} />
        </div>
      )}
    </div>
  )
}
