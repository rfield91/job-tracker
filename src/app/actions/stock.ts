'use server'

import type { FormState } from '@/lib/form-state'
import { money, reqDate, reqInt, scaled, str } from '@/lib/form'
import { returnToStock, takeFromStock } from '@/server/stock'
import { run } from './run'

export async function takeFromStockAction(_: FormState, fd: FormData): Promise<FormState> {
  return run(async (db) => {
    const quantity = scaled(fd, 'quantity', 100)
    if (quantity == null) throw new Error('Enter how many you used')
    const billed = str(fd, 'bill') ? money(fd, 'billed') : null
    await takeFromStock(db, reqInt(fd, 'stockLineId', 'a stock item'), {
      jobId: reqInt(fd, 'jobId', 'the job'),
      quantityHundredths: quantity,
      usedOn: reqDate(fd, 'usedOn'),
      bill: billed != null ? { amountCents: billed, description: str(fd, 'description') } : null,
    })
  })
}

export async function returnToStockAction(_: FormState, fd: FormData): Promise<FormState> {
  return run(async (db) => {
    await returnToStock(db, reqInt(fd, 'id'))
  })
}
