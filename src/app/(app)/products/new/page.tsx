import { PageHeader } from '@/components/ui'
import { authedDb } from '@/server/session'
import { listStock } from '@/server/stock'
import { ProductForm } from '../product-form'

export const metadata = { title: 'New product' }

export default async function NewProductPage() {
  const db = await authedDb()
  const stock = await listStock(db)
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="New product" back={{ href: '/products', label: 'Products' }} />
      <ProductForm stock={stock.map(({ key, label, partNumber, quantityHundredths }) => ({ key, label, partNumber, quantityHundredths }))} />
    </div>
  )
}
