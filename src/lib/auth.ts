// Single-user sign-in: Google OAuth, allowed only for ALLOWED_EMAILS, with an
// HMAC-signed session cookie. Uses Web Crypto so it runs in the proxy too.

export const SESSION_COOKIE = 'jt_session'
export const STATE_COOKIE = 'jt_oauth_state'
const SESSION_DAYS = 30

export type AuthMode = 'google' | 'disabled' | 'misconfigured'

export function authMode(): AuthMode {
  const ok = process.env.AUTH_SECRET && process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
    && process.env.ALLOWED_EMAILS
  if (ok) return 'google'
  // Local development without Google credentials runs signed out. A
  // production build never does.
  return process.env.NODE_ENV === 'production' ? 'misconfigured' : 'disabled'
}

export function allowedEmails() {
  return (process.env.ALLOWED_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
}

function b64url(bytes: Uint8Array) {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64url(s: string) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

async function key(secret: string) {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign', 'verify'])
}

export async function signSession(email: string, secret = process.env.AUTH_SECRET!, now = Date.now()) {
  const payload = b64url(new TextEncoder().encode(JSON.stringify({ email, exp: now + SESSION_DAYS * 864e5 })))
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await key(secret), new TextEncoder().encode(payload)))
  return `${payload}.${b64url(sig)}`
}

export async function verifySession(token: string | undefined, secret = process.env.AUTH_SECRET!, now = Date.now()) {
  if (!token || !secret) return null
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return null
  try {
    const ok = await crypto.subtle.verify('HMAC', await key(secret), fromB64url(sig) as BufferSource,
      new TextEncoder().encode(payload))
    if (!ok) return null
    const data = JSON.parse(new TextDecoder().decode(fromB64url(payload))) as { email: string; exp: number }
    if (data.exp < now) return null
    if (!allowedEmails().includes(data.email.toLowerCase())) return null
    return data
  } catch {
    return null
  }
}

export const sessionMaxAge = SESSION_DAYS * 86400

export function randomState() {
  return b64url(crypto.getRandomValues(new Uint8Array(24)))
}
