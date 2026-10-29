import { revalidatePath } from 'next/cache'
import { unstable_rethrow } from 'next/navigation'
import type { Db } from '@/db'
import type { FormState } from '@/lib/form-state'
import { authedDb } from '@/server/session'

// Shared shell for server actions: checks the session, refreshes every page
// afterwards, and turns thrown errors into a message for the form.
export async function run(fn: (db: Db) => Promise<FormState | void>): Promise<FormState> {
  try {
    const db = await authedDb()
    const result = await fn(db)
    revalidatePath('/', 'layout')
    return { message: 'Saved', ...result, at: Date.now() }
  } catch (err) {
    revalidatePath('/', 'layout')
    unstable_rethrow(err)
    console.error(err)
    return { error: err instanceof Error ? err.message : 'Something went wrong', at: Date.now() }
  }
}
