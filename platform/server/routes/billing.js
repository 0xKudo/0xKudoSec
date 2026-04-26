import { Router } from 'express';
import Stripe from 'stripe';
import { requireAuth } from '../middleware/requireAuth.js';
import { assignPaidRole, removePaidRole } from '../services/auth0Mgmt.js';

let _stripe = null;
function getStripe() {
  if (!_stripe) _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  return _stripe;
}

const router = Router();

// POST /api/billing/create-checkout-session
router.post('/create-checkout-session', requireAuth, async (req, res) => {
  const { plan } = req.body;
  const priceId = plan === 'yearly' ? process.env.STRIPE_PRICE_YEARLY : plan === 'monthly' ? process.env.STRIPE_PRICE_MONTHLY : null;
  if (!priceId) {
    return res.status(400).json({ error: 'Invalid plan. Use "monthly" or "yearly".' });
  }

  const userSub = req.auth.sub;
  const userEmail = req.auth.email;
  const appUrl = process.env.ALLOWED_ORIGIN || 'https://0xkudo.com';

  // Find or create a Stripe customer with auth0_sub in metadata so it's
  // available immediately when subscription webhooks fire (before
  // checkout.session.completed is processed).
  let customerId;
  const existing = await getStripe().customers.search({
    query: `metadata['auth0_sub']:'${userSub}'`,
  });
  if (existing.data.length) {
    customerId = existing.data[0].id;
  } else {
    const customer = await getStripe().customers.create({
      email: userEmail,
      metadata: { auth0_sub: userSub },
    });
    customerId = customer.id;
  }

  const session = await getStripe().checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: userSub,
    customer: customerId,
    success_url: `${appUrl}/siem?upgraded=1`,
    cancel_url: `${appUrl}/siem`,
    metadata: { auth0_sub: userSub },
  });

  res.json({ url: session.url });
});

// POST /api/billing/create-portal-session
router.post('/create-portal-session', requireAuth, async (req, res) => {
  const userSub = req.auth.sub;
  const appUrl = process.env.ALLOWED_ORIGIN || 'https://0xkudo.com';

  const customers = await getStripe().customers.search({
    query: `metadata['auth0_sub']:'${userSub}'`,
  });

  if (!customers.data.length) {
    return res.status(404).json({ error: 'No billing account found for this user.' });
  }

  const session = await getStripe().billingPortal.sessions.create({
    customer: customers.data[0].id,
    return_url: `${appUrl}/siem`,
  });

  res.json({ url: session.url });
});

async function handleWebhookEvent(event) {
  const { type, data } = event;
  const obj = data.object;
  console.log('[billing/webhook] event:', type);

  if (type === 'checkout.session.completed') {
    const userSub = obj.client_reference_id;
    console.log('[billing/webhook] checkout completed, userSub:', userSub, 'customer:', obj.customer);
    if (userSub && obj.customer) {
      await getStripe().customers.update(obj.customer, {
        metadata: { auth0_sub: userSub },
      });
      console.log('[billing/webhook] customer metadata updated');
    }
    return;
  }

  if (type === 'customer.subscription.created' || type === 'customer.subscription.updated') {
    const status = obj.status;
    console.log('[billing/webhook] subscription event, status:', status, 'customer:', obj.customer);
    const customer = await getStripe().customers.retrieve(obj.customer);
    const userSub = customer.metadata?.auth0_sub;
    console.log('[billing/webhook] resolved userSub:', userSub);
    if (!userSub) return;

    if (status === 'active' || status === 'trialing') {
      await assignPaidRole(userSub);
      console.log('[billing/webhook] paid role assigned to:', userSub);
    } else if (status === 'canceled' || status === 'past_due' || status === 'unpaid') {
      await removePaidRole(userSub);
      console.log('[billing/webhook] paid role removed from:', userSub);
    }
    return;
  }

  if (type === 'customer.subscription.deleted') {
    const customer = await getStripe().customers.retrieve(obj.customer);
    const userSub = customer.metadata?.auth0_sub;
    if (!userSub) return;
    await removePaidRole(userSub);
    console.log('[billing/webhook] paid role removed (deleted) from:', userSub);
  }
}

export async function webhookHandler(req, res) {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = getStripe().webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[billing/webhook] signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  try {
    await handleWebhookEvent(event);
  } catch (err) {
    console.error('[billing/webhook] handler error:', err.message, err.stack);
    return res.status(200).json({ received: true, error: err.message });
  }
  res.json({ received: true });
}

export default router;
