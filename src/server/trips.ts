import { and, desc, eq, gte, lte } from 'drizzle-orm'
import type { Db } from '@/db'
import { customers, jobs, trips } from '@/db/schema'

export type TripInput = { tripOn: string; milesTenths: number; purpose: string; jobId?: number | null }

export async function listTrips(db: Db, year: number) {
  return db.select({ trip: trips, job: jobs, customer: customers })
    .from(trips)
    .leftJoin(jobs, eq(jobs.id, trips.jobId))
    .leftJoin(customers, eq(customers.id, jobs.customerId))
    .where(and(gte(trips.tripOn, `${year}-01-01`), lte(trips.tripOn, `${year}-12-31`)))
    .orderBy(desc(trips.tripOn), desc(trips.id))
}

export async function addTrip(db: Db, input: TripInput) {
  if (input.milesTenths <= 0) throw new Error('Enter the miles driven')
  if (!input.purpose.trim()) throw new Error('Enter what the trip was for')
  const [row] = await db.insert(trips).values({ ...input, purpose: input.purpose.trim(), jobId: input.jobId ?? null }).returning()
  return row
}

export async function deleteTrip(db: Db, id: number) {
  await db.delete(trips).where(eq(trips.id, id))
}
