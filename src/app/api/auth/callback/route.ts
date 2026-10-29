import { NextResponse, type NextRequest } from 'next/server'
import { allowedEmails, authMode, SESSION_COOKIE, sessionMaxAge, signSession, STATE_COOKIE } from '@/lib/auth'

function fail(request: NextRequest, reason: string) {
  const url = new URL('/signin', request.url)
  url.searchParams.set('error', reason)
  const res = NextResponse.redirect(url)
  res.cookies.delete(STATE_COOKIE)
  return res
}

export async function GET(request: NextRequest) {
  if (authMode() !== 'google') return NextResponse.redirect(new URL('/', request.url))
  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')
  let saved: { state: string; next: string } | null = null
  try {
    saved = JSON.parse(request.cookies.get(STATE_COOKIE)?.value ?? 'null')
  } catch {}
  if (!code || !state || !saved || saved.state !== state) return fail(request, 'state')

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.AUTH_GOOGLE_ID!,
      client_secret: process.env.AUTH_GOOGLE_SECRET!,
      redirect_uri: new URL('/api/auth/callback', request.url).toString(),
      grant_type: 'authorization_code',
    }),
  })
  if (!tokenRes.ok) return fail(request, 'token')
  const { id_token } = (await tokenRes.json()) as { id_token?: string }
  if (!id_token) return fail(request, 'token')
  // The ID token came straight from Google's token endpoint over TLS, so its
  // claims can be read without verifying the signature (OIDC Core 3.1.3.7).
  const claims = JSON.parse(Buffer.from(id_token.split('.')[1], 'base64url').toString('utf8')) as {
    email?: string; email_verified?: boolean; aud?: string
  }
  if (claims.aud !== process.env.AUTH_GOOGLE_ID) return fail(request, 'token')
  const email = claims.email?.toLowerCase()
  if (!email || !claims.email_verified || !allowedEmails().includes(email)) return fail(request, 'not-allowed')

  const res = NextResponse.redirect(new URL(saved.next, request.url))
  res.cookies.delete(STATE_COOKIE)
  res.cookies.set(SESSION_COOKIE, await signSession(email), {
    httpOnly: true, secure: request.nextUrl.protocol === 'https:', sameSite: 'lax', path: '/', maxAge: sessionMaxAge,
  })
  return res
}
