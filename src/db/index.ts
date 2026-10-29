import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { count } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import * as schema from './schema'
import { DEFAULT_CATEGORIES } from '@/lib/schedule-c'

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>

// With DATABASE_URL set (Vercel + Neon) the app talks to Neon. Without it,
// it runs an embedded Postgres (PGlite) in .data/pglite so it works locally
// with no setup. PGLITE_DIR=memory gives a throwaway database for tests.

const globalForDb = globalThis as unknown as { __jobTrackerDb?: Promise<Db> }

export function getDb(): Promise<Db> {
  globalForDb.__jobTrackerDb ??= open().catch((err) => {
    globalForDb.__jobTrackerDb = undefined
    throw err
  })
  return globalForDb.__jobTrackerDb
}

async function open(): Promise<Db> {
  const url = process.env.DATABASE_URL
  if (url) {
    const { Pool } = await import('@neondatabase/serverless')
    const { drizzle } = await import('drizzle-orm/neon-serverless')
    const db = drizzle({ client: new Pool({ connectionString: url }), schema }) as unknown as Db
    await seed(db)
    return db
  }
  const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), '.data', 'pglite')
  return openPglite(dir)
}

export async function openPglite(dir: string): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite')
  const { drizzle } = await import('drizzle-orm/pglite')
  const { migrate } = await import('drizzle-orm/pglite/migrator')
  if (dir !== 'memory') await mkdir(path.dirname(dir), { recursive: true })
  const client = dir === 'memory' ? new PGlite() : new PGlite(dir)
  const db = drizzle({ client, schema })
  await migrate(db, { migrationsFolder: path.join(process.cwd(), 'drizzle') })
  await seed(db as unknown as Db)
  return db as unknown as Db
}

// Idempotent: creates the settings row and default categories on first run.
export async function seed(db: Db) {
  await db.insert(schema.settings).values({ id: 1, data: {} }).onConflictDoNothing()
  const [{ n }] = await db.select({ n: count() }).from(schema.categories)
  if (n === 0) {
    await db.insert(schema.categories).values(
      DEFAULT_CATEGORIES.map((c, i) => ({ ...c, systemKey: c.systemKey ?? null, sortOrder: i })),
    )
  }
}
