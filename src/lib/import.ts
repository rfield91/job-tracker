import { parseDate } from './dates'
import { parseMoney } from './money'

// CSV import from the old spreadsheets. The columns are mapped by hand (with
// a guess from the header names), then each row is normalized here — in the
// browser for the preview and again on the server before saving.

export type ImportKind = 'jobs' | 'assets' | 'purchases'

export type FieldDef = { key: string; label: string; required?: boolean; hint?: string; guess: RegExp }

export const FIELDS: Record<ImportKind, FieldDef[]> = {
  jobs: [
    { key: 'date', label: 'Date', required: true, guess: /^(date|start|opened|job date|day)/i },
    { key: 'customer', label: 'Customer', required: true, guess: /customer|client|name|who/i },
    { key: 'vehicle', label: 'Car', guess: /car|vehicle|make|model/i },
    { key: 'title', label: 'Description', guess: /desc|job|work|title|service/i },
    { key: 'billed', label: 'Billed total', required: true, guess: /bill|total|invoice|charged|price|revenue/i },
    { key: 'cost', label: 'Cost', guess: /cost|parts|expense/i },
    { key: 'paidOn', label: 'Date paid', hint: 'Blank: counted as paid on the job date', guess: /paid( on| date)?$|date paid|payment date/i },
    { key: 'paid', label: 'Amount paid', hint: 'Blank: the billed total', guess: /amount paid|paid amount|received/i },
    { key: 'method', label: 'Paid with', guess: /method|paid (with|via|by)|venmo|payment type/i },
    { key: 'kind', label: 'Service or fab', hint: 'Cells containing “fab” become fabrication', guess: /type|kind|category/i },
    { key: 'notes', label: 'Notes', guess: /note|comment/i },
  ],
  assets: [
    { key: 'description', label: 'Item', required: true, guess: /item|desc|name|equipment|tool/i },
    { key: 'date', label: 'Date bought / in service', required: true, guess: /date|purchased|bought/i },
    { key: 'cost', label: 'Cost', required: true, guess: /cost|price|amount|total/i },
    { key: 'vendor', label: 'Vendor', guess: /vendor|store|from|seller|where/i },
    { key: 'businessUse', label: 'Business use %', hint: 'Blank: 100%', guess: /use|business|%/i },
    { key: 'notes', label: 'Notes', guess: /note|comment/i },
  ],
  purchases: [
    { key: 'date', label: 'Date', required: true, guess: /date|day/i },
    { key: 'vendor', label: 'Vendor', required: true, guess: /vendor|store|merchant|from|where|payee/i },
    { key: 'amount', label: 'Amount', required: true, guess: /amount|total|cost|price/i },
    { key: 'description', label: 'Description', guess: /desc|item|what|memo/i },
    { key: 'category', label: 'Category', hint: 'Matched to your category names; others need a home', guess: /categor|type/i },
    { key: 'job', label: 'Job number', hint: 'e.g. 2026-051; blank for shop expenses', guess: /job/i },
  ],
}

export type Mapping = Record<string, number | null>

export function guessMapping(kind: ImportKind, headers: string[]): Mapping {
  const used = new Set<number>()
  const out: Mapping = {}
  for (const f of FIELDS[kind]) {
    const i = headers.findIndex((h, idx) => !used.has(idx) && f.guess.test(h.trim()))
    out[f.key] = i >= 0 ? i : null
    if (i >= 0) used.add(i)
  }
  return out
}

export type JobRecord = {
  date: string; customer: string; vehicle: string | null; title: string; kind: 'service' | 'fabrication'
  billedCents: number; costCents: number; paidCents: number; paidOn: string | null; method: string; notes: string | null
}
export type AssetRecord = {
  description: string; date: string; costCents: number; vendor: string | null; businessUsePct: number; notes: string | null
}
export type PurchaseRecord = {
  date: string; vendor: string; amountCents: number; description: string | null; category: string | null; job: string | null
}
export type ImportRecord = JobRecord | AssetRecord | PurchaseRecord

export type Normalized<T> = { records: { row: number; record: T }[]; errors: { row: number; message: string }[]; skipped: number }

const METHODS = ['cash', 'check', 'venmo', 'paypal', 'zelle', 'stripe', 'card', 'other']

function methodOf(s: string) {
  const v = s.trim().toLowerCase()
  if (!v) return 'other'
  return METHODS.find((m) => v.includes(m)) ?? (/cheque/.test(v) ? 'check' : /credit|debit|square/.test(v) ? 'card' : 'other')
}

export function normalize(kind: ImportKind, rows: string[][], mapping: Mapping, firstRow = 2): Normalized<ImportRecord> {
  const out: Normalized<ImportRecord> = { records: [], errors: [], skipped: 0 }
  const get = (r: string[], key: string) => {
    const i = mapping[key]
    return i == null ? '' : (r[i] ?? '').trim()
  }
  rows.forEach((r, idx) => {
    const row = idx + firstRow // spreadsheet row number
    if (r.every((c) => !c?.trim())) {
      out.skipped++
      return
    }
    const err = (message: string) => out.errors.push({ row, message })
    if (kind === 'jobs') {
      const date = parseDate(get(r, 'date'))
      const customer = get(r, 'customer')
      const billed = parseMoney(get(r, 'billed'))
      // Totals and blank lines in the sheet: no customer and no date.
      if (!customer && !date) return void out.skipped++
      if (!date) return err(`“${get(r, 'date')}” isn’t a date`)
      if (!customer) return err('No customer')
      if (billed == null) return err(`Billed “${get(r, 'billed')}” isn’t an amount`)
      const costRaw = get(r, 'cost')
      const cost = costRaw ? parseMoney(costRaw) : 0
      if (cost == null) return err(`Cost “${costRaw}” isn’t an amount`)
      const paidOnRaw = get(r, 'paidOn')
      const paidOn = paidOnRaw ? parseDate(paidOnRaw) : null
      if (paidOnRaw && !paidOn && !/^(no|unpaid|n)$/i.test(paidOnRaw)) return err(`Date paid “${paidOnRaw}” isn’t a date`)
      const paidRaw = get(r, 'paid')
      const paid = paidRaw ? parseMoney(paidRaw) : (/^(no|unpaid|n)$/i.test(paidOnRaw) ? 0 : billed)
      if (paid == null) return err(`Amount paid “${paidRaw}” isn’t an amount`)
      out.records.push({ row, record: {
        date, customer, vehicle: get(r, 'vehicle') || null, title: get(r, 'title') || 'Imported job',
        kind: /fab/i.test(get(r, 'kind')) ? 'fabrication' : 'service',
        billedCents: billed, costCents: cost, paidCents: paid, paidOn, method: methodOf(get(r, 'method')),
        notes: get(r, 'notes') || null,
      } })
    } else if (kind === 'assets') {
      const description = get(r, 'description')
      const date = parseDate(get(r, 'date'))
      const cost = parseMoney(get(r, 'cost'))
      if (!description && !date) return void out.skipped++
      if (!description) return err('No item description')
      if (!date) return err(`“${get(r, 'date')}” isn’t a date`)
      if (cost == null) return err(`Cost “${get(r, 'cost')}” isn’t an amount`)
      const useRaw = get(r, 'businessUse').replace('%', '')
      const use = useRaw ? Math.round(Number(useRaw) <= 1 && useRaw.includes('.') ? Number(useRaw) * 100 : Number(useRaw)) : 100
      if (!Number.isFinite(use) || use < 1 || use > 100) return err(`Business use “${get(r, 'businessUse')}” should be 1–100`)
      out.records.push({ row, record: {
        description, date, costCents: cost, vendor: get(r, 'vendor') || null, businessUsePct: use, notes: get(r, 'notes') || null,
      } })
    } else {
      const date = parseDate(get(r, 'date'))
      const vendor = get(r, 'vendor')
      const amount = parseMoney(get(r, 'amount'))
      if (!vendor && !date) return void out.skipped++
      if (!date) return err(`“${get(r, 'date')}” isn’t a date`)
      if (!vendor) return err('No vendor')
      if (amount == null) return err(`Amount “${get(r, 'amount')}” isn’t an amount`)
      out.records.push({ row, record: {
        date, vendor, amountCents: amount, description: get(r, 'description') || null,
        category: get(r, 'category') || null, job: get(r, 'job') || null,
      } })
    }
  })
  return out
}
