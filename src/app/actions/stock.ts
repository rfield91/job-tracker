'use server'

import type { FormState } from '@/lib/form-state'
import { int, money, reqDate, reqInt, reqMoney, scaled, str } from '@/lib/form'
import { billStockUse, returnToStock, takeFromStock, useForShop } from '@/server/stock'
import { run } from './run'

export async function takeFromStockAction(_: FormState, fd: FormData): Promise<FormState> {
  return run(async (db) => {
    const quantity = scaled(fd, 'quantity', 100)
    if (quantity == null) throw new Error('Enter how many you used')
    const key = str(fd, 'stockKey')
    if (!key) throw new Error('Pick a stock item')
    const billed = str(fd, 'bill') ? money(fd, 'billed') : null
    await takeFromStock(db, key, {
      jobId: reqInt(fd, 'jobId', 'the job'),
      quantityHundredths: quantity,
      usedOn: reqDate(fd, 'usedOn'),
      bill: billed != null ? { amountCents: billed, description: str(fd, 'description') } : null,
    })
  })
}

export async function useForShopAction(_: FormState, fd: FormData): Promise<FormState> {
  return run(async (db) => {
    const quantity = scaled(fd, 'quantity', 100)
    if (quantity == null) throw new Error('Enter how many you used')
    const key = str(fd, 'stockKey')
    if (!key) throw new Error('Pick a stock item')
    await useForShop(db, key, {
      categoryId: reqInt(fd, 'categoryId', 'a category'),
      quantityHundredths: quantity,
      usedOn: reqDate(fd, 'usedOn'),
      note: str(fd, 'note') || null,
    })
  })
}

// With useId: one stock use that isn't on an invoice (a job cost or the
// shop's own use). With jobLineId: an invoice
// line and everything it billed from stock.
export async function returnToStockAction(_: FormState, fd: FormData): Promise<FormState> {
  return run(async (db) => {
    const useId = int(fd, 'useId')
    await returnToStock(db, useId != null ? { useId } : { jobLineId: reqInt(fd, 'jobLineId') })
  })
}

export async function billStockUseAction(_: FormState, fd: FormData): Promise<FormState> {
  return run(async (db) => {
    await billStockUse(db, reqInt(fd, 'useId'), reqMoney(fd, 'billed', 'a billed price'), str(fd, 'description'))
  })
}
