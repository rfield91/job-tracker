import { redirect } from 'next/navigation'
import { authMode } from '@/lib/auth'

export const metadata = { title: 'Sign in' }

const ERRORS: Record<string, string> = {
  'not-allowed': 'That Google account isn’t allowed to use this app.',
  state: 'Sign-in expired. Try again.',
  token: 'Google sign-in failed. Try again.',
}

export default async function SignIn({ searchParams }: PageProps<'/signin'>) {
  if (authMode() === 'disabled') redirect('/')
  const sp = await searchParams
  const next = typeof sp.next === 'string' ? sp.next : '/'
  const error = typeof sp.error === 'string' ? ERRORS[sp.error] ?? 'Sign-in failed.' : null
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-6 text-center">
        <h1 className="text-lg font-semibold">Shop jobs</h1>
        <p className="mt-1 text-sm text-fg-muted">Sign in to continue.</p>
        {error && <p className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        <a href={`/api/auth/google?next=${encodeURIComponent(next)}`}
          className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-lg bg-accent text-sm font-medium text-accent-fg hover:opacity-90">
          Sign in with Google
        </a>
      </div>
    </div>
  )
}
