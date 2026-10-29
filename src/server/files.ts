import { eq } from 'drizzle-orm'
import type { Db } from '@/db'
import { files, type FileKind } from '@/db/schema'
import { deleteObject, newKey, putObject } from './storage'

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024
const ALLOWED = /^(image\/(jpeg|png|webp|heic|heif|gif)|application\/pdf)$/

export async function saveUpload(
  db: Db,
  file: File,
  owner: { kind: FileKind; purchaseId?: number; jobId?: number },
) {
  if (!file || file.size === 0) return null
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(`${file.name} is over 4 MB`)
  const type = file.type || 'application/octet-stream'
  if (!ALLOWED.test(type)) throw new Error(`${file.name}: only images and PDFs can be attached`)
  const key = newKey(owner.kind === 'receipt' ? 'receipts' : owner.kind === 'logo' ? 'logos' : 'photos', file.name)
  await putObject(key, new Uint8Array(await file.arrayBuffer()), type)
  const [row] = await db.insert(files).values({
    key,
    filename: file.name || 'upload',
    contentType: type,
    size: file.size,
    kind: owner.kind,
    purchaseId: owner.purchaseId ?? null,
    jobId: owner.jobId ?? null,
  }).returning()
  return row
}

export async function saveUploads(
  db: Db,
  list: FormDataEntryValue[],
  owner: { kind: FileKind; purchaseId?: number; jobId?: number },
) {
  for (const f of list) {
    if (f instanceof File && f.size > 0) await saveUpload(db, f, owner)
  }
}

export async function deleteFile(db: Db, id: number) {
  const [row] = await db.delete(files).where(eq(files.id, id)).returning()
  if (row) await deleteObject(row.key).catch(() => {})
  return row
}

// Storage objects for rows that are about to be cascade-deleted.
export async function deleteObjectsFor(db: Db, where: { purchaseId?: number; jobId?: number }) {
  const rows = where.purchaseId
    ? await db.select().from(files).where(eq(files.purchaseId, where.purchaseId))
    : where.jobId
      ? await db.select().from(files).where(eq(files.jobId, where.jobId))
      : []
  for (const r of rows) await deleteObject(r.key).catch(() => {})
}
