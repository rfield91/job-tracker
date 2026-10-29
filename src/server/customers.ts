import { asc, desc, eq, ilike, or, sql } from 'drizzle-orm'
import type { Db } from '@/db'
import { customers, jobs, vehicles } from '@/db/schema'
import type { CustomerInput, VehicleInput } from './jobs'
import { listJobs } from './jobs'

export async function listCustomers(db: Db, q?: string) {
  const like = q?.trim() ? `%${q.trim()}%` : null
  const rows = await db.select({
    customer: customers,
    jobCount: sql<number>`(select count(*) from ${jobs} where ${jobs.customerId} = ${customers.id})`.mapWith(Number),
    lastJob: sql<string | null>`(select max(${jobs.openedOn}) from ${jobs} where ${jobs.customerId} = ${customers.id})`,
  })
    .from(customers)
    .where(like ? or(ilike(customers.name, like), ilike(customers.phone, like), ilike(customers.email, like)) : undefined)
    .orderBy(asc(customers.name))
  const vs = await db.select().from(vehicles).orderBy(desc(vehicles.year))
  return rows.map((r) => ({ ...r, vehicles: vs.filter((v) => v.customerId === r.customer.id) }))
}

// For the new-job picker: customers with their cars, most recently seen first.
export async function customerOptions(db: Db) {
  const rows = await listCustomers(db)
  return rows
    .sort((a, b) => (b.lastJob ?? '').localeCompare(a.lastJob ?? '') || a.customer.name.localeCompare(b.customer.name))
    .map((r) => ({
      id: r.customer.id,
      name: r.customer.name,
      phone: r.customer.phone,
      vehicles: r.vehicles.map((v) => ({ id: v.id, year: v.year, make: v.make, model: v.model, trim: v.trim })),
    }))
}

export type CustomerOption = Awaited<ReturnType<typeof customerOptions>>[number]

export async function getCustomer(db: Db, id: number) {
  const [c] = await db.select().from(customers).where(eq(customers.id, id))
  if (!c) return null
  const vs = await db.select().from(vehicles).where(eq(vehicles.customerId, id)).orderBy(desc(vehicles.year))
  const js = await listJobs(db, { customerId: id })
  return { customer: c, vehicles: vs, jobs: js }
}

export async function updateCustomer(db: Db, id: number, input: CustomerInput) {
  await db.update(customers).set({
    name: input.name.trim(),
    phone: input.phone || null,
    email: input.email || null,
    notes: input.notes || null,
  }).where(eq(customers.id, id))
}

export async function deleteCustomer(db: Db, id: number) {
  const [j] = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.customerId, id)).limit(1)
  if (j) throw new Error('This customer has jobs. Delete those first.')
  await db.delete(customers).where(eq(customers.id, id))
}

export async function updateVehicle(db: Db, id: number, input: VehicleInput) {
  await db.update(vehicles).set({
    year: input.year ?? null,
    make: input.make || null,
    model: input.model || null,
    trim: input.trim || null,
    vin: input.vin || null,
    notes: input.notes || null,
  }).where(eq(vehicles.id, id))
}

export async function deleteVehicle(db: Db, id: number) {
  await db.delete(vehicles).where(eq(vehicles.id, id))
}
