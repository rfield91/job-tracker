import { cookies } from 'next/headers'
import { authMode, SESSION_COOKIE, verifySession } from '@/lib/auth'
import { getDb } from '@/db'

// Checked again in every server action and route handler, not only in the
// proxy, so a request that slips past the proxy still can't read or write.
export async function requireUser() {
  const mode = authMode()
  if (mode === 'disabled') return { email: 'local' }
  if (mode === 'misconfigured') throw new Error('Sign-in is not configured')
  const session = await verifySession((await cookies()).get(SESSION_COOKIE)?.value)
  if (!session) throw new Error('Not signed in')
  return session
}

export async function authedDb() {
  await requireUser()
  return getDb()
}
