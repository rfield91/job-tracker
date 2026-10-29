import { NextResponse, type NextRequest } from 'next/server'
import { authMode, SESSION_COOKIE, verifySession } from '@/lib/auth'

// Everything needs a signed-in session except sign-in itself, the Stripe
// webhook (checked by signature) and the cron route (checked by CRON_SECRET).
const PUBLIC = [/^\/signin$/, /^\/api\/auth\//, /^\/api\/stripe\/webhook$/, /^\/api\/cron\//]

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (PUBLIC.some((r) => r.test(pathname))) return NextResponse.next()
  const mode = authMode()
  if (mode === 'disabled') return NextResponse.next()
  if (mode === 'misconfigured') {
    return new NextResponse('Sign-in is not configured. Set AUTH_SECRET, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET and ALLOWED_EMAILS.', { status: 500 })
  }
  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value)
  if (session) return NextResponse.next()
  if (pathname.startsWith('/api/') || pathname.startsWith('/files/')) {
    return new NextResponse('Unauthorized', { status: 401 })
  }
  const url = new URL('/signin', request.url)
  if (pathname !== '/') url.searchParams.set('next', pathname + request.nextUrl.search)
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|apple-icon.png).*)'],
}
