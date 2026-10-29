import Stripe from 'stripe'
import { getDb } from '@/db'
import { handleStripeEvent, stripeClient } from '@/server/stripe'

// Public endpoint: trusted only through Stripe's signature.
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret || !process.env.STRIPE_SECRET_KEY) return new Response('Stripe isn’t configured', { status: 503 })
  const body = await request.text()
  let event: Stripe.Event
  try {
    event = await Stripe.webhooks.constructEventAsync(body, request.headers.get('stripe-signature') ?? '', secret)
  } catch {
    return new Response('Bad signature', { status: 400 })
  }
  try {
    await handleStripeEvent(await getDb(), stripeClient(), event)
  } catch (err) {
    console.error('stripe webhook', event.type, event.id, err)
    // Stripe retries on non-2xx.
    return new Response('Handler failed', { status: 500 })
  }
  return Response.json({ received: true })
}
