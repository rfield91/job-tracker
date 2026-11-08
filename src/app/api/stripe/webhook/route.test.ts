import Stripe from 'stripe'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { POST } from './route'

const secret = 'whsec_test'
// Pretty-printed with a non-ASCII character: the signature covers these exact bytes.
const body = JSON.stringify({ id: 'evt_1', object: 'event', type: 'customer.created', data: { object: { name: 'José’s' } } }, null, 2)

function post(signingSecret: string) {
  return POST(new Request('http://localhost/api/stripe/webhook', {
    method: 'POST',
    body,
    headers: { 'stripe-signature': Stripe.webhooks.generateTestHeaderString({ payload: body, secret: signingSecret }) },
  }))
}

describe('stripe webhook route', () => {
  const env = { ...process.env }
  beforeAll(() => {
    delete process.env.DATABASE_URL
    process.env.PGLITE_DIR = 'memory'
    process.env.STRIPE_SECRET_KEY = 'sk_test'
    process.env.STRIPE_WEBHOOK_SECRET = secret
  })
  afterAll(() => { process.env = env })

  it('accepts an event signed with the endpoint’s secret', async () => {
    expect((await post(secret)).status).toBe(200)
  })

  it('ignores whitespace around the configured secret', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = `${secret}\n`
    expect((await post(secret)).status).toBe(200)
    process.env.STRIPE_WEBHOOK_SECRET = secret
  })

  it('rejects an event signed with another secret and logs why', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await post('whsec_other')
    expect(res.status).toBe(400)
    expect(await res.text()).toBe('Bad signature')
    expect(log).toHaveBeenCalledWith('stripe webhook signature', expect.stringContaining('No signatures found'))
    log.mockRestore()
  })
})
