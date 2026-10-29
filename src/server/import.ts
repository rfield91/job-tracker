import { and, eq, ilike } from 'drizzle-orm'
import type { Db } from '@/db'
import { customers, jobs, vehicles, type PaymentMethod } from '@/db/schema'
import type { AssetRecord, ImportKind, JobRecord, PurchaseRecord } from '@/lib/import'
import { createAsset } from './assets'
import { addJobLine, createCustomer, createJob, parseVehicle, updateJob, vehicleLabel } from './jobs'
import { addPayment } from './payments'
import { createPurchase, listCategories } from './purchases'

export const IMPORT_VENDOR = 'Imported from jobs sheet'

export async function commitImport(db: Db, kind: ImportKind, records: unknown[]) {
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db
    if (kind === 'jobs') return importJobs(t, records as JobRecord[])
    if (kind === 'assets') return importAssets(t, records as AssetRecord[])
    return importPurchases(t, records as PurchaseRecord[])
  })
}

async function importJobs(db: Db, records: JobRecord[]) {
  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date))
  const customerIds = new Map<string, number>()
  let created = 0
  for (const r of sorted) {
    const key = r.customer.trim().toLowerCase()
    let customerId = customerIds.get(key)
    if (!customerId) {
      const [found] = await db.select().from(customers).where(ilike(customers.name, r.customer.trim()))
      customerId = found?.id ?? (await createCustomer(db, { name: r.customer })).id
      customerIds.set(key, customerId)
    }
    let vehicleId: number | null = null
    const v = r.vehicle ? parseVehicle(r.vehicle) : null
    if (v) {
      const existing = await db.select().from(vehicles).where(eq(vehicles.customerId, customerId))
      const label = vehicleLabel({ year: v.year ?? null, make: v.make ?? null, model: v.model ?? null, trim: null }).toLowerCase()
      vehicleId = existing.find((x) => vehicleLabel(x).toLowerCase() === label)?.id
        ?? (await db.insert(vehicles).values({ customerId, ...v }).returning())[0].id
    }
    const job = await createJob(db, {
      customerId, vehicleId, title: r.title, kind: r.kind, status: 'done', openedOn: r.date,
      notes: [r.notes, 'Imported from the jobs sheet.'].filter(Boolean).join('\n'),
    })
    await addJobLine(db, job.id, { type: 'fee', description: 'Billed total (imported)', amountCents: r.billedCents })
    if (r.costCents) {
      await createPurchase(db, {
        purchasedOn: r.date, vendor: IMPORT_VENDOR,
        lines: [{ description: `Costs for ${r.title}`, amountCents: r.costCents, target: { kind: 'job', jobId: job.id } }],
      })
    }
    await updateJob(db, job.id, { completedOn: r.paidOn ?? r.date })
    if (r.paidCents) {
      await addPayment(db, {
        jobId: job.id, receivedOn: r.paidOn ?? r.date, amountCents: r.paidCents, purpose: 'final',
        method: r.method as PaymentMethod, note: 'Imported',
      })
    }
    created++
  }
  return { created }
}

async function importAssets(db: Db, records: AssetRecord[]) {
  for (const r of records) {
    await createAsset(db, {
      description: r.description, placedInServiceOn: r.date, costCents: r.costCents, businessUsePct: r.businessUsePct,
      treatment: 'undecided', notes: [r.vendor && `Bought from ${r.vendor}`, r.notes].filter(Boolean).join('. ') || null,
    })
  }
  return { created: records.length }
}

async function importPurchases(db: Db, records: PurchaseRecord[]) {
  const cats = await listCategories(db)
  let unassigned = 0
  for (const r of records) {
    const cat = r.category ? cats.find((c) => c.name.toLowerCase() === r.category!.trim().toLowerCase()) : null
    let jobId: number | null = null
    if (r.job) {
      const m = r.job.match(/(?:(\d{4})-)?0*(\d+)/)
      if (m) {
        const year = m[1] ? Number(m[1]) : Number(r.date.slice(0, 4))
        const [j] = await db.select().from(jobs).where(and(eq(jobs.year, year), eq(jobs.seq, Number(m[2]))))
        jobId = j?.id ?? null
      }
    }
    if (!jobId && !cat) unassigned++
    await createPurchase(db, {
      purchasedOn: r.date, vendor: r.vendor, notes: r.category && !cat ? `Category in sheet: ${r.category}` : null,
      lines: [{
        description: r.description, amountCents: r.amountCents,
        target: jobId ? { kind: 'job', jobId } : cat ? { kind: 'category', categoryId: cat.id } : { kind: 'none' },
      }],
    })
  }
  return { created: records.length, unassigned }
}
