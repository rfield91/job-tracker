import Stripe from 'stripe'
import { eq } from 'drizzle-orm'
import type { Db } from '@/db'
import { customers, paymentRequests, payments, type PaymentPurpose } from '@/db/schema'
import { todayIn } from '@/lib/dates'
import { getJobDetail, jobNumber, refreshJobStatus } from './jobs'
import { getSettings } from './settings'

// Stripe is the online payment channel: the app writes the invoice, Stripe
// collects the money, and the webhook records each charge (gross amount and
// fee) on its job. Website payments that weren't requested from a job land
// unmatched until they're assigned.

export function stripeEnabled() {
  return Boolean(process.env.STRIPE_SECRET_KEY)
}

export type StripeApi = Pick<Stripe, 'customers' | 'invoices' | 'invoiceItems' | 'invoicePayments' | 'balanceTransactions' | 'refunds'>

export function stripeClient(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('Stripe isn’t set up (STRIPE_SECRET_KEY)')
  return new Stripe(process.env.STRIPE_SECRET_KEY, { appInfo: { name: 'job-tracker' } })
}

export async function requestPayment(db: Db, stripe: StripeApi, input: {
  jobId: number
  amountCents: number
  purpose: Exclude<PaymentPurpose, 'refund'>
  itemize: boolean
}) {
  if (input.amountCents < 50) throw new Error('Stripe needs at least $0.50')
  const d = await getJobDetail(db, input.jobId)
  if (!d) throw new Error('Job not found')
  if (!d.customer.email) throw new Error('The customer needs an email address for Stripe to send the invoice')
  const settings = await getSettings(db)
  const number = jobNumber(d.job)

  let stripeCustomerId = d.customer.stripeCustomerId
  if (!stripeCustomerId) {
    const c = await stripe.customers.create({
      name: d.customer.name,
      email: d.customer.email,
      phone: d.customer.phone ?? undefined,
      metadata: { customer_id: String(d.customer.id) },
    })
    stripeCustomerId = c.id
    await db.update(customers).set({ stripeCustomerId }).where(eq(customers.id, d.customer.id))
  }

  const label = input.purpose === 'deposit' ? 'Deposit' : input.purpose === 'progress' ? 'Progress payment' : 'Payment'
  const description = `${label} for job #${number}: ${d.job.title}`
  const [req] = await db.insert(paymentRequests).values({
    jobId: d.job.id,
    amountCents: input.amountCents,
    purpose: input.purpose,
    description,
  }).returning()

  try {
    const invoice = await stripe.invoices.create({
      customer: stripeCustomerId,
      collection_method: 'send_invoice',
      days_until_due: settings.invoiceDueDays,
      auto_advance: false,
      description,
      footer: settings.invoiceFooter || undefined,
      pending_invoice_items_behavior: 'exclude',
      metadata: { job_id: String(d.job.id), payment_request_id: String(req.id), job_number: number },
      payment_settings: { payment_method_types: ['card', 'us_bank_account'] },
    })
    const items = invoiceItems(d, input, description)
    for (const it of items) {
      await stripe.invoiceItems.create({
        customer: stripeCustomerId,
        invoice: invoice.id,
        amount: it.amountCents,
        currency: 'usd',
        description: it.description,
      })
    }
    await stripe.invoices.finalizeInvoice(invoice.id!)
    const sent = await stripe.invoices.sendInvoice(invoice.id!)
    const [row] = await db.update(paymentRequests).set({
      stripeInvoiceId: sent.id,
      hostedUrl: sent.hosted_invoice_url ?? null,
    }).where(eq(paymentRequests.id, req.id)).returning()
    return row
  } catch (err) {
    await db.delete(paymentRequests).where(eq(paymentRequests.id, req.id))
    throw err
  }
}

// Job lines less payments so far, when that adds up to the requested amount;
// otherwise a single line.
export function invoiceItems(d: Pick<NonNullable<Awaited<ReturnType<typeof getJobDetail>>>, 'lines' | 'totals'>,
  input: { amountCents: number; itemize: boolean }, description: string) {
  if (input.itemize) {
    const items = d.lines.map((l) => ({ description: l.description, amountCents: l.amountCents }))
    if (d.totals.paidCents) items.push({ description: 'Payments received', amountCents: -d.totals.paidCents })
    if (items.reduce((a, i) => a + i.amountCents, 0) === input.amountCents) return items
  }
  return [{ description, amountCents: input.amountCents }]
}

export async function voidRequest(db: Db, stripe: StripeApi, id: number) {
  const [req] = await db.select().from(paymentRequests).where(eq(paymentRequests.id, id))
  if (!req) throw new Error('Request not found')
  if (req.status !== 'sent') throw new Error('Only unpaid requests can be voided')
  if (req.stripeInvoiceId) await stripe.invoices.voidInvoice(req.stripeInvoiceId)
  await db.update(paymentRequests).set({ status: 'void' }).where(eq(paymentRequests.id, id))
}

// ---- webhook -------------------------------------------------------------

export async function handleStripeEvent(db: Db, stripe: StripeApi, event: Stripe.Event) {
  switch (event.type) {
    case 'charge.succeeded':
    case 'charge.updated':
      return recordCharge(db, stripe, event.data.object as Stripe.Charge)
    case 'charge.refunded':
      return recordRefunds(db, stripe, event.data.object as Stripe.Charge)
    case 'invoice.voided':
    case 'invoice.marked_uncollectible': {
      const inv = event.data.object as Stripe.Invoice
      if (inv.id) await db.update(paymentRequests).set({ status: 'void' }).where(eq(paymentRequests.stripeInvoiceId, inv.id))
      return
    }
    default:
      return
  }
}

async function feeFor(stripe: StripeApi, charge: Stripe.Charge) {
  const bt = charge.balance_transaction
  if (!bt) return null
  if (typeof bt !== 'string') return bt.fee
  return (await stripe.balanceTransactions.retrieve(bt)).fee
}

async function invoiceFor(stripe: StripeApi, charge: Stripe.Charge) {
  const pi = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id
  if (!pi) return null
  const list = await stripe.invoicePayments.list({ payment: { type: 'payment_intent', payment_intent: pi }, limit: 1 })
  const inv = list.data[0]?.invoice
  return inv ? (typeof inv === 'string' ? inv : inv.id ?? null) : null
}

async function recordCharge(db: Db, stripe: StripeApi, charge: Stripe.Charge) {
  if (charge.status !== 'succeeded' || !charge.paid) return
  const [existing] = await db.select().from(payments).where(eq(payments.stripeChargeId, charge.id))
  if (existing) {
    // ACH charges can arrive before their fee is known; fill it in later.
    if (existing.feeCents === 0) {
      const fee = await feeFor(stripe, charge)
      if (fee) await db.update(payments).set({ feeCents: fee }).where(eq(payments.id, existing.id))
    }
    return
  }
  const settings = await getSettings(db)
  const invoiceId = await invoiceFor(stripe, charge)
  const [req] = invoiceId
    ? await db.select().from(paymentRequests).where(eq(paymentRequests.stripeInvoiceId, invoiceId))
    : []
  const fee = await feeFor(stripe, charge)
  const inserted = await db.insert(payments).values({
    jobId: req?.jobId ?? null,
    receivedOn: todayIn(settings.timezone, new Date(charge.created * 1000)),
    amountCents: charge.amount,
    purpose: req?.purpose ?? 'final',
    method: 'stripe',
    feeCents: fee ?? 0,
    note: req ? null : charge.description,
    payerName: charge.billing_details?.name || charge.billing_details?.email || charge.receipt_email || null,
    stripeChargeId: charge.id,
    stripeInvoiceId: invoiceId,
    paymentRequestId: req?.id ?? null,
  }).onConflictDoNothing().returning()
  if (req && inserted.length) {
    await db.update(paymentRequests).set({ status: 'paid', paidAt: new Date() }).where(eq(paymentRequests.id, req.id))
    await refreshJobStatus(db, req.jobId)
  }
}

async function recordRefunds(db: Db, stripe: StripeApi, charge: Stripe.Charge) {
  const [original] = await db.select().from(payments).where(eq(payments.stripeChargeId, charge.id))
  const settings = await getSettings(db)
  const refunds = await stripe.refunds.list({ charge: charge.id, limit: 100 })
  for (const r of refunds.data) {
    if (r.status !== 'succeeded') continue
    await db.insert(payments).values({
      jobId: original?.jobId ?? null,
      receivedOn: todayIn(settings.timezone, new Date(r.created * 1000)),
      amountCents: -r.amount,
      purpose: 'refund',
      method: 'stripe',
      note: r.reason ? `Refund: ${r.reason.replace(/_/g, ' ')}` : 'Refund',
      payerName: original?.payerName ?? null,
      stripeRefundId: r.id,
      stripeChargeId: null,
    }).onConflictDoNothing()
  }
  if (original?.jobId) await refreshJobStatus(db, original.jobId)
}
