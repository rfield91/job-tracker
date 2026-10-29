import { eq } from 'drizzle-orm'
import { files } from '@/db/schema'
import { authedDb } from '@/server/session'
import { getObject } from '@/server/storage'

// Receipts and photos are private; they're only served to a signed-in user.
export async function GET(_: Request, ctx: RouteContext<'/files/[id]'>) {
  const { id } = await ctx.params
  let db
  try {
    db = await authedDb()
  } catch {
    return new Response('Unauthorized', { status: 401 })
  }
  const [row] = await db.select().from(files).where(eq(files.id, Number(id)))
  if (!row) return new Response('Not found', { status: 404 })
  const body = await getObject(row.key)
  if (!body) return new Response('Not found', { status: 404 })
  return new Response(body, {
    headers: {
      'content-type': row.contentType,
      'content-disposition': `inline; filename="${row.filename.replace(/["\\\r\n]/g, '_')}"`,
      'cache-control': 'private, max-age=86400',
      'x-content-type-options': 'nosniff',
    },
  })
}
