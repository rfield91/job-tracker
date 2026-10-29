'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import { zipSync, strToU8 } from 'fflate'
import { Button } from './ui'

type Manifest = { name: string; texts: Record<string, string>; files: { id: number; path: string }[] }

// Fetches the export manifest, downloads each file, and zips it in the browser.
export function ZipExportButton({ query, label, variant = 'secondary' }: { query: string; label: string; variant?: 'primary' | 'secondary' }) {
  const [progress, setProgress] = useState<string | null>(null)
  async function run() {
    try {
      setProgress('Preparing…')
      const res = await fetch(`/api/export?${query}`)
      if (!res.ok) throw new Error(await res.text())
      const m = (await res.json()) as Manifest
      const entries: Record<string, Uint8Array> = {}
      for (const [name, text] of Object.entries(m.texts)) entries[name] = strToU8(text)
      let done = 0
      for (const f of m.files) {
        setProgress(`Receipts ${++done}/${m.files.length}`)
        const r = await fetch(`/files/${f.id}`)
        if (r.ok) entries[f.path] = new Uint8Array(await r.arrayBuffer())
      }
      setProgress('Zipping…')
      const zip = zipSync(entries, { level: 0 })
      const url = URL.createObjectURL(new Blob([zip as BlobPart], { type: 'application/zip' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `${m.name}.zip`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      setProgress(null)
    } catch (e) {
      setProgress(`Failed: ${(e as Error).message}`)
    }
  }
  return (
    <Button variant={variant} onClick={run} disabled={progress != null && !progress.startsWith('Failed')}>
      <Download size={15} />{progress ?? label}
    </Button>
  )
}
