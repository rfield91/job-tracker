import { and, desc, eq, isNull } from 'drizzle-orm'
import type { Db } from '@/db'
import { payments, type PaymentMethod, type PaymentPurpose } from '@/db/schema'
import { refreshJobStatus } from './jobs'

export const PURPOSE_LABELS: Record<PaymentPurpose, string> = {
  deposit: 'Deposit',
  progress: 'Progress',
  final: 'Final',
  refund: 'Refund',
}

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  check: 'Check',
  venmo: 'Venmo',
  paypal: 'PayPal',
  zelle: 'Zelle',
  stripe: 'Stripe',
  card: 'Card (other)',
  other: 'Other',
}

// Methods offered when recording a payment by hand. Stripe payments arrive
// through the webhook.
export const MANUAL_METHODS: PaymentMethod[] = ['cash', 'check', 'venmo', 'paypal', 'zelle', 'card', 'other']

export type PaymentInput = {
  jobId: number
  receivedOn: string
  amountCents: number
  purpose: PaymentPurpose
  method: PaymentMethod
  feeCents?: number
  note?: string | null
}

export async function addPayment(db: Db, input: PaymentInput) {
  const amount = input.purpose === 'refund' ? -Math.abs(input.amountCents) : input.amountCents
  const [row] = await db.insert(payments).values({
    jobId: input.jobId,
    receivedOn: input.receivedOn,
    amountCents: amount,
    purpose: input.purpose,
    method: input.method,
    feeCents: Math.abs(input.feeCents ?? 0),
    note: input.note || null,
  }).returning()
  await refreshJobStatus(db, input.jobId)
  return row
}

export async function updatePayment(db: Db, id: number, input: Omit<PaymentInput, 'jobId'>) {
  const amount = input.purpose === 'refund' ? -Math.abs(input.amountCents) : input.amountCents
  const [row] = await db.update(payments).set({
    receivedOn: input.receivedOn,
    amountCents: amount,
    purpose: input.purpose,
    method: input.method,
    feeCents: Math.abs(input.feeCents ?? 0),
    note: input.note || null,
  }).where(eq(payments.id, id)).returning()
  if (row?.jobId) await refreshJobStatus(db, row.jobId)
  return row
}

export async function deletePayment(db: Db, id: number) {
  const [row] = await db.delete(payments).where(eq(payments.id, id)).returning()
  if (row?.jobId) await refreshJobStatus(db, row.jobId)
  return row
}

// Stripe payments that came in without a payment request (website checkout).
export async function unmatchedPayments(db: Db) {
  return db.select().from(payments).where(isNull(payments.jobId)).orderBy(desc(payments.receivedOn))
}

export async function assignPayment(db: Db, id: number, jobId: number, purpose: PaymentPurpose) {
  const [row] = await db.update(payments).set({ jobId, purpose })
    .where(and(eq(payments.id, id), isNull(payments.jobId))).returning()
  if (!row) throw new Error('That payment is already on a job')
  await refreshJobStatus(db, jobId)
  return row
}
