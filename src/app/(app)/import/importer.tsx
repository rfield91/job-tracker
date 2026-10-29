'use client'

import { useMemo, useState } from 'react'
import Papa from 'papaparse'
import { ActionForm, SubmitButton } from '@/components/forms'
import { Card, cx, Field, Notice, Select } from '@/components/ui'
import { importAction } from '@/app/actions/import'
import { FIELDS, guessMapping, normalize, type ImportKind, type ImportRecord, type Mapping } from '@/lib/import'
import { formatMoney } from '@/lib/money'
import { formatDate } from '@/lib/dates'

const KINDS: { kind: ImportKind; title: string; text: string }[] = [
  { kind: 'jobs', title: 'Jobs sheet', text: 'One row per job: date, customer, billed, cost, paid.' },
  { kind: 'assets', title: 'Big-ticket items', text: 'Equipment like the lathe, bandsaw and welder.' },
  { kind: 'purchases', title: 'Purchases', text: 'One row per receipt: date, vendor, amount, category.' },
]

export function Importer() {
  const [kind, setKind] = useState<ImportKind>('jobs')
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [headerRow, setHeaderRow] = useState(0)
  const [all, setAll] = useState<string[][]>([])
  const [mapping, setMapping] = useState<Mapping>({})
  const [done, setDone] = useState<string | null>(null)

  function load(data: string[][], hr: number, k = kind) {
    setAll(data)
    setHeaderRow(hr)
    const h = data[hr] ?? []
    setHeaders(h)
    setRows(data.slice(hr + 1))
    setMapping(guessMapping(k, h))
    setDone(null)
  }

  function onFile(file: File) {
    setFileName(file.name)
    Papa.parse<string[]>(file, {
      skipEmptyLines: 'greedy',
      complete: (res) => {
        const data = res.data.map((r) => r.map((c) => String(c ?? '')))
        // Sheets often have a title row or two above the real header.
        const hr = Math.max(0, data.findIndex((r) => r.filter((c) => c.trim()).length >= 3))
        load(data, hr)
      },
    })
  }

  const result = useMemo(() => (rows.length ? normalize(kind, rows, mapping, headerRow + 2) : null), [kind, rows, mapping, headerRow])
  const fields = FIELDS[kind]
  const missing = fields.filter((f) => f.required && mapping[f.key] == null)

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-3">
        {KINDS.map((k) => (
          <button key={k.kind} type="button" onClick={() => { setKind(k.kind); if (headers.length) setMapping(guessMapping(k.kind, headers)) }}
            className={cx('rounded-xl border p-3 text-left', kind === k.kind ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:bg-hover')}>
            <div className={cx('text-sm font-medium', kind === k.kind && 'text-accent')}>{k.title}</div>
            <div className="text-xs text-fg-muted">{k.text}</div>
          </button>
        ))}
      </div>

      <Card className="p-4">
        <label className="flex cursor-pointer items-center gap-3">
          <span className="inline-flex h-10 items-center rounded-lg border border-line bg-raised px-3 text-sm hover:bg-hover">Choose CSV file</span>
          <span className="text-sm text-fg-muted">{fileName || 'No file yet'}</span>
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        </label>
        {all.length > 0 && (
          <div className="mt-3 flex items-center gap-2 text-sm text-fg-muted">
            Header is row
            <Select className="w-20" value={headerRow} onChange={(e) => load(all, Number(e.target.value))}>
              {all.slice(0, 10).map((_, i) => <option key={i} value={i}>{i + 1}</option>)}
            </Select>
            <span className="truncate">({headers.filter(Boolean).slice(0, 5).join(', ')}…)</span>
          </div>
        )}
      </Card>

      {headers.length > 0 && (
        <Card className="p-4">
          <div className="mb-3 text-sm font-semibold">Match the columns</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {fields.map((f) => (
              <Field key={f.key} label={<>{f.label}{f.required && <span className="text-danger"> *</span>}</>} hint={f.hint}>
                <Select value={mapping[f.key] ?? ''} onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value === '' ? null : Number(e.target.value) })}>
                  <option value="">—</option>
                  {headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                </Select>
              </Field>
            ))}
          </div>
        </Card>
      )}

      {result && missing.length === 0 && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 text-sm">
            <span>
              <span className="font-medium">{result.records.length} ready</span>
              {result.errors.length > 0 && <span className="text-danger"> · {result.errors.length} with problems</span>}
              {result.skipped > 0 && <span className="text-fg-subtle"> · {result.skipped} blank or total rows skipped</span>}
            </span>
            <span className="text-fg-muted">{summary(kind, result.records.map((r) => r.record))}</span>
          </div>
          {result.errors.length > 0 && (
            <div className="max-h-40 overflow-auto border-b border-line bg-danger-soft px-4 py-2 text-xs text-danger">
              {result.errors.slice(0, 50).map((e) => <div key={e.row}>Row {e.row}: {e.message}</div>)}
            </div>
          )}
          <div className="max-h-96 overflow-auto">
            <Preview kind={kind} records={result.records.slice(0, 200)} />
          </div>
        </Card>
      )}
      {missing.length > 0 && headers.length > 0 && (
        <Notice>Pick a column for {missing.map((f) => f.label).join(', ')}.</Notice>
      )}

      {result && missing.length === 0 && result.records.length > 0 && !done && (
        <ActionForm action={importAction} onSuccess={(s) => setDone(s?.message ?? 'Imported')} className="flex flex-col items-end gap-2">
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="rows" value={JSON.stringify(rows)} />
          <input type="hidden" name="mapping" value={JSON.stringify(mapping)} />
          {result.errors.length > 0
            ? <Notice tone="danger">Fix the rows with problems in the sheet (or clear them) and choose the file again.</Notice>
            : <SubmitButton size="lg">Import {result.records.length}</SubmitButton>}
        </ActionForm>
      )}
      {done && <Notice tone="good">{done}</Notice>}
    </div>
  )
}

function summary(kind: ImportKind, recs: ImportRecord[]) {
  if (kind === 'jobs') {
    const r = recs as Extract<ImportRecord, { billedCents: number }>[]
    return `Billed ${formatMoney(r.reduce((a, x) => a + x.billedCents, 0))} · cost ${formatMoney(r.reduce((a, x) => a + x.costCents, 0))}`
  }
  if (kind === 'assets') return `Total ${formatMoney((recs as Extract<ImportRecord, { businessUsePct: number }>[]).reduce((a, x) => a + x.costCents, 0))}`
  return `Total ${formatMoney((recs as Extract<ImportRecord, { amountCents: number }>[]).reduce((a, x) => a + x.amountCents, 0))}`
}

function Preview({ kind, records }: { kind: ImportKind; records: { row: number; record: ImportRecord }[] }) {
  const cols: [string, (r: never) => string][] = kind === 'jobs'
    ? [['Date', (r: { date: string }) => formatDate(r.date)], ['Customer', (r: { customer: string }) => r.customer],
      ['Car', (r: { vehicle: string | null }) => r.vehicle ?? ''], ['Description', (r: { title: string }) => r.title],
      ['Billed', (r: { billedCents: number }) => formatMoney(r.billedCents)], ['Cost', (r: { costCents: number }) => formatMoney(r.costCents)],
      ['Paid', (r: { paidCents: number; paidOn: string | null; method: string }) => r.paidCents ? `${formatMoney(r.paidCents)} ${r.paidOn ? formatDate(r.paidOn) : ''} ${r.method}` : 'Unpaid']] as never
    : kind === 'assets'
      ? [['Date', (r: { date: string }) => formatDate(r.date)], ['Item', (r: { description: string }) => r.description],
        ['Cost', (r: { costCents: number }) => formatMoney(r.costCents)], ['Business use', (r: { businessUsePct: number }) => `${r.businessUsePct}%`],
        ['Vendor', (r: { vendor: string | null }) => r.vendor ?? '']] as never
      : [['Date', (r: { date: string }) => formatDate(r.date)], ['Vendor', (r: { vendor: string }) => r.vendor],
        ['Amount', (r: { amountCents: number }) => formatMoney(r.amountCents)], ['Category', (r: { category: string | null }) => r.category ?? ''],
        ['Job', (r: { job: string | null }) => r.job ?? ''], ['Description', (r: { description: string | null }) => r.description ?? '']] as never
  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 bg-raised">
        <tr className="text-left text-xs text-fg-subtle">
          <th className="px-4 py-2 font-medium">Row</th>
          {cols.map(([h]) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {records.map(({ row, record }) => (
          <tr key={row}>
            <td className="px-4 py-1.5 text-fg-subtle tabular">{row}</td>
            {cols.map(([h, f]) => <td key={h} className="px-2 py-1.5">{f(record as never)}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
