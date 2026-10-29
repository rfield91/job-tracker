'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart3, Briefcase, Home, Menu, Receipt } from 'lucide-react'
import { cx } from './ui'
import { MORE } from '@/lib/nav-items'

const MAIN = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/jobs', label: 'Jobs', icon: Briefcase },
  { href: '/purchases', label: 'Purchases', icon: Receipt },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
]

function active(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`)
}

export function TopNav({ businessName }: { businessName: string }) {
  const pathname = usePathname()
  return (
    <header className="no-print sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-1 px-4">
        <Link href="/" className="mr-4 truncate font-semibold">{businessName || 'Shop jobs'}</Link>
        <nav className="hidden items-center gap-1 md:flex">
          {[...MAIN, ...MORE].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cx('rounded-md px-2.5 py-1.5 text-sm',
                active(pathname, item.href) ? 'bg-hover font-medium text-fg' : 'text-fg-muted hover:text-fg')}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  )
}

export function BottomNav() {
  const pathname = usePathname()
  const moreActive = MORE.some((m) => active(pathname, m.href)) || pathname === '/more'
  return (
    <nav className="no-print fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
      <div className="grid grid-cols-5">
        {MAIN.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href}
            className={cx('flex flex-col items-center gap-0.5 py-2 text-[11px]',
              active(pathname, href) ? 'text-accent' : 'text-fg-muted')}>
            <Icon size={20} />
            {label}
          </Link>
        ))}
        <Link href="/more"
          className={cx('flex flex-col items-center gap-0.5 py-2 text-[11px]', moreActive ? 'text-accent' : 'text-fg-muted')}>
          <Menu size={20} />
          More
        </Link>
      </div>
    </nav>
  )
}
