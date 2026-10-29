const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const usdWhole = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

export function formatMoney(cents: number, opts: { whole?: boolean } = {}) {
  return (opts.whole ? usdWhole : usd).format(cents / 100)
}

// Accepts '1234', '1,234.5', '$1,234.56', '-12', '(12.00)'. Returns null for
// anything that isn't a number.
export function parseMoney(input: string | null | undefined): number | null {
  if (input == null) return null
  let s = String(input).trim()
  if (!s) return null
  let negative = false
  if (/^\(.*\)$/.test(s)) {
    negative = true
    s = s.slice(1, -1)
  }
  s = s.replace(/[$,\s]/g, '')
  if (s.startsWith('-')) {
    negative = !negative
    s = s.slice(1)
  }
  if (!/^\d*\.?\d*$/.test(s) || s === '' || s === '.') return null
  const cents = Math.round(parseFloat(s) * 100)
  return negative ? -cents : cents
}

// For form inputs: 12345 → '123.45'.
export function centsToInput(cents: number | null | undefined) {
  if (cents == null) return ''
  return (cents / 100).toFixed(2)
}

// Hours and miles are stored as integers in hundredths / tenths.
export function parseScaled(input: string | null | undefined, scale: number): number | null {
  if (input == null) return null
  const s = String(input).trim().replace(/,/g, '')
  if (!s || !/^-?\d*\.?\d*$/.test(s) || s === '.' || s === '-') return null
  return Math.round(parseFloat(s) * scale)
}

export function formatScaled(value: number | null | undefined, scale: number) {
  if (value == null) return ''
  const n = value / scale
  return Number.isInteger(n) ? n.toFixed(1) : String(n)
}

export function laborAmount(hoursHundredths: number, rateCents: number) {
  return Math.round((hoursHundredths * rateCents) / 100)
}

export function withMarkup(costCents: number, markupPct: number) {
  return Math.round(costCents * (1 + markupPct / 100))
}

// Spreads `extra` (receipt tax + shipping) across line amounts in proportion,
// so the allocated total always equals sum(lines) + extra exactly.
export function allocate(lines: number[], extra: number): number[] {
  const base = lines.reduce((a, b) => a + b, 0)
  if (extra === 0 || lines.length === 0) return [...lines]
  if (base === 0) {
    const each = Math.trunc(extra / lines.length)
    const out = lines.map(() => each)
    out[0] += extra - each * lines.length
    return out
  }
  const shares = lines.map((l) => (l * extra) / base)
  const floored = shares.map((s) => Math.floor(s))
  let rest = extra - floored.reduce((a, b) => a + b, 0)
  const order = shares
    .map((s, i) => ({ i, frac: s - Math.floor(s) }))
    .sort((a, b) => b.frac - a.frac)
  for (let k = 0; rest > 0; k = (k + 1) % order.length, rest--) floored[order[k].i]++
  return lines.map((l, i) => l + floored[i])
}
