import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CheckoutSessionForSignIn } from '@/lib/console/checkoutSignIn';

// "Go to your console" on the thanks page, through the server action, with
// Stripe, the request headers and the Auth.js sign-in mocked (nothing leaves
// the process). The rate limits live for the whole file: each test uses its
// own session ids, IPs and addresses.

const state: {
  headers: Record<string, string>;
  sessions: Record<string, CheckoutSessionForSignIn>;
  retrieved: string[];
  signIns: { provider: string; options: Record<string, unknown> }[];
  signInFails: boolean;
  enabled: boolean;
} = { headers: {}, sessions: {}, retrieved: [], signIns: [], signInFails: false, enabled: true };

vi.mock('next/headers', () => ({
  headers: async () => new Headers(state.headers),
  cookies: async () => ({ get: () => undefined, set: () => {} }),
}));
vi.mock('@/lib/console/auth', () => ({
  consoleEnabled: () => state.enabled,
  emailLinkEnabled: () => true,
  signIn: async (provider: string, options: Record<string, unknown>) => {
    if (state.signInFails) throw new Error('postmark down');
    state.signIns.push({ provider, options });
    return 'https://console.example/signin/check-email';
  },
}));
vi.mock('@/lib/license/issue', () => ({
  stripeServer: () => ({
    checkout: {
      sessions: {
        retrieve: async (id: string) => {
          state.retrieved.push(id);
          const s = state.sessions[id];
          if (!s) throw Object.assign(new Error('No such checkout.session'), { code: 'resource_missing' });
          return s;
        },
      },
    },
  }),
}));

const { sendConsoleLinkAction } = await import('./actions');
const { maskEmail } = await import('@/lib/console/checkoutSignIn');
const { consoleUrl } = await import('@/lib/console/urls');

let n = 0;
/** A fresh session id, IP and buyer address per call, so the file-wide limits don't mix tests. */
function order(over: Partial<CheckoutSessionForSignIn> = {}) {
  n += 1;
  const id = `cs_test_thanksLink${String(n).padStart(4, '0')}`;
  const email = `Buyer${n}@Example.com`;
  state.sessions[id] = { status: 'complete', payment_status: 'paid', customer_details: { email }, ...over };
  state.headers = { 'sec-fetch-site': 'same-origin', host: 'localhost:4611', 'x-forwarded-for': `10.0.0.${n}` };
  return { id, email: email.toLowerCase() };
}

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const send = (fields: Record<string, string>) => sendConsoleLinkAction(null, form(fields));

beforeEach(() => {
  state.retrieved = [];
  state.signIns = [];
  state.signInFails = false;
  state.enabled = true;
});

describe('Go to your console', () => {
  it('sends one sign-in link to the checkout email, to the console home', async () => {
    const { id, email } = order();
    const res = await send({ session_id: id });
    expect(res).toEqual({ ok: true, sentTo: `b•••@example.com` });
    expect(state.retrieved).toEqual([id]);
    expect(state.signIns).toHaveLength(1);
    expect(state.signIns[0].provider).toBe('email');
    expect(state.signIns[0].options).toMatchObject({ email, redirect: false });
    expect(state.signIns[0].options.redirectTo).toBe(consoleUrl('/'));
  });

  it('accepts a free order (no_payment_required)', async () => {
    const { id } = order({ payment_status: 'no_payment_required' });
    expect((await send({ session_id: id }))?.ok).toBe(true);
    expect(state.signIns).toHaveLength(1);
  });

  it('refuses an unpaid or still-open session', async () => {
    const unpaid = order({ payment_status: 'unpaid' });
    const open = order({ status: 'open', payment_status: 'unpaid' });
    const expired = order({ status: 'expired' });
    for (const o of [unpaid, open, expired]) {
      const res = await send({ session_id: o.id });
      expect(res?.ok).toBe(false);
    }
    expect(state.signIns).toHaveLength(0);
  });

  it('refuses an unknown session, and a malformed id without asking Stripe', async () => {
    order();
    expect((await send({ session_id: 'cs_test_doesNotExist0001' }))?.ok).toBe(false);
    expect(state.retrieved).toEqual(['cs_test_doesNotExist0001']);
    expect((await send({ session_id: 'not-a-session' }))?.ok).toBe(false);
    expect((await send({}))?.ok).toBe(false);
    expect(state.retrieved).toHaveLength(1);
    expect(state.signIns).toHaveLength(0);
  });

  it('never lets the client choose the address', async () => {
    const { id, email } = order();
    const res = await send({ session_id: id, email: 'attacker@evil.example', identifier: 'attacker@evil.example' });
    expect(res).toEqual({ ok: true, sentTo: 'b•••@example.com' });
    expect(state.signIns.map((s) => s.options.email)).toEqual([email]);
  });

  it('refuses a session without an email', async () => {
    const { id } = order({ customer_details: { email: null } });
    expect((await send({ session_id: id }))?.ok).toBe(false);
    expect(state.signIns).toHaveLength(0);
  });

  it('refuses cross-site requests', async () => {
    const { id } = order();
    state.headers['sec-fetch-site'] = 'cross-site';
    expect(await send({ session_id: id })).toEqual({ ok: false, error: 'Forbidden.' });
    expect(state.retrieved).toHaveLength(0);
  });

  it('is off when the console is not set up', async () => {
    const { id } = order();
    state.enabled = false;
    expect((await send({ session_id: id }))?.ok).toBe(false);
    expect(state.retrieved).toHaveLength(0);
  });

  it('allows 3 per session in 10 minutes, then refuses without asking Stripe', async () => {
    const { id } = order();
    for (let i = 0; i < 3; i++) {
      state.headers['x-forwarded-for'] = `10.2.0.${i}`;
      expect((await send({ session_id: id }))?.ok).toBe(true);
    }
    state.headers['x-forwarded-for'] = '10.2.0.99';
    const res = await send({ session_id: id });
    expect(res).toMatchObject({ ok: false, error: expect.stringMatching(/Too many/) });
    expect(state.retrieved).toHaveLength(3);
    expect(state.signIns).toHaveLength(3);
  });

  it('limits one IP across sessions', async () => {
    const ip = '10.3.0.1';
    const results = [];
    for (let i = 0; i < 11; i++) {
      const { id } = order();
      state.headers['x-forwarded-for'] = ip;
      results.push((await send({ session_id: id }))?.ok);
    }
    expect(results.slice(0, 10).every(Boolean)).toBe(true);
    expect(results[10]).toBe(false);
  });

  it('gives a generic error when the email cannot be sent, and logs no address', async () => {
    const { id } = order();
    state.signInFails = true;
    const logged: unknown[] = [];
    const spies = (['log', 'info', 'warn', 'error'] as const).map((m) => vi.spyOn(console, m).mockImplementation((...args) => void logged.push(...args)));
    const res = await send({ session_id: id });
    spies.forEach((s) => s.mockRestore());
    expect(res).toMatchObject({ ok: false });
    expect(JSON.stringify(res)).not.toMatch(/buyer|postmark/i);
    expect(JSON.stringify(logged)).not.toMatch(/buyer|example\.com/i);
  });
});

describe('maskEmail', () => {
  it('keeps the first letter and the domain', () => {
    expect(maskEmail('jane@example.com')).toBe('j•••@example.com');
    expect(maskEmail('j@example.com')).toBe('j•••@example.com');
    expect(maskEmail('bad')).toBe('•••');
  });
});
