import { and, asc, desc, eq, ilike, inArray, max, or, sql, type SQL } from 'drizzle-orm'
import type { Db } from '@/db'
import {
  customers, files, jobLines, jobs, jobTemplates, paymentRequests, payments, purchaseLines,
  purchases, vehicles,
  type Job, type JobKind, type JobLineType, type JobStatus, type Vehicle,
} from '@/db/schema'
import { monthKey, todayIn, yearOf } from '@/lib/dates'
import { allocatedLines } from './ledger'
import { getSettings } from './settings'

export function jobNumber(j: { year: number; seq: number }) {
  return `${j.year}-${String(j.seq).padStart(3, '0')}`
}

export function vehicleLabel(v: Pick<Vehicle, 'year' | 'make' | 'model' | 'trim'> | null | undefined) {
  if (!v) return ''
  return [v.year, v.make, v.model, v.trim].filter(Boolean).join(' ')
}

export const STATUS_LABELS: Record<JobStatus, string> = {
  quote: 'Quote',
  in_progress: 'In progress',
  done: 'Done',
  paid: 'Paid',
}

export type JobTotals = {
  billedCents: number
  costCents: number
  feeCents: number
  paidCents: number
  balanceCents: number
  profitCents: number
}

const emptyTotals = (): JobTotals => ({
  billedCents: 0, costCents: 0, feeCents: 0, paidCents: 0, balanceCents: 0, profitCents: 0,
})

export async function jobTotals(db: Db, jobIds: number[]): Promise<Map<number, JobTotals>> {
  const out = new Map<number, JobTotals>(jobIds.map((id) => [id, emptyTotals()]))
  if (jobIds.length === 0) return out
  const billed = await db.select({ jobId: jobLines.jobId, s: sql<string>`sum(${jobLines.amountCents})` })
    .from(jobLines).where(inArray(jobLines.jobId, jobIds)).groupBy(jobLines.jobId)
  for (const r of billed) out.get(r.jobId)!.billedCents = Number(r.s)
  const paid = await db.select({
    jobId: payments.jobId,
    s: sql<string>`sum(${payments.amountCents})`,
    f: sql<string>`sum(${payments.feeCents})`,
  }).from(payments).where(inArray(payments.jobId, jobIds)).groupBy(payments.jobId)
  for (const r of paid) {
    const t = out.get(r.jobId!)!
    t.paidCents = Number(r.s)
    t.feeCents = Number(r.f)
  }
  for (const l of await allocatedLines(db, { jobIds })) out.get(l.jobId!)!.costCents += l.allocatedCents
  for (const t of out.values()) {
    t.balanceCents = t.billedCents - t.paidCents
    t.profitCents = t.billedCents - t.costCents - t.feeCents
  }
  return out
}

// ---- customers and vehicles -------------------------------------------------

export type CustomerInput = { name: string; phone?: string | null; email?: string | null; notes?: string | null }
export type VehicleInput = {
  year?: number | null; make?: string | null; model?: string | null; trim?: string | null
  vin?: string | null; notes?: string | null
}

export async function createCustomer(db: Db, input: CustomerInput) {
  const [row] = await db.insert(customers).values({
    name: input.name.trim(),
    phone: input.phone || null,
    email: input.email || null,
    notes: input.notes || null,
  }).returning()
  return row
}

export async function createVehicle(db: Db, customerId: number, input: VehicleInput) {
  const [row] = await db.insert(vehicles).values({ customerId, ...clean(input) }).returning()
  return row
}

function clean<T extends Record<string, unknown>>(o: T): T {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o)) out[k] = v === '' || v === undefined ? null : v
  return out as T
}

// '2008 Subaru WRX STI' → { year: 2008, make: 'Subaru', model: 'WRX STI' }
export function parseVehicle(text: string): VehicleInput | null {
  const s = text.trim()
  if (!s) return null
  const m = s.match(/^'?(\d{2}|\d{4})\s+(\S+)\s*(.*)$/)
  if (m) {
    let year = Number(m[1])
    if (m[1].length === 2) year += year > 50 ? 1900 : 2000
    return { year, make: m[2], model: m[3] || null }
  }
  const [make, ...rest] = s.split(/\s+/)
  return { make, model: rest.join(' ') || null }
}

// ---- jobs ---------------------------------------------------------------

export type NewJobInput = {
  customerId?: number | null
  customer?: CustomerInput | null
  vehicleId?: number | null
  vehicle?: VehicleInput | null
  title: string
  kind: JobKind
  status?: JobStatus
  openedOn: string
  notes?: string | null
  templateId?: number | null
}

export async function createJob(db: Db, input: NewJobInput): Promise<Job> {
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db
    let customerId = input.customerId ?? null
    if (!customerId) {
      if (!input.customer?.name?.trim()) throw new Error('Pick a customer or enter a name')
      customerId = (await createCustomer(t, input.customer)).id
    }
    let vehicleId = input.vehicleId ?? null
    if (!vehicleId && input.vehicle && (input.vehicle.make || input.vehicle.model)) {
      vehicleId = (await createVehicle(t, customerId, input.vehicle)).id
    }
    const year = yearOf(input.openedOn)
    const status = input.status ?? 'in_progress'
    const [{ m }] = await t.select({ m: max(jobs.seq) }).from(jobs).where(eq(jobs.year, year))
    const [job] = await t.insert(jobs).values({
      year,
      seq: (m ?? 0) + 1,
      customerId,
      vehicleId,
      title: input.title.trim(),
      kind: input.kind,
      status,
      openedOn: input.openedOn,
      notes: input.notes || null,
    }).returning()
    if (status === 'done' || status === 'paid') {
      await t.update(jobs).set({ completedOn: await defaultCompletedOn(t, job) }).where(eq(jobs.id, job.id))
    }
    if (input.templateId) {
      const [tpl] = await t.select().from(jobTemplates).where(eq(jobTemplates.id, input.templateId))
      if (tpl) {
        await t.insert(jobLines).values(tpl.lines.map((l, i) => ({ ...l, jobId: job.id, sortOrder: i })))
      }
    }
    return job
  })
}

export type JobPatch = Partial<Pick<Job, 'title' | 'kind' | 'status' | 'openedOn' | 'completedOn' | 'notes' | 'vehicleId' | 'customerId'>>

export async function updateJob(db: Db, id: number, patch: JobPatch) {
  const next = { ...patch, updatedAt: new Date() }
  if (patch.status === 'done' || patch.status === 'paid') {
    const [cur] = await db.select().from(jobs).where(eq(jobs.id, id))
    if (cur && !cur.completedOn && !patch.completedOn) next.completedOn = await defaultCompletedOn(db, cur)
  }
  await db.update(jobs).set(next).where(eq(jobs.id, id))
  if (patch.status === 'done') await refreshJobStatus(db, id)
}

// Today, unless the job was entered after the month it was opened (catching
// up on old work): then the day of its last payment or purchase.
async function defaultCompletedOn(db: Db, job: Job) {
  const settings = await getSettings(db)
  const d = todayIn(settings.timezone)
  const entered = todayIn(settings.timezone, job.createdAt)
  if (monthKey(entered) <= monthKey(job.openedOn)) return job.openedOn > d ? job.openedOn : d
  const [{ paid }] = await db.select({ paid: max(payments.receivedOn) }).from(payments).where(eq(payments.jobId, job.id))
  const [{ bought }] = await db.select({ bought: max(purchases.purchasedOn) }).from(purchaseLines)
    .innerJoin(purchases, eq(purchases.id, purchaseLines.purchaseId)).where(eq(purchaseLines.jobId, job.id))
  return [job.openedOn, paid, bought].filter((x): x is string => x != null && x <= d).sort().at(-1)!
}

export async function deleteJob(db: Db, id: number) {
  const pays = await db.select({ id: payments.id }).from(payments).where(eq(payments.jobId, id))
  if (pays.length) throw new Error('This job has payments. Delete or move them first.')
  // Costs stay as purchases, flagged as needing a new home.
  await db.delete(jobs).where(eq(jobs.id, id))
}

// Done + fully paid → Paid; Paid with a balance again (refund, new line) → Done.
export async function refreshJobStatus(db: Db, jobId: number) {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId))
  if (!job) return
  const t = (await jobTotals(db, [jobId])).get(jobId)!
  if (job.status === 'done' && t.billedCents > 0 && t.balanceCents <= 0) {
    await db.update(jobs).set({ status: 'paid', updatedAt: new Date() }).where(eq(jobs.id, jobId))
  } else if (job.status === 'paid' && t.balanceCents > 0) {
    await db.update(jobs).set({ status: 'done', updatedAt: new Date() }).where(eq(jobs.id, jobId))
  }
}

export type JobListFilter = {
  year?: number
  status?: JobStatus | 'open' | 'unpaid'
  kind?: JobKind
  customerId?: number
  q?: string
  limit?: number
}

export async function listJobs(db: Db, f: JobListFilter = {}) {
  const where: SQL[] = []
  if (f.year) where.push(eq(jobs.year, f.year))
  if (f.status === 'open') where.push(inArray(jobs.status, ['quote', 'in_progress']))
  else if (f.status === 'unpaid') where.push(eq(jobs.status, 'done'))
  else if (f.status) where.push(eq(jobs.status, f.status))
  if (f.kind) where.push(eq(jobs.kind, f.kind))
  if (f.customerId) where.push(eq(jobs.customerId, f.customerId))
  if (f.q?.trim()) {
    const q = f.q.trim()
    const like = `%${q}%`
    const ors: SQL[] = [
      ilike(jobs.title, like),
      ilike(customers.name, like),
      ilike(vehicles.make, like),
      ilike(vehicles.model, like),
      ilike(jobs.notes, like),
    ]
    const num = q.match(/^(?:(\d{4})-)?0*(\d{1,4})$/)
    if (num) {
      ors.push(num[1]
        ? and(eq(jobs.year, Number(num[1])), eq(jobs.seq, Number(num[2])))!
        : eq(jobs.seq, Number(num[2])))
    }
    where.push(or(...ors)!)
  }
  const rows = await db.select({ job: jobs, customer: customers, vehicle: vehicles })
    .from(jobs)
    .innerJoin(customers, eq(customers.id, jobs.customerId))
    .leftJoin(vehicles, eq(vehicles.id, jobs.vehicleId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(jobs.year), desc(jobs.seq))
    .limit(f.limit ?? 1000)
  const totals = await jobTotals(db, rows.map((r) => r.job.id))
  return rows.map((r) => ({ ...r, totals: totals.get(r.job.id)! }))
}

export type JobListRow = Awaited<ReturnType<typeof listJobs>>[number]

export async function getJobDetail(db: Db, id: number) {
  const [row] = await db.select({ job: jobs, customer: customers, vehicle: vehicles })
    .from(jobs)
    .innerJoin(customers, eq(customers.id, jobs.customerId))
    .leftJoin(vehicles, eq(vehicles.id, jobs.vehicleId))
    .where(eq(jobs.id, id))
  if (!row) return null
  const lines = await db.select().from(jobLines).where(eq(jobLines.jobId, id))
    .orderBy(asc(jobLines.sortOrder), asc(jobLines.id))
  const costs = await allocatedLines(db, { jobIds: [id] })
  const pays = await db.select().from(payments).where(eq(payments.jobId, id))
    .orderBy(asc(payments.receivedOn), asc(payments.id))
  const requests = await db.select().from(paymentRequests).where(eq(paymentRequests.jobId, id))
    .orderBy(desc(paymentRequests.createdAt))
  const photos = await db.select().from(files).where(eq(files.jobId, id)).orderBy(asc(files.id))
  const receiptFiles = costs.length
    ? await db.select().from(files).where(inArray(files.purchaseId, [...new Set(costs.map((c) => c.purchaseId))]))
    : []
  const totals = (await jobTotals(db, [id])).get(id)!
  const vehiclesForCustomer = await db.select().from(vehicles).where(eq(vehicles.customerId, row.customer.id))
  return { ...row, lines, costs, payments: pays, requests, photos, receiptFiles, totals, vehiclesForCustomer }
}

export type JobDetail = NonNullable<Awaited<ReturnType<typeof getJobDetail>>>

// ---- job lines ------------------------------------------------------------

export type JobLineInput = {
  type: JobLineType
  description: string
  hoursHundredths?: number | null
  rateCents?: number | null
  amountCents: number
  purchaseLineId?: number | null
  estCostCents?: number | null
  partNumber?: string | null
  quantityHundredths?: number | null
}

export async function addJobLine(db: Db, jobId: number, input: JobLineInput) {
  const [{ m }] = await db.select({ m: max(jobLines.sortOrder) }).from(jobLines).where(eq(jobLines.jobId, jobId))
  const [row] = await db.insert(jobLines).values({
    jobId,
    type: input.type,
    description: input.description.trim(),
    hoursHundredths: input.hoursHundredths ?? null,
    rateCents: input.rateCents ?? null,
    amountCents: input.type === 'discount' ? -Math.abs(input.amountCents) : input.amountCents,
    purchaseLineId: input.purchaseLineId ?? null,
    estCostCents: input.estCostCents ?? null,
    partNumber: input.partNumber?.trim() || null,
    quantityHundredths: input.quantityHundredths ?? null,
    sortOrder: (m ?? -1) + 1,
  }).returning()
  await touch(db, jobId)
  return row
}

export async function updateJobLine(db: Db, lineId: number, input: Partial<JobLineInput>) {
  const patch = { ...input }
  if (input.type === 'discount' && input.amountCents != null) patch.amountCents = -Math.abs(input.amountCents)
  const [row] = await db.update(jobLines).set(patch).where(eq(jobLines.id, lineId)).returning()
  if (row) await touch(db, row.jobId)
  return row
}

export async function deleteJobLine(db: Db, lineId: number) {
  const [row] = await db.delete(jobLines).where(eq(jobLines.id, lineId)).returning()
  if (row) await touch(db, row.jobId)
  return row
}

async function touch(db: Db, jobId: number) {
  await db.update(jobs).set({ updatedAt: new Date() }).where(eq(jobs.id, jobId))
  await refreshJobStatus(db, jobId)
}

// A part added from the job page: one entry makes the purchase (cost) and the
// invoice line (billed price). Without a cost it's just a billed line. On a
// quote nothing's bought yet, so the cost is kept on the line as an estimate.
export async function addPart(db: Db, jobId: number, input: {
  description: string
  partNumber?: string | null
  quantityHundredths?: number
  billedCents: number
  costCents?: number | null
  vendor?: string | null
  purchasedOn: string
  method?: string | null
}) {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId))
  if (!job) throw new Error('Job not found')
  if (job.status === 'quote') {
    const line = await addJobLine(db, jobId, {
      type: 'part',
      description: input.description,
      amountCents: input.billedCents,
      estCostCents: input.costCents ?? null,
      partNumber: input.partNumber,
      quantityHundredths: input.quantityHundredths ?? 100,
    })
    return { line, purchaseId: null }
  }
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db
    let purchaseId: number | null = null
    let purchaseLineId: number | null = null
    if (input.costCents != null) {
      const [p] = await t.insert(purchases).values({
        purchasedOn: input.purchasedOn,
        vendor: input.vendor?.trim() || 'Unknown vendor',
        method: input.method || null,
      }).returning()
      const [pl] = await t.insert(purchaseLines).values({
        purchaseId: p.id,
        description: input.description,
        partNumber: input.partNumber?.trim() || null,
        quantityHundredths: input.quantityHundredths ?? 100,
        amountCents: input.costCents,
        jobId,
      }).returning()
      purchaseId = p.id
      purchaseLineId = pl.id
    }
    const line = await addJobLine(t, jobId, {
      type: 'part',
      description: input.description,
      amountCents: input.billedCents,
      purchaseLineId,
    })
    return { line, purchaseId }
  })
}

// A part quoted earlier, now bought: makes the purchase behind the line.
export async function recordPartPurchase(db: Db, jobLineId: number, input: {
  costCents: number
  vendor?: string | null
  purchasedOn: string
  method?: string | null
}) {
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db
    const [jl] = await t.select().from(jobLines).where(eq(jobLines.id, jobLineId))
    if (!jl || jl.type !== 'part') throw new Error('That line isn’t a part')
    if (jl.purchaseLineId) throw new Error('That part already has a purchase')
    const [p] = await t.insert(purchases).values({
      purchasedOn: input.purchasedOn,
      vendor: input.vendor?.trim() || 'Unknown vendor',
      method: input.method || null,
    }).returning()
    const [pl] = await t.insert(purchaseLines).values({
      purchaseId: p.id,
      description: jl.description,
      partNumber: jl.partNumber,
      quantityHundredths: jl.quantityHundredths ?? 100,
      amountCents: input.costCents,
      jobId: jl.jobId,
    }).returning()
    await t.update(jobLines).set({ purchaseLineId: pl.id, estCostCents: null }).where(eq(jobLines.id, jl.id))
    await touch(t, jl.jobId)
    return { purchaseId: p.id }
  })
}

// Bill a cost already on the job (a receipt logged from the phone).
export async function billCost(db: Db, purchaseLineId: number, billedCents: number, description: string) {
  const [pl] = await db.select().from(purchaseLines).where(eq(purchaseLines.id, purchaseLineId))
  if (!pl?.jobId) throw new Error('That purchase line isn’t on a job')
  return addJobLine(db, pl.jobId, { type: 'part', description, amountCents: billedCents, purchaseLineId })
}

export async function saveAsTemplate(db: Db, jobId: number, name: string) {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId))
  if (!job) throw new Error('Job not found')
  const lines = await db.select().from(jobLines).where(eq(jobLines.jobId, jobId))
    .orderBy(asc(jobLines.sortOrder), asc(jobLines.id))
  const [row] = await db.insert(jobTemplates).values({
    name: name.trim() || job.title,
    kind: job.kind,
    title: job.title,
    lines: lines.map((l) => ({
      type: l.type,
      description: l.description,
      hoursHundredths: l.hoursHundredths,
      rateCents: l.rateCents,
      amountCents: l.amountCents,
    })),
  }).returning()
  return row
}
