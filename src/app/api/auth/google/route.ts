import { NextResponse, type NextRequest } from 'next/server'
import { authMode, randomState, STATE_COOKIE } from '@/lib/auth'

export async function GET(request: NextRequest) {
  if (authMode() !== 'google') return NextResponse.redirect(new URL('/', request.url))
  const state = randomState()
  const next = request.nextUrl.searchParams.get('next') ?? '/'
  const params = new URLSearchParams({
    client_id: process.env.AUTH_GOOGLE_ID!,
    redirect_uri: new URL('/api/auth/callback', request.url).toString(),
    response_type: 'code',
    scope: 'openid email',
    state,
    prompt: 'select_account',
  })
  const res = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
  res.cookies.set(STATE_COOKIE, JSON.stringify({ state, next: next.startsWith('/') && !next.startsWith('//') ? next : '/' }), {
    httpOnly: true, secure: request.nextUrl.protocol === 'https:', sameSite: 'lax', path: '/', maxAge: 600,
  })
  return res
}
