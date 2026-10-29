'use client'

import { useRef, useState } from 'react'
import { Camera } from 'lucide-react'
import { cx } from './ui'

const MAX_EDGE = 1800
const QUALITY = 0.72

// Phone photos are 3–10 MB; a receipt is legible at ~300 KB. Resizes images
// in the browser before the form uploads them. PDFs pass through.
async function shrink(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    if (scale === 1 && file.size < 600_000) return file
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', QUALITY))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}

export function FileInput({ name, label = 'Add photo', multiple = true, onFiles, className }: {
  name: string
  label?: string
  multiple?: boolean
  onFiles?: (files: File[]) => void
  className?: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [names, setNames] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  return (
    <div className={className}>
      <label className={cx('inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-line bg-raised px-3 text-sm text-fg-muted hover:bg-hover',
        busy && 'opacity-60')}>
        <Camera size={16} />
        {busy ? 'Preparing…' : names.length ? `${names.length} file${names.length === 1 ? '' : 's'} ready` : label}
        <input
          ref={ref}
          type="file"
          name={name}
          accept="image/*,application/pdf"
          multiple={multiple}
          className="sr-only"
          onChange={async (e) => {
            const input = e.currentTarget
            const list = [...(input.files ?? [])]
            if (!list.length) return setNames([])
            setBusy(true)
            const out = await Promise.all(list.map(shrink))
            const dt = new DataTransfer()
            out.forEach((f) => dt.items.add(f))
            input.files = dt.files
            setNames(out.map((f) => f.name))
            setBusy(false)
            onFiles?.(out)
          }}
        />
      </label>
      {names.length > 0 && <div className="mt-1 truncate text-xs text-fg-subtle">{names.join(', ')}</div>}
    </div>
  )
}

export function Thumb({ id, contentType, filename }: { id: number; contentType: string; filename: string }) {
  const src = `/files/${id}`
  return (
    <a href={src} target="_blank" rel="noreferrer" className="block h-20 w-20 overflow-hidden rounded-lg border border-line bg-raised" title={filename}>
      {contentType.startsWith('image/')
        ? <img src={src} alt={filename} className="h-full w-full object-cover" loading="lazy" />
        : <span className="flex h-full items-center justify-center text-xs text-fg-muted">PDF</span>}
    </a>
  )
}
