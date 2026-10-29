'use server'

import type { FormState } from '@/lib/form-state'
import { oneOf, reqInt, reqMoney, str } from '@/lib/form'
import { requestPayment, stripeClient, voidRequest } from '@/server/stripe'
import { run } from './run'

export async function requestPaymentAction(_: FormState, fd: FormData) {
  return run(async (db) => {
    await requestPayment(db, stripeClient(), {
      jobId: reqInt(fd, 'jobId'),
      amountCents: reqMoney(fd, 'amount', 'an amount'),
      purpose: oneOf(fd, 'purpose', ['deposit', 'progress', 'final'] as const, 'final'),
      itemize: str(fd, 'itemize') === 'lines',
    })
    return { message: 'Sent' }
  })
}

export async function voidRequestAction(_: FormState, fd: FormData) {
  return run(async (db) => {
    await voidRequest(db, stripeClient(), reqInt(fd, 'id'))
  })
}
