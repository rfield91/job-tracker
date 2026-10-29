import { desc, eq } from 'drizzle-orm'
import type { Db } from '@/db'
import { assets, purchaseLines, purchases, type AssetTreatment } from '@/db/schema'

export const TREATMENT_LABELS: Record<AssetTreatment, string> = {
  undecided: 'Not decided yet',
  de_minimis: 'De minimis (expensed)',
  section_179: 'Section 179',
  bonus: 'Bonus depreciation',
  macrs: 'Regular depreciation (MACRS)',
}

export type AssetInput = {
  description: string
  placedInServiceOn: string
  costCents: number
  businessUsePct: number
  treatment: AssetTreatment
  disposedOn?: string | null
  notes?: string | null
}

export async function listAssets(db: Db) {
  return db.select({ asset: assets, purchaseId: purchaseLines.purchaseId, vendor: purchases.vendor })
    .from(assets)
    .leftJoin(purchaseLines, eq(purchaseLines.assetId, assets.id))
    .leftJoin(purchases, eq(purchases.id, purchaseLines.purchaseId))
    .orderBy(desc(assets.placedInServiceOn), desc(assets.id))
}

export async function createAsset(db: Db, input: AssetInput) {
  const [row] = await db.insert(assets).values({ ...input, disposedOn: input.disposedOn || null, notes: input.notes || null }).returning()
  return row
}

// Cost and date of an asset bought through a purchase follow the purchase,
// so only the tax fields are editable there.
export async function updateAsset(db: Db, id: number, input: Partial<AssetInput>) {
  const [linked] = await db.select().from(purchaseLines).where(eq(purchaseLines.assetId, id))
  const patch = { ...input }
  if (linked) {
    delete patch.costCents
    delete patch.placedInServiceOn
  }
  if ('disposedOn' in patch) patch.disposedOn = patch.disposedOn || null
  const [row] = await db.update(assets).set(patch).where(eq(assets.id, id)).returning()
  return row
}

export async function deleteAsset(db: Db, id: number) {
  const [linked] = await db.select().from(purchaseLines).where(eq(purchaseLines.assetId, id))
  if (linked) throw new Error('This equipment came from a purchase. Change or delete the purchase instead.')
  await db.delete(assets).where(eq(assets.id, id))
}
