'use server'

import { redirect } from 'next/navigation'
import type { FormState } from '@/lib/form-state'
import { int, money, oneOf, optStr, reqDate, reqInt, reqMoney, str } from '@/lib/form'
import { parseScaled } from '@/lib/money'
import type { PaymentMethod } from '@/db/schema'
import { jobNumber } from '@/server/jobs'
import { deleteProduct, quickSale, saveProduct, sellProduct } from '@/server/products'
import { run } from './run'

const METHODS = ['cash', 'check', 'venmo', 'paypal', 'zelle', 'card', 'other'] as const satisfies readonly PaymentMethod[]

// Parts come in as parallel lists: partKey, partLabel, partQty.
export async function saveProductAction(_: FormState, fd: FormData): Promise<FormState> {
  let id = int(fd, 'id')
  const result = await run(async (db) => {
    const keys = fd.getAll('partKey').map(String)
    const labels = fd.getAll('partLabel').map(String)
    const qtys = fd.getAll('partQty').map(String)
    const parts = keys.flatMap((k, i) => {
      if (!k) return []
      const label = labels[i] || k
      const q = parseScaled(qtys[i], 100)
      if (q == null || q <= 0) throw new Error(`Enter how many ${label} go into one`)
      return [{ stockKey: k, label, quantityHundredths: q }]
    })
    const row = await saveProduct(db, id, {
      name: str(fd, 'name'),
      priceCents: reqMoney(fd, 'price', 'a price'),
      notes: optStr(fd, 'notes'),
      active: !str(fd, 'retired'),
      parts,
    })
    id = row.id
  })
  if (result?.error) return result
  redirect('/products')
}

export async function deleteProductAction(_: FormState, fd: FormData): Promise<FormState> {
  const result = await run(async (db) => {
    await deleteProduct(db, reqInt(fd, 'id'))
  })
  if (result?.error) return result
  redirect('/products')
}

export async function sellProductAction(_: FormState, fd: FormData): Promise<FormState> {
  return run(async (db) => {
    await sellProduct(db, reqInt(fd, 'jobId', 'the job'), {
      productId: reqInt(fd, 'productId', 'a product'),
      quantity: reqInt(fd, 'quantity', 'how many'),
      priceCents: reqMoney(fd, 'price', 'a price'),
      usedOn: reqDate(fd, 'usedOn'),
    })
  })
}

// Stays on the form so the next sale can go straight in; returns the new
// job's id and number for the confirmation.
export async function quickSaleAction(_: FormState, fd: FormData): Promise<FormState> {
  return run(async (db) => {
    const customerId = int(fd, 'customerId')
    const shipping = money(fd, 'shipping')
    const paid = str(fd, 'paid') ? money(fd, 'amount') : null
    const job = await quickSale(db, {
      soldOn: reqDate(fd, 'soldOn', 'the sale date'),
      customerId,
      customer: customerId ? null : { name: str(fd, 'customerName'), email: optStr(fd, 'customerEmail') },
      productId: reqInt(fd, 'productId', 'a product'),
      quantity: reqInt(fd, 'quantity', 'how many'),
      priceCents: reqMoney(fd, 'price', 'a price'),
      shipping: shipping ? { carrier: str(fd, 'carrier'), costCents: shipping } : null,
      payment: paid ? {
        amountCents: paid,
        method: oneOf(fd, 'method', METHODS, 'other'),
        feeCents: money(fd, 'fee') ?? 0,
        note: optStr(fd, 'paymentNote'),
      } : null,
      notes: optStr(fd, 'notes'),
    })
    return { message: `Saved #${jobNumber(job)}`, id: job.id }
  })
}
