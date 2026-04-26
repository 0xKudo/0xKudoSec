import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../index.js';

vi.mock('../services/auth0Mgmt.js', () => ({
  assignPaidRole: vi.fn().mockResolvedValue(undefined),
  removePaidRole: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('stripe', () => {
  const instance = {
    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/test' }),
      },
    },
    billingPortal: {
      sessions: {
        create: vi.fn().mockResolvedValue({ url: 'https://billing.stripe.com/test' }),
      },
    },
    customers: {
      search: vi.fn().mockResolvedValue({ data: [{ id: 'cus_test123', metadata: { auth0_sub: 'test|user123' } }] }),
      retrieve: vi.fn().mockResolvedValue({ metadata: { auth0_sub: 'test|user123' } }),
      update: vi.fn().mockResolvedValue({}),
    },
    webhooks: {
      constructEvent: vi.fn(),
    },
  };
  return { default: vi.fn(() => instance) };
});

describe('POST /api/billing/create-checkout-session', () => {
  it('returns a checkout URL for monthly plan', async () => {
    process.env.STRIPE_PRICE_MONTHLY = 'price_monthly_test';
    const app = await createApp();
    const res = await request(app)
      .post('/api/billing/create-checkout-session')
      .send({ plan: 'monthly' });
    expect(res.status).toBe(200);
    expect(res.body.url).toContain('stripe.com');
  });

  it('returns a checkout URL for yearly plan', async () => {
    process.env.STRIPE_PRICE_YEARLY = 'price_yearly_test';
    const app = await createApp();
    const res = await request(app)
      .post('/api/billing/create-checkout-session')
      .send({ plan: 'yearly' });
    expect(res.status).toBe(200);
    expect(res.body.url).toContain('stripe.com');
  });

  it('returns 400 for invalid plan', async () => {
    const app = await createApp();
    const res = await request(app)
      .post('/api/billing/create-checkout-session')
      .send({ plan: 'invalid' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/billing/create-portal-session', () => {
  it('returns a portal URL when customer exists', async () => {
    const app = await createApp();
    const res = await request(app)
      .post('/api/billing/create-portal-session');
    expect(res.status).toBe(200);
    expect(res.body.url).toContain('stripe.com');
  });
});
