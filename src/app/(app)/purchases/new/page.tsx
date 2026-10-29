import { PageHeader, Notice } from '@/components/ui'
import { PurchaseForm } from '@/components/purchase-form'
import { authedDb } from '@/server/session'
import { purchaseFormData } from '@/server/pickers'
import { today } from '@/server/settings'

export const metadata = { title: 'New purchase' }

export default async function NewPurchasePage({ searchParams }: PageProps<'/purchases/new'>) {
  const sp = await searchParams
  const db = await authedDb()
  const jobId = typeof sp.job === 'string' ? Number(sp.job) : null
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="New purchase" back={jobId ? { href: `/jobs/${jobId}`, label: 'Job' } : { href: '/purchases', label: 'Purchases' }} />
      {sp.saved && <Notice tone="good" className="mb-3">Saved. Next one:</Notice>}
      <PurchaseForm
        key={String(sp.saved ?? '')}
        data={await purchaseFormData(db)}
        today={await today(db)}
        presetJobId={jobId}
        returnTo={jobId ? `/jobs/${jobId}` : undefined}
      />
    </div>
  )
}
