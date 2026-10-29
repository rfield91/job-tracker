import { describe, expect, it } from 'vitest'
import { allocate, formatMoney, laborAmount, parseMoney, withMarkup } from './money'
import { addDays, parseDate, todayIn } from './dates'
import { guessMapping, normalize } from './import'
import { toCsv } from './csv'
import { signSession, verifySession } from './auth'

describe('money', () => {
  it('parses the ways amounts get typed', () => {
    expect(parseMoney('1234')).toBe(123400)
    expect(parseMoney('$1,234.56')).toBe(123456)
    expect(parseMoney('(12.00)')).toBe(-1200)
    expect(parseMoney('-0.5')).toBe(-50)
    expect(parseMoney('.99')).toBe(99)
    expect(parseMoney('abc')).toBeNull()
    expect(parseMoney('')).toBeNull()
  })

  it('spreads tax and shipping so the total is exact', () => {
    const out = allocate([14200, 11800, 999], 2137)
    expect(out.reduce((a, b) => a + b, 0)).toBe(14200 + 11800 + 999 + 2137)
    expect(out[0]).toBeGreaterThan(14200)
    expect(allocate([0, 0, 0], 100).reduce((a, b) => a + b, 0)).toBe(100)
    expect(allocate([500], 0)).toEqual([500])
  })

  it('computes labor and markup', () => {
    expect(laborAmount(150, 9500)).toBe(14250)
    expect(withMarkup(14200, 25)).toBe(17750)
    expect(formatMoney(-1234)).toBe('-$12.34')
  })
})

describe('dates', () => {
  it('parses sheet date formats', () => {
    expect(parseDate('2026-03-04')).toBe('2026-03-04')
    expect(parseDate('3/4/2026')).toBe('2026-03-04')
    expect(parseDate('3/4/26')).toBe('2026-03-04')
    expect(parseDate('Mar 4, 2026')).toBe('2026-03-04')
    expect(parseDate('2/30/2026')).toBeNull()
    expect(parseDate('soon')).toBeNull()
  })

  it('uses the business time zone for today', () => {
    // 02:00 UTC on Jan 1 is still Dec 31 in New Hampshire.
    expect(todayIn('America/New_York', new Date('2027-01-01T02:00:00Z'))).toBe('2026-12-31')
    expect(addDays('2026-12-25', 14)).toBe('2027-01-08')
  })
})

describe('import', () => {
  const headers = ['Date', 'Customer', 'Car', 'Job', 'Billed', 'Cost', 'Profit', 'Date paid']
  it('guesses columns from header names', () => {
    const m = guessMapping('jobs', headers)
    expect(m.date).toBe(0)
    expect(m.customer).toBe(1)
    expect(m.vehicle).toBe(2)
    expect(m.title).toBe(3)
    expect(m.billed).toBe(4)
    expect(m.cost).toBe(5)
    expect(m.paidOn).toBe(7)
  })

  it('normalizes rows and skips totals', () => {
    const m = guessMapping('jobs', headers)
    const n = normalize('jobs', [
      ['1/5/2026', 'Mike R', '08 WRX', 'Catback', '$998.00', '$260.00', '$738', '1/9/2026'],
      ['1/7/2026', 'Dana', '', 'Brakes', '400', '', '', 'no'],
      ['', '', '', 'Total', '$1,398', '', '', ''],
      ['someday', 'Tom', '', 'Splitter', '650', '', '', ''],
    ], m)
    expect(n.records).toHaveLength(2)
    expect(n.records[0].record).toMatchObject({ date: '2026-01-05', billedCents: 99800, costCents: 26000, paidOn: '2026-01-09', paidCents: 99800 })
    expect(n.records[1].record).toMatchObject({ paidCents: 0, paidOn: null })
    expect(n.skipped).toBe(1)
    expect(n.errors).toEqual([{ row: 5, message: '“someday” isn’t a date' }])
  })
})

describe('csv', () => {
  it('quotes cells that need it', () => {
    expect(toCsv([['a', 'b,c', 'say "hi"', null, 3]])).toBe('a,"b,c","say ""hi""",,3\r\n')
  })
})

describe('session cookie', () => {
  it('signs, verifies and expires', async () => {
    process.env.ALLOWED_EMAILS = 'me@example.com'
    const t = await signSession('me@example.com', 'secret', 0)
    expect(await verifySession(t, 'secret', 1000)).toMatchObject({ email: 'me@example.com' })
    expect(await verifySession(t, 'other', 1000)).toBeNull()
    expect(await verifySession(t.replace(/.$/, 'x'), 'secret', 1000)).toBeNull()
    expect(await verifySession(t, 'secret', 31 * 864e5)).toBeNull()
    process.env.ALLOWED_EMAILS = 'someone@else.com'
    expect(await verifySession(t, 'secret', 1000)).toBeNull()
  })
})
