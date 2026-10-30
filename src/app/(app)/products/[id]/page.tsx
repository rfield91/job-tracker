import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/ui'
import { authedDb } from '@/server/session'
import { getProduct } from '@/server/products'
import { today } from '@/server/settings'
import { listStock } from '@/server/stock'
import { ProductForm } from '../product-form'

export const metadata = { title: 'Product' }

export default async function ProductPage({ params }: PageProps<'/products/[id]'>) {
  const id = Number((await params).id)
  if (!Number.isInteger(id)) notFound()
  const db = await authedDb()
  const product = await getProduct(db, id, Number((await today(db)).slice(0, 4)))
  if (!product) notFound()
  const stock = await listStock(db)
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title={product.name} back={{ href: '/products', label: 'Products' }} />
      <ProductForm
        stock={stock.map(({ key, label, partNumber, quantityHundredths }) => ({ key, label, partNumber, quantityHundredths }))}
        product={product}
      />
    </div>
  )
}
