type Cell = string | number | boolean | null | undefined | Date

function cell(v: Cell) {
  if (v == null) return ''
  const s = v instanceof Date ? v.toISOString() : String(v)
  return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(rows: Cell[][]) {
  return rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
}

export function objectsToCsv(rows: Record<string, unknown>[]) {
  if (rows.length === 0) return ''
  const keys = Object.keys(rows[0])
  return toCsv([keys, ...rows.map((r) => keys.map((k) => {
    const v = r[k]
    return typeof v === 'object' && v !== null && !(v instanceof Date) ? JSON.stringify(v) : (v as Cell)
  }))])
}

export const dollars = (cents: number | null | undefined) => (cents == null ? '' : (cents / 100).toFixed(2))
