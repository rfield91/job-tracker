import { parseMoney, parseScaled } from './money'
import { parseDate } from './dates'

// Small readers for FormData in server actions.

export function str(fd: FormData, name: string) {
  const v = fd.get(name)
  return typeof v === 'string' ? v.trim() : ''
}

export function optStr(fd: FormData, name: string) {
  return str(fd, name) || null
}

export function int(fd: FormData, name: string) {
  const s = str(fd, name)
  if (!s) return null
  const n = Number(s)
  return Number.isInteger(n) ? n : null
}

export function reqInt(fd: FormData, name: string, label = name) {
  const n = int(fd, name)
  if (n == null) throw new Error(`Missing ${label}`)
  return n
}

export function money(fd: FormData, name: string) {
  const s = str(fd, name)
  if (!s) return null
  const n = parseMoney(s)
  if (n == null) throw new Error(`“${s}” isn’t an amount`)
  return n
}

export function reqMoney(fd: FormData, name: string, label: string) {
  const n = money(fd, name)
  if (n == null) throw new Error(`Enter ${label}`)
  return n
}

export function scaled(fd: FormData, name: string, scale: number) {
  const s = str(fd, name)
  if (!s) return null
  const n = parseScaled(s, scale)
  if (n == null) throw new Error(`“${s}” isn’t a number`)
  return n
}

export function reqDate(fd: FormData, name: string, label = 'a date') {
  const d = parseDate(str(fd, name))
  if (!d) throw new Error(`Enter ${label}`)
  return d
}

export function optDate(fd: FormData, name: string) {
  return parseDate(str(fd, name))
}

export function oneOf<T extends string>(fd: FormData, name: string, options: readonly T[], fallback: T): T {
  const s = str(fd, name) as T
  return options.includes(s) ? s : fallback
}
