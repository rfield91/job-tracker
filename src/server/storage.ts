import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

// Receipts and photos go to a private Vercel Blob store when
// BLOB_READ_WRITE_TOKEN is set, otherwise to .data/uploads on disk.

const localDir = () => process.env.UPLOAD_DIR ?? path.join(process.cwd(), '.data', 'uploads')
const useBlob = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN)

export function newKey(folder: string, filename: string) {
  const ext = path.extname(filename).toLowerCase().replace(/[^.a-z0-9]/g, '') || '.bin'
  return `${folder}/${randomUUID()}${ext}`
}

export async function putObject(key: string, body: Uint8Array, contentType: string) {
  if (useBlob()) {
    const { put } = await import('@vercel/blob')
    await put(key, Buffer.from(body), { access: 'private', contentType, addRandomSuffix: false })
    return
  }
  const file = path.join(localDir(), key)
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, body)
}

export async function getObject(key: string): Promise<ReadableStream<Uint8Array> | null> {
  if (useBlob()) {
    const { get } = await import('@vercel/blob')
    const res = await get(key, { access: 'private' })
    return res && res.statusCode === 200 ? res.stream : null
  }
  try {
    const data = await fs.readFile(path.join(localDir(), key))
    return new Blob([data]).stream()
  } catch {
    return null
  }
}

export async function deleteObject(key: string) {
  if (useBlob()) {
    const { del } = await import('@vercel/blob')
    await del(key)
    return
  }
  await fs.rm(path.join(localDir(), key), { force: true })
}
