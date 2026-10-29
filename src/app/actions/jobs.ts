'use server'

import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import type { FormState } from '@/lib/form-state'
import { int, money, oneOf, optDate, optStr, reqDate, reqInt, reqMoney, scaled, str } from '@/lib/form'
import { laborAmount, parseMoney } from '@/lib/money'
import { jobTemplates, type JobKind, type JobLineType, type JobStatus, type PaymentPurpose, type PaymentMethod } from '@/db/schema'
import {
  addJobLine, addPart, billCost, createJob, deleteJob, deleteJobLine, parseVehicle, saveAsTemplate,
  updateJob, updateJobLine,
} from '@/server/jobs'
import { addPayment, assignPayment, deletePayment, updatePayment } from '@/server/payments'
import { deleteFile, saveUploads } from '@/server/files'
import { createVehicle } from '@/server/jobs'
import { run } from './run'

const KINDS = ['service', 'fabrication'] as const satisfies readonly JobKind[]
const STATUSES = ['quote', 'in_progress', 'done', 'paid'] as const satisfies readonly JobStatus[]
const PURPOSES = ['deposit', 'progress', 'final', 'refund'] as const satisfies readonly PaymentPurpose[]
const METHODS = ['cash', 'check', 'venmo', 'paypal', 'zelle', 'stripe', 'card', 'other'] as const satisfies readonly PaymentMethod[]

export async function createJobAction(_: FormState, fd: FormData): Promise<FormState> {
  let id = 0
  const result = await run(async (db) => {
    const customerId = int(fd, 'customerId')
    const vehicleChoice = str(fd, 'vehicleId')
    const vehicleText = str(fd, 'vehicleText')
    const job = await createJob(db, {
      customerId,
      customer: customerId ? null : { name: str(fd, 'customerName'), phone: optStr(fd, 'customerPhone'), email: optStr(fd, 'customerEmail') },
      vehicleId: vehicleChoice && vehicleChoice !== 'new' ? Number(vehicleChoice) : null,
      vehicle: vehicleChoice === 'new' || !vehicleChoice ? parseVehicle(vehicleText) : null,
      title: str(fd, 'title') || 'Untitled job',
      kind: oneOf(fd, 'kind', KINDS, 'service'),
      status: oneOf(fd, 'status', STATUSES, 'in_progress'),
      openedOn: reqDate(fd, 'openedOn'),
      notes: optStr(fd, 'notes'),
      templateId: int(fd, 'templateId'),
    })
    id = job.id
  })
  if (result?.error) return result
  redirect(`/jobs/${id}`)
}

export async function updateJobAction(_: FormState, fd: FormData) {
  return run(async (db) => {
    const id = reqInt(fd, 'id')
    const vehicleChoice = str(fd, 'vehicleId')
    let vehicleId: number | null = vehicleChoice && vehicleChoice !== 'new' ? Number(vehicleChoice) : null
    if (vehicleChoice === 'new') {
      const v = parseVehicle(str(fd, 'vehicleText'))
      if (v) vehicleId = (await createVehicle(db, reqInt(fd, 'customerId'), v)).id
    }
    await updateJob(db, id, {
      title: str(fd, 'title') || 'Untitled job',
      kind: oneOf(fd, 'kind', KINDS, 'service'),
      openedOn: reqDate(fd, 'openedOn'),
      completedOn: optDate(fd, 'completedOn'),
      notes: optStr(fd, 'notes'),
      vehicleId,
    })
  })
}

export async function setStatusAction(_: FormState, fd: FormData) {
  return run(async (db) => {
    await updateJob(db, reqInt(fd, 'id'), { status: oneOf(fd, 'status', STATUSES, 'in_progress') })
  })
}

export async function deleteJobAction(_: FormState, fd: FormData): Promise<FormState> {
  const result = await run(async (db) => {
    await deleteJob(db, reqInt(fd, 'id'))
  })
  if (result?.error) return result
  redirect('/jobs')
}

export async function addLineAction(_: FormState, fd: FormData) {
  return run(async (db) => {
    const jobId = reqInt(fd, 'jobId')
    const type = oneOf<JobLineType>(fd, 'type', ['labor', 'part', 'fee', 'discount'], 'labor')
    const description = str(fd, 'description')
    if (type === 'labor') {
      const hours = scaled(fd, 'hours', 100)
      const rate = money(fd, 'rate')
      const flat = money(fd, 'amount')
      if (hours == null && flat == null) throw new Error('Enter hours or a flat price')
      await addJobLine(db, jobId, {
        type,
        description: description || 'Labor',
        hoursHundredths: hours,
        rateCents: hours != null ? rate ?? 0 : null,
        amountCents: hours != null && flat == null ? laborAmount(hours, rate ?? 0) : flat!,
      })
      return
    }
    await addJobLine(db, jobId, {
      type,
      description: description || (type === 'discount' ? 'Discount' : type === 'fee' ? 'Fee' : 'Part'),
      amountCents: reqMoney(fd, 'amount', 'an amount'),
    })
  })
}

export async function addPartAction(_: FormState, fd: FormData) {
  return run(async (db) => {
    const jobId = reqInt(fd, 'jobId')
    const description = str(fd, 'description')
    if (!description) throw new Error('Describe the part')
    const cost = money(fd, 'cost')
    const billed = money(fd, 'billed')
    if (billed == null && cost == null) throw new Error('Enter a cost or a billed price')
    const quantity = scaled(fd, 'quantity', 100) ?? 100
    if (quantity <= 0) throw new Error('Quantity must be more than 0')
    const { purchaseId } = await addPart(db, jobId, {
      description,
      partNumber: optStr(fd, 'partNumber'),
      quantityHundredths: quantity,
      costCents: cost,
      billedCents: billed ?? 0,
      vendor: optStr(fd, 'vendor'),
      purchasedOn: reqDate(fd, 'purchasedOn'),
      method: optStr(fd, 'method'),
    })
    if (purchaseId) await saveUploads(db, fd.getAll('receipt'), { kind: 'receipt', purchaseId })
  })
}

export async function updateLineAction(_: FormState, fd: FormData) {
  return run(async (db) => {
    const id = reqInt(fd, 'id')
    const type = oneOf<JobLineType>(fd, 'type', ['labor', 'part', 'fee', 'discount'], 'labor')
    const description = str(fd, 'description')
    if (type === 'labor') {
      const hours = scaled(fd, 'hours', 100)
      const rate = money(fd, 'rate')
      const flat = money(fd, 'amount')
      await updateJobLine(db, id, {
        type,
        description: description || 'Labor',
        hoursHundredths: hours,
        rateCents: hours != null ? rate ?? 0 : null,
        amountCents: hours != null ? laborAmount(hours, rate ?? 0) : flat ?? 0,
      })
      return
    }
    await updateJobLine(db, id, { type, description, amountCents: reqMoney(fd, 'amount', 'an amount') })
  })
}

export async function deleteLineAction(_: FormState, fd: FormData) {
  return run(async (db) => {
    await deleteJobLine(db, reqInt(fd, 'id'))
  })
}

export async function billCostAction(_: FormState, fd: FormData) {
  return run(async (db) => {
    await billCost(db, reqInt(fd, 'purchaseLineId'), reqMoney(fd, 'billed', 'a billed price'), str(fd, 'description'))
  })
}

function paymentFields(fd: FormData) {
  const amount = parseMoney(str(fd, 'amount'))
  if (amount == null || amount === 0) throw new Error('Enter the amount')
  return {
    receivedOn: reqDate(fd, 'receivedOn'),
    amountCents: amount,
    purpose: oneOf(fd, 'purpose', PURPOSES, 'final'),
    method: oneOf(fd, 'method', METHODS, 'cash'),
    feeCents: money(fd, 'fee') ?? 0,
    note: optStr(fd, 'note'),
  }
}

export async function addPaymentAction(_: FormState, fd: FormData): Promise<FormState> {
  let jobId = 0
  const result = await run(async (db) => {
    jobId = reqInt(fd, 'jobId', 'a job')
    await addPayment(db, { jobId, ...paymentFields(fd) })
  })
  if (result?.error || !str(fd, 'redirect')) return result
  redirect(`/jobs/${jobId}`)
}

export async function updatePaymentAction(_: FormState, fd: FormData) {
  return run(async (db) => {
    await updatePayment(db, reqInt(fd, 'id'), paymentFields(fd))
  })
}

export async function deletePaymentAction(_: FormState, fd: FormData) {
  return run(async (db) => {
    await deletePayment(db, reqInt(fd, 'id'))
  })
}

export async function assignPaymentAction(_: FormState, fd: FormData) {
  return run(async (db) => {
    await assignPayment(db, reqInt(fd, 'id'), reqInt(fd, 'jobId', 'a job'), oneOf(fd, 'purpose', PURPOSES, 'final'))
  })
}

export async function saveTemplateAction(_: FormState, fd: FormData) {
  return run(async (db) => {
    const t = await saveAsTemplate(db, reqInt(fd, 'jobId'), str(fd, 'name'))
    return { message: `Saved template “${t.name}”` }
  })
}

export async function deleteTemplateAction(_: FormState, fd: FormData) {
  return run(async (db) => {
    await db.delete(jobTemplates).where(eq(jobTemplates.id, reqInt(fd, 'id')))
  })
}

export async function uploadJobPhotosAction(_: FormState, fd: FormData) {
  return run(async (db) => {
    await saveUploads(db, fd.getAll('photos'), { kind: 'photo', jobId: reqInt(fd, 'jobId') })
  })
}

export async function deleteFileAction(_: FormState, fd: FormData) {
  return run(async (db) => {
    await deleteFile(db, reqInt(fd, 'id'))
  })
}
