import Link from 'next/link'
import { Card } from '@/components/ui'
import { MORE } from '@/lib/nav-items'
import { authMode } from '@/lib/auth'

export const metadata = { title: 'More' }

export default function MorePage() {
  return (
    <div className="space-y-4">
      <Card className="divide-y divide-line">
        {MORE.map((m) => (
          <Link key={m.href} href={m.href} className="block px-4 py-3 text-sm hover:bg-hover">{m.label}</Link>
        ))}
        <Link href="/payments/unmatched" className="block px-4 py-3 text-sm hover:bg-hover">Stripe payments to match</Link>
      </Card>
      {authMode() === 'google' && (
        <form action="/api/auth/signout" method="post">
          <button className="text-sm text-fg-muted hover:text-fg">Sign out</button>
        </form>
      )}
    </div>
  )
}
