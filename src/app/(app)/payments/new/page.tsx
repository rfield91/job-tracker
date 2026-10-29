import { PageHeader } from '@/components/ui'
import { authedDb } from '@/server/session'
import { jobOptions } from '@/server/pickers'
import { today } from '@/server/settings'
import { NewPaymentForm } from './new-payment-form'

export const metadata = { title: 'New payment' }

export default async function NewPaymentPage() {
  const db = await authedDb()
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Record a payment" back={{ href: '/', label: 'Home' }} />
      <NewPaymentForm jobs={await jobOptions(db)} today={await today(db)} />
    </div>
  )
}
