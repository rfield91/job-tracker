// Applies drizzle/ migrations to the Neon database in DATABASE_URL.
// Run before deploying a schema change: bun run db:migrate
import { Pool } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-serverless'
import { migrate } from 'drizzle-orm/neon-serverless/migrator'

const url = process.env.DATABASE_URL
if (!url) {
  console.log('DATABASE_URL not set; the local database migrates itself on start.')
  process.exit(0)
}
const pool = new Pool({ connectionString: url })
await migrate(drizzle({ client: pool }), { migrationsFolder: 'drizzle' })
await pool.end()
console.log('Migrations applied.')
