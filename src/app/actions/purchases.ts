'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import type { FormState } from '@/lib/form-state'
import { money, optStr, reqDate, reqInt, str } from '@/lib/form'
import { createPurchase, deletePurchase, updatePurchase, type PurchaseInput } from '@/server/purchases'
import { saveUploads } from '@/server/files'
import { run } from './run'

const target = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('job'),
    jobId: z.number().int(),
    bill: z.object({ amountCents: z.number().int(), description: z.string() }).nullish(),
  }),
  z.object({ kind: z.literal('category'), categoryId: z.number().int() }),
  z.object({ kind: z.literal('asset'), businessUsePct: z.number().int().min(1).max(100), description: z.string().nullish() }),
  z.object({ kind: z.literal('stock') }),
  z.object({ kind: z.literal('none') }),
])

const lines = z.array(z.object({
  id: z.number().int().nullish(),
  description: z.string().nullish(),
  partNumber: z.string().nullish(),
  quantityHundredths: z.number().int().positive('Quantity must be more than 0'),
  amountCents: z.number().int(),
  target,
  payee: z.string().nullish(),
})).min(1, 'Add at least one line')

function parse(fd: FormData): PurchaseInput {
  let raw: unknown
  try {
    raw = JSON.parse(str(fd, 'lines') || '[]')
  } catch {
    throw new Error('Couldn’t read the purchase lines')
  }
  const parsed = lines.safeParse(raw)
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Check the lines')
  for (const l of parsed.data) {
    if (l.target.kind === 'job' && !l.target.jobId) throw new Error('Pick a job')
    if (l.target.kind === 'category' && !l.target.categoryId) throw new Error('Pick a category')
  }
  return {
    purchasedOn: reqDate(fd, 'purchasedOn'),
    vendor: str(fd, 'vendor'),
    method: optStr(fd, 'method'),
    taxCents: money(fd, 'tax') ?? 0,
    shippingCents: money(fd, 'shipping') ?? 0,
    notes: optStr(fd, 'notes'),
    lines: parsed.data,
  }
}

function safeReturn(to: string) {
  return to.startsWith('/') && !to.startsWith('//') ? to : ''
}

export async function createPurchaseAction(_: FormState, fd: FormData): Promise<FormState> {
  let id = 0
  const result = await run(async (db) => {
    const p = await createPurchase(db, parse(fd))
    id = p.id
    await saveUploads(db, fd.getAll('receipt'), { kind: 'receipt', purchaseId: p.id })
  })
  if (result?.error) return result
  if (str(fd, 'another')) redirect(`/purchases/new?saved=${id}`)
  redirect(safeReturn(str(fd, 'returnTo')) || `/purchases/${id}?saved=1`)
}

export async function updatePurchaseAction(_: FormState, fd: FormData): Promise<FormState> {
  const id = reqInt(fd, 'id')
  const result = await run(async (db) => {
    await updatePurchase(db, id, parse(fd))
    await saveUploads(db, fd.getAll('receipt'), { kind: 'receipt', purchaseId: id })
  })
  if (result?.error) return result
  redirect(`/purchases/${id}?saved=1`)
}

export async function deletePurchaseAction(_: FormState, fd: FormData): Promise<FormState> {
  const result = await run(async (db) => {
    await deletePurchase(db, reqInt(fd, 'id'))
  })
  if (result?.error) return result
  redirect('/purchases')
}

export async function uploadReceiptAction(_: FormState, fd: FormData) {
  return run(async (db) => {
    await saveUploads(db, fd.getAll('receipt'), { kind: 'receipt', purchaseId: reqInt(fd, 'id') })
  })
}
