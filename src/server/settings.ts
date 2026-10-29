import { eq } from 'drizzle-orm'
import type { Db } from '@/db'
import { settings } from '@/db/schema'
import { DEFAULT_SETTINGS, type SettingsData } from '@/lib/settings-data'
import { todayIn } from '@/lib/dates'

export async function getSettings(db: Db): Promise<SettingsData> {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1))
  return { ...DEFAULT_SETTINGS, ...row?.data }
}

export async function saveSettings(db: Db, patch: Partial<SettingsData>) {
  const current = await getSettings(db)
  const data = { ...current, ...patch }
  await db.insert(settings).values({ id: 1, data })
    .onConflictDoUpdate({ target: settings.id, set: { data } })
  return data
}

export async function today(db: Db) {
  return todayIn((await getSettings(db)).timezone)
}
