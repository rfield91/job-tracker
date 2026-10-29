import { getDb } from '@/db'
import { dumpTables } from '@/server/export'
import { putObject } from '@/server/storage'

// Nightly (vercel.json): writes every table as JSON to backups/ in the Blob
// store. Receipts already live there. Vercel sends CRON_SECRET as a bearer.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  const db = await getDb()
  const dump = await dumpTables(db)
  const day = new Date().toISOString().slice(0, 10)
  const body = new TextEncoder().encode(JSON.stringify({ createdAt: new Date().toISOString(), tables: dump }))
  await putObject(`backups/${day}.json`, body, 'application/json')
  return Response.json({ ok: true, bytes: body.length, tables: Object.fromEntries(Object.entries(dump).map(([k, v]) => [k, v.length])) })
}
