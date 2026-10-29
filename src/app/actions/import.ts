'use server'

import type { FormState } from '@/lib/form-state'
import { FIELDS, normalize, type ImportKind } from '@/lib/import'
import { oneOf, str } from '@/lib/form'
import { commitImport } from '@/server/import'
import { run } from './run'

// The browser sends the raw rows and the column mapping; they're normalized
// again here so nothing unchecked reaches the database.
export async function importAction(_: FormState, fd: FormData) {
  return run(async (db) => {
    const kind = oneOf<ImportKind>(fd, 'kind', ['jobs', 'assets', 'purchases'], 'jobs')
    const rows = JSON.parse(str(fd, 'rows') || '[]') as unknown
    const mapping = JSON.parse(str(fd, 'mapping') || '{}') as Record<string, number | null>
    if (!Array.isArray(rows) || !rows.every((r) => Array.isArray(r) && r.every((c) => typeof c === 'string'))) {
      throw new Error('Couldn’t read the rows')
    }
    for (const f of FIELDS[kind]) {
      if (f.required && mapping[f.key] == null) throw new Error(`Pick a column for “${f.label}”`)
    }
    const n = normalize(kind, rows as string[][], mapping)
    if (n.errors.length) throw new Error(`Row ${n.errors[0].row}: ${n.errors[0].message}. Fix or remove it and try again.`)
    if (n.records.length === 0) throw new Error('Nothing to import')
    const result = await commitImport(db, kind, n.records.map((r) => r.record))
    const extra = 'unassigned' in result && result.unassigned ? ` ${result.unassigned} need a job or category.` : ''
    return { message: `Imported ${result.created} ${kind === 'jobs' ? 'jobs' : kind === 'assets' ? 'equipment rows' : 'purchases'}.${extra}` }
  })
}
