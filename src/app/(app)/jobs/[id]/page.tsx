import { notFound } from 'next/navigation'
import { authedDb } from '@/server/session'
import { getJobDetail, jobNumber } from '@/server/jobs'
import { getSettings, today } from '@/server/settings'
import { listStock } from '@/server/stock'
import { listProducts } from '@/server/products'
import { stripeEnabled } from '@/server/stripe'
import { JobView } from './job-view'

export async function generateMetadata({ params }: PageProps<'/jobs/[id]'>) {
  const db = await authedDb()
  const d = await getJobDetail(db, Number((await params).id))
  return { title: d ? `${jobNumber(d.job)} ${d.job.title}` : 'Job' }
}

export default async function JobPage({ params }: PageProps<'/jobs/[id]'>) {
  const id = Number((await params).id)
  if (!Number.isInteger(id)) notFound()
  const db = await authedDb()
  const detail = await getJobDetail(db, id)
  if (!detail) notFound()
  const s = await getSettings(db)
  return (
    <JobView
      detail={detail}
      number={jobNumber(detail.job)}
      today={await today(db)}
      laborRateCents={s.laborRateCents}
      markupPct={s.partsMarkupPct}
      stripe={stripeEnabled()}
      customerHasEmail={Boolean(detail.customer.email)}
      stock={await listStock(db)}
      products={(await listProducts(db, detail.job.year, { activeOnly: true }))
        .map((p) => ({ id: p.id, name: p.name, priceCents: p.priceCents, canBuild: p.canBuild, hasParts: p.parts.length > 0 }))}
    />
  )
}
