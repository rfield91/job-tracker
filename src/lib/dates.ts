// Calendar dates are 'YYYY-MM-DD' strings in the business's time zone.

export function todayIn(timezone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)!.value
  return `${get('year')}-${get('month')}-${get('day')}`
}

export function yearOf(date: string) {
  return Number(date.slice(0, 4))
}

export function monthKey(date: string) {
  return date.slice(0, 7)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December']

export function monthName(key: string, long = false) {
  const m = Number(key.slice(5, 7)) - 1
  return (long ? MONTHS_LONG : MONTHS)[m]
}

export function formatDate(date: string | null | undefined, opts: { year?: boolean } = {}) {
  if (!date) return ''
  const [y, m, d] = date.split('-').map(Number)
  const s = `${MONTHS[m - 1]} ${d}`
  return opts.year === false ? s : `${s}, ${y}`
}

export function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// Accepts 2026-03-04, 3/4/2026, 3/4/26, 03-04-2026, 'Mar 4, 2026'.
export function parseDate(input: string | null | undefined): string | null {
  if (!input) return null
  const s = String(input).trim()
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return build(+m[1], +m[2], +m[3])
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/)
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]
    return build(y, +m[1], +m[2])
  }
  m = s.match(/^([A-Za-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4})$/)
  if (m) {
    const mi = MONTHS.findIndex((x) => x.toLowerCase() === m![1].toLowerCase())
    if (mi >= 0) return build(+m[3], mi + 1, +m[2])
  }
  return null
}

function build(y: number, m: number, d: number) {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2200) return null
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCMonth() !== m - 1) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

// Federal estimated tax due dates for a tax year.
export function estimatedTaxDueDates(year: number) {
  return [
    { quarter: 'Q1', covers: 'Jan–Mar', due: `${year}-04-15` },
    { quarter: 'Q2', covers: 'Apr–May', due: `${year}-06-15` },
    { quarter: 'Q3', covers: 'Jun–Aug', due: `${year}-09-15` },
    { quarter: 'Q4', covers: 'Sep–Dec', due: `${year + 1}-01-15` },
  ]
}
