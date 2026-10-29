import { beforeEach, describe, expect, it } from 'vitest'
import type Stripe from 'stripe'
import { eq } from 'drizzle-orm'
import { openPglite, type Db } from '@/db'
import { assets, categories, paymentRequests, payments } from '@/db/schema'
import { addJobLine, addPart, createJob, getJobDetail, jobTotals, listJobs, updateJob } from './jobs'
import { addPayment, assignPayment, unmatchedPayments } from './payments'
import { createPurchase, deletePurchase, getPurchase, updatePurchase } from './purchases'
import { monthlyReport, taxWorksheet } from './reports'
import { saveSettings } from './settings'
import { addTrip } from './trips'
import { commitImport } from './import'
import { handleStripeEvent, invoiceItems, type StripeApi } from './stripe'

let db: Db

beforeEach(async () => {
  db = await openPglite('memory')
})

async function category(name: string) {
  const [c] = await db.select().from(categories).where(eq(categories.name, name))
  return c
}

async function newJob(title = 'Catback exhaust', openedOn = '2026-10-10') {
  return createJob(db, {
    customer: { name: 'Mike R.', phone: '555-0100' },
    vehicle: { year: 2008, make: 'Subaru', model: 'WRX' },
    title, kind: 'fabrication', openedOn,
  })
}

describe('jobs', () => {
  it('numbers jobs per year', async () => {
    const a = await newJob('A', '2026-01-02')
    const b = await newJob('B', '2026-02-02')
    const c = await newJob('C', '2027-01-02')
    expect([a.seq, b.seq, c.seq]).toEqual([1, 2, 1])
    expect((await listJobs(db, { q: '2026-002' })).map((r) => r.job.title)).toEqual(['B'])
    expect((await listJobs(db, { q: 'wrx', year: 2026 })).length).toBe(2)
  })

  it('totals labor, parts, costs and payments, and moves to Paid when covered', async () => {
    const job = await newJob()
    await addJobLine(db, job.id, { type: 'labor', description: 'Fabrication', hoursHundredths: 600, rateCents: 9500, amountCents: 57000 })
    const { purchaseId } = await addPart(db, job.id, { description: '3" tubing', costCents: 14200, billedCents: 18500, vendor: 'Summit', purchasedOn: '2026-10-12' })
    expect(purchaseId).toBeTruthy()
    await addJobLine(db, job.id, { type: 'discount', description: 'Repeat customer', amountCents: 5000 })
    let t = (await jobTotals(db, [job.id])).get(job.id)!
    expect(t).toMatchObject({ billedCents: 57000 + 18500 - 5000, costCents: 14200, balanceCents: 70500 })

    await addPayment(db, { jobId: job.id, receivedOn: '2026-10-10', amountCents: 30000, purpose: 'deposit', method: 'venmo', feeCents: 570 })
    await updateJob(db, job.id, { status: 'done' })
    let d = (await getJobDetail(db, job.id))!
    expect(d.job.status).toBe('done')
    expect(d.job.completedOn).toBeTruthy()

    await addPayment(db, { jobId: job.id, receivedOn: '2026-10-20', amountCents: 40500, purpose: 'final', method: 'cash' })
    d = (await getJobDetail(db, job.id))!
    expect(d.job.status).toBe('paid')
    t = d.totals
    expect(t).toMatchObject({ paidCents: 70500, balanceCents: 0, feeCents: 570, profitCents: 70500 - 14200 - 570 })

    // A refund reopens the balance.
    await addPayment(db, { jobId: job.id, receivedOn: '2026-10-21', amountCents: 1000, purpose: 'refund', method: 'cash' })
    expect((await getJobDetail(db, job.id))!.job.status).toBe('done')
  })
})

describe('purchases', () => {
  it('splits one receipt across a job, a shop category and equipment, with tax spread in', async () => {
    const job = await newJob()
    const supplies = await category('Shop supplies')
    const p = await createPurchase(db, {
      purchasedOn: '2026-10-12', vendor: 'Northern Tool', taxCents: 0, shippingCents: 1000,
      lines: [
        { description: 'Hangers', amountCents: 2000, target: { kind: 'job', jobId: job.id, bill: { amountCents: 3000, description: 'Exhaust hangers' } } },
        { description: 'Flap discs', amountCents: 3000, target: { kind: 'category', categoryId: supplies.id } },
        { description: 'Bandsaw', amountCents: 95000, target: { kind: 'asset', businessUsePct: 80 } },
      ],
    })
    const d = (await getPurchase(db, p.id))!
    expect(d.totalCents).toBe(101000)
    expect(d.lines.map((l) => l.allocatedCents)).toEqual([2020, 3030, 95950])
    const [asset] = await db.select().from(assets)
    expect(asset).toMatchObject({ description: 'Bandsaw', costCents: 95950, businessUsePct: 80, placedInServiceOn: '2026-10-12' })
    const jd = (await getJobDetail(db, job.id))!
    expect(jd.lines.map((l) => [l.description, l.amountCents])).toEqual([['Exhaust hangers', 3000]])
    expect(jd.totals.costCents).toBe(2020)

    // Moving the equipment line to supplies removes the asset row.
    await updatePurchase(db, p.id, {
      purchasedOn: '2026-10-12', vendor: 'Northern Tool', shippingCents: 1000,
      lines: d.lines.map(({ line }) => ({
        id: line.id, description: line.description, amountCents: line.amountCents,
        target: line.jobId ? { kind: 'job', jobId: line.jobId } : { kind: 'category', categoryId: supplies.id },
      })),
    })
    expect(await db.select().from(assets)).toHaveLength(0)
    expect((await getJobDetail(db, job.id))!.lines).toHaveLength(1)

    await deletePurchase(db, p.id)
    const after = (await getJobDetail(db, job.id))!
    expect(after.totals.costCents).toBe(0)
    expect(after.lines[0].purchaseLineId).toBeNull()
  })
})

describe('reports', () => {
  it('builds the monthly report and Schedule C worksheet on a cash basis', async () => {
    await saveSettings(db, { mileageRates: { '2026': 70 } })
    const job = await newJob('Brakes', '2026-03-01')
    await addJobLine(db, job.id, { type: 'labor', description: 'Labor', amountCents: 40000 })
    await addPart(db, job.id, { description: 'Pads', costCents: 8000, billedCents: 10000, vendor: 'RockAuto', purchasedOn: '2026-02-27' })
    await addPayment(db, { jobId: job.id, receivedOn: '2026-03-05', amountCents: 50000, purpose: 'final', method: 'paypal', feeCents: 1500 })
    await createPurchase(db, {
      purchasedOn: '2026-03-10', vendor: 'Airgas',
      lines: [{ amountCents: 6000, target: { kind: 'category', categoryId: (await category('Welding gas and consumables')).id } }],
    })
    await createPurchase(db, {
      purchasedOn: '2026-04-02', vendor: 'Joe’s Paint',
      lines: [{ amountCents: 30000, target: { kind: 'job', jobId: job.id }, payee: 'Joe Smith' }],
    })
    await createPurchase(db, {
      purchasedOn: '2026-05-01', vendor: 'Grizzly',
      lines: [{ description: 'Lathe', amountCents: 450000, target: { kind: 'asset', businessUsePct: 90 } }],
    })
    await addTrip(db, { tripOn: '2026-03-02', milesTenths: 245, purpose: 'Parts run' })

    const { rows, total } = await monthlyReport(db, 2026)
    expect(rows[1]).toMatchObject({ month: '2026-02', cogsCents: 8000, profitCents: -8000 })
    expect(rows[2]).toMatchObject({ revenueCents: 50000, expenseCents: 6000, feeCents: 1500, profitCents: 42500 })
    expect(total).toMatchObject({ revenueCents: 50000, cogsCents: 38000, equipmentCents: 450000 })

    const w = await taxWorksheet(db, 2026)
    expect(w.grossReceiptsCents).toBe(50000)
    expect(w.cogs).toEqual({ purchasesCents: 8000, laborCents: 30000, totalCents: 38000 })
    const line = (n: string) => w.expenses.find((e) => e.line === n)?.totalCents
    expect(line('22')).toBe(6000)
    expect(line('27a')).toBe(1500)
    expect(line('9')).toBe(Math.round(24.5 * 70))
    expect(w.contractors).toEqual([{ payee: 'Joe Smith', totalCents: 30000, flagged: false }])
    expect(w.assets.map((a) => a.description)).toEqual(['Lathe'])
    expect(w.byMethod).toEqual([{ method: 'paypal', count: 1, grossCents: 50000, refundCents: 0, feeCents: 1500 }])
    expect(w.netBeforeDepreciationCents).toBe(50000 - 38000 - 6000 - 1500 - 1715)
  })
})

describe('import', () => {
  it('creates jobs with a billed total, cost and payment', async () => {
    await commitImport(db, 'jobs', [
      { date: '2026-01-09', customer: 'Dana K', vehicle: '2019 Honda Civic Si', title: 'Brakes', kind: 'service', billedCents: 40000, costCents: 12000, paidCents: 40000, paidOn: '2026-01-12', method: 'zelle', notes: null },
      { date: '2026-01-05', customer: 'dana k', vehicle: '2019 Honda Civic Si', title: 'Oil change', kind: 'service', billedCents: 9000, costCents: 3000, paidCents: 0, paidOn: null, method: 'other', notes: null },
    ])
    const rows = await listJobs(db, { year: 2026 })
    expect(rows.map((r) => [r.job.seq, r.job.title, r.job.status])).toEqual([[2, 'Brakes', 'paid'], [1, 'Oil change', 'done']])
    expect(new Set(rows.map((r) => r.customer.id)).size).toBe(1)
    expect(new Set(rows.map((r) => r.vehicle?.id)).size).toBe(1)
    expect(rows[0].totals).toMatchObject({ billedCents: 40000, costCents: 12000, paidCents: 40000 })
  })
})

describe('stripe', () => {
  function fakeStripe(opts: { invoiceForPi?: Record<string, string>; fee?: number; refunds?: Stripe.Refund[] } = {}): StripeApi {
    return {
      invoicePayments: {
        list: async (p: { payment?: { payment_intent?: string } }) => ({
          data: opts.invoiceForPi?.[p.payment?.payment_intent ?? ''] ? [{ invoice: opts.invoiceForPi[p.payment!.payment_intent!] }] : [],
        }),
      },
      balanceTransactions: { retrieve: async () => ({ fee: opts.fee ?? 0 }) },
      refunds: { list: async () => ({ data: opts.refunds ?? [] }) },
    } as unknown as StripeApi
  }
  const charge = (over: Partial<Stripe.Charge>) => ({
    id: 'ch_1', object: 'charge', amount: 30000, status: 'succeeded', paid: true, created: Date.UTC(2026, 9, 15, 15) / 1000,
    balance_transaction: 'txn_1', payment_intent: 'pi_1', billing_details: { name: 'Mike R.' }, description: null, ...over,
  }) as Stripe.Charge
  const event = (type: string, object: unknown) => ({ id: 'evt', type, data: { object } }) as unknown as Stripe.Event

  it('records a requested invoice payment on its job with the fee, once', async () => {
    const job = await newJob()
    await addJobLine(db, job.id, { type: 'labor', description: 'Labor', amountCents: 100000 })
    const [req] = await db.insert(paymentRequests).values({
      jobId: job.id, amountCents: 30000, purpose: 'deposit', description: 'Deposit', stripeInvoiceId: 'in_1',
    }).returning()
    const stripe = fakeStripe({ invoiceForPi: { pi_1: 'in_1' }, fee: 900 })
    await handleStripeEvent(db, stripe, event('charge.succeeded', charge({})))
    await handleStripeEvent(db, stripe, event('charge.succeeded', charge({})))
    const ps = await db.select().from(payments)
    expect(ps).toHaveLength(1)
    expect(ps[0]).toMatchObject({ jobId: job.id, amountCents: 30000, feeCents: 900, purpose: 'deposit', method: 'stripe', receivedOn: '2026-10-15' })
    const [r] = await db.select().from(paymentRequests).where(eq(paymentRequests.id, req.id))
    expect(r.status).toBe('paid')
  })

  it('leaves website payments unmatched until assigned, and records refunds', async () => {
    const job = await newJob()
    const stripe = fakeStripe({ fee: 320, refunds: [{ id: 're_1', amount: 5000, status: 'succeeded', created: Date.UTC(2026, 9, 20) / 1000, reason: 'requested_by_customer' } as Stripe.Refund] })
    await handleStripeEvent(db, stripe, event('charge.succeeded', charge({ id: 'ch_web', payment_intent: 'pi_web', description: 'Website order' })))
    const [u] = await unmatchedPayments(db)
    expect(u).toMatchObject({ amountCents: 30000, payerName: 'Mike R.', note: 'Website order', feeCents: 320 })
    await assignPayment(db, u.id, job.id, 'deposit')
    expect(await unmatchedPayments(db)).toHaveLength(0)
    await handleStripeEvent(db, stripe, event('charge.refunded', charge({ id: 'ch_web' })))
    await handleStripeEvent(db, stripe, event('charge.refunded', charge({ id: 'ch_web' })))
    const ps = await db.select().from(payments).where(eq(payments.jobId, job.id))
    expect(ps.map((p) => p.amountCents).sort()).toEqual([-5000, 30000])
  })

  it('itemizes only when the lines add up to the request', () => {
    const d = { lines: [{ description: 'Labor', amountCents: 50000 }, { description: 'Parts', amountCents: 20000 }], totals: { paidCents: 30000 } }
    expect(invoiceItems(d as never, { amountCents: 40000, itemize: true }, 'Payment')).toHaveLength(3)
    expect(invoiceItems(d as never, { amountCents: 10000, itemize: true }, 'Payment')).toEqual([{ description: 'Payment', amountCents: 10000 }])
  })
})
