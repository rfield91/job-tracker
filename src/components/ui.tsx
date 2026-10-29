import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'
import { formatMoney } from '@/lib/money'

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ')
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const buttonBase = 'inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap'
const buttonVariants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:opacity-90',
  secondary: 'bg-surface border border-line text-fg hover:bg-hover',
  ghost: 'text-fg-muted hover:bg-hover hover:text-fg',
  danger: 'bg-surface border border-line text-danger hover:bg-danger-soft',
}
const buttonSizes = { sm: 'h-8 px-2.5', md: 'h-10 px-3.5', lg: 'h-12 px-5 text-base' }

export function buttonClass(variant: Variant = 'secondary', size: keyof typeof buttonSizes = 'md') {
  return cx(buttonBase, buttonVariants[variant], buttonSizes[size])
}

export function Button({ variant = 'secondary', size = 'md', className, ...props }:
  ComponentProps<'button'> & { variant?: Variant; size?: keyof typeof buttonSizes }) {
  return <button type="button" {...props} className={cx(buttonClass(variant, size), className)} />
}

export function LinkButton({ variant = 'secondary', size = 'md', className, ...props }:
  ComponentProps<typeof Link> & { variant?: Variant; size?: keyof typeof buttonSizes }) {
  return <Link {...props} className={cx(buttonClass(variant, size), className)} />
}

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return <div {...props} className={cx('rounded-xl border border-line bg-surface', className)} />
}

export function CardHeader({ title, action, className }: { title: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex items-center justify-between gap-3 px-4 pt-3.5 pb-2', className)}>
      <h2 className="text-sm font-semibold">{title}</h2>
      {action}
    </div>
  )
}

export function PageHeader({ title, subtitle, actions, back }:
  { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-4">
      {back && (
        <Link href={back.href} className="no-print mb-1 inline-block text-sm text-fg-muted hover:text-fg">
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <div className="mt-0.5 text-sm text-fg-muted">{subtitle}</div>}
        </div>
        {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  )
}

const inputBase = 'w-full rounded-lg border border-line bg-surface px-3 text-base sm:text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent'

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input {...props} className={cx(inputBase, 'h-10', className)} />
}

export function MoneyInput({ className, ...props }: ComponentProps<'input'>) {
  return (
    <div className={cx('relative', className)}>
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-fg-subtle">$</span>
      <input inputMode="decimal" autoComplete="off" {...props} className={cx(inputBase, 'h-10 pl-6 tabular')} />
    </div>
  )
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea rows={3} {...props} className={cx(inputBase, 'py-2', className)} />
}

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select {...props} className={cx(inputBase, 'h-10 pr-8', className)} />
}

export function Field({ label, hint, children, className }:
  { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1 block text-sm font-medium text-fg-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-fg-subtle">{hint}</span>}
    </label>
  )
}

type Tone = 'neutral' | 'accent' | 'good' | 'warn' | 'danger'
const tones: Record<Tone, string> = {
  neutral: 'bg-hover text-fg-muted',
  accent: 'bg-accent-soft text-accent',
  good: 'bg-good-soft text-good',
  warn: 'bg-warn-soft text-warn',
  danger: 'bg-danger-soft text-danger',
}

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', tones[tone], className)}>
      {children}
    </span>
  )
}

export function Money({ cents, whole, className, signed }: { cents: number; whole?: boolean; className?: string; signed?: boolean }) {
  return (
    <span className={cx('tabular', signed && cents < 0 && 'text-danger', className)}>
      {formatMoney(cents, { whole })}
    </span>
  )
}

export function Stat({ label, cents, tone, hint }: { label: string; cents: number; tone?: 'good' | 'danger' | 'muted'; hint?: ReactNode }) {
  return (
    <div>
      <div className="text-xs text-fg-subtle">{label}</div>
      <div className={cx('text-lg font-semibold tabular',
        tone === 'good' && 'text-good', tone === 'danger' && 'text-danger', tone === 'muted' && 'text-fg-muted')}>
        {formatMoney(cents, { whole: Math.abs(cents) >= 100000 })}
      </div>
      {hint && <div className="text-xs text-fg-subtle">{hint}</div>}
    </div>
  )
}

export function Empty({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('px-4 py-8 text-center text-sm text-fg-subtle', className)}>{children}</div>
}

export function Notice({ tone = 'warn', children, className }: { tone?: 'warn' | 'danger' | 'good' | 'accent'; children: ReactNode; className?: string }) {
  return (
    <div className={cx('rounded-lg px-3 py-2 text-sm', tones[tone], className)}>{children}</div>
  )
}
