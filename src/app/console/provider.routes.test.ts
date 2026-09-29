import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setDb } from '@/lib/db/client';
import { testDb } from '@/lib/db/testing';
import { users } from '@/lib/db/schema';
import { acceptInvite, createInvite, createOrg, type ConsoleUser } from '@/lib/console/orgs';

// A server provider sees the organization's licenses and keys, nothing else:
// every other organization page sends them to Licenses, and every other
// organization action refuses, on the server.

const state: { user: ConsoleUser | null; org: string | null } = { user: null, org: null };

vi.mock('@/lib/console/auth', () => ({
  consoleEnabled: () => true,
  googleEnabled: () => false,
  auth: async () => (state.user ? { user: { ...state.user, emailVerified: state.user.emailVerified?.toISOString() } } : null),
  signIn: async () => {},
  signOut: async () => {},
}));
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'sec-fetch-site': 'same-origin', host: 'localhost:4611' }),
  cookies: async () => ({ get: () => (state.org ? { value: state.org } : undefined), set: () => {} }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next-auth', () => ({ AuthError: class AuthError extends Error {} }));

const redirectTo = (err: unknown): string | null => {
  const digest = (err as { digest?: unknown })?.digest;
  return typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT') ? digest.split(';')[2] : null;
};

let t: Awaited<ReturnType<typeof testDb>>;
let owner: ConsoleUser;
let provider: ConsoleUser;
let orgId: string;

const asUser = (row: typeof users.$inferSelect): ConsoleUser => ({ id: row.id, email: row.email, emailVerified: row.emailVerified, name: row.name, isAdmin: row.isAdmin });

beforeAll(async () => {
  t = await testDb();
  setDb(t.db);
  const [o] = await t.db.insert(users).values({ email: 'owner@example.com', emailVerified: new Date() }).returning();
  const [p] = await t.db.insert(users).values({ email: 'host@example.com', emailVerified: new Date() }).returning();
  owner = asUser(o);
  provider = asUser(p);
  orgId = await createOrg(t.db, owner, { name: 'Org', orgNumber: null, vatId: null, country: 'NO', addressLine1: null, addressLine2: null, postalCode: null, city: null });
  const { token } = await createInvite(t.db, owner, orgId, 'host@example.com', 'provider');
  await acceptInvite(t.db, provider, { token });
}, 60_000);
afterAll(async () => {
  setDb(null);
  await t.close();
});
beforeEach(() => {
  vi.stubEnv('AUTH_SECRET', 'x'.repeat(40));
  vi.stubEnv('DATABASE_URL', 'postgres://test/unused');
  vi.stubEnv('AUTH_URL', 'http://localhost:4611');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  state.user = provider;
  state.org = orgId;
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const props = { searchParams: Promise.resolve({}), params: Promise.resolve({}) };

describe('server provider', () => {
  const pages: [string, () => Promise<unknown>][] = [
    ['Team', () => import('./(org)/members/page')],
    ['Billing', () => import('./(org)/billing/page')],
    ['Buy', () => import('./buy/page')],
  ];
  for (const [name, load] of pages) {
    it(`is sent from ${name} to Licenses`, async () => {
      const mod = (await load()) as { default: (p: typeof props) => Promise<unknown> };
      const err = await mod.default(props).then(
        () => null,
        (e: unknown) => e,
      );
      expect(redirectTo(err)).toMatch(/\/licenses$/);
    });
  }

  it('the owner still opens those pages', async () => {
    state.user = owner;
    const mod = (await import('./(org)/members/page')) as { default: () => Promise<unknown> };
    await expect(mod.default()).resolves.toBeTruthy();
  });

  it('every organization action but leaving refuses', async () => {
    const actions = await import('./actions');
    const fd = (fields: Record<string, string>) => {
      const f = new FormData();
      for (const [k, v] of Object.entries(fields)) f.set(k, v);
      return f;
    };
    const refused = [
      await actions.billingPortalAction(null, fd({ orgId })),
      await actions.inviteAction(null, fd({ orgId, email: 'friend@example.com', role: 'member' })),
      await actions.inviteAction(null, fd({ orgId, email: 'friend@example.com', role: 'provider' })),
      await actions.updateOrgAction(null, fd({ orgId, name: 'Hacked' })),
      await actions.changeRoleAction(null, fd({ orgId, userId: provider.id, role: 'owner' })),
      await actions.removeMemberAction(null, fd({ orgId, userId: owner.id })),
      await actions.claimLicenseAction(null, fd({ orgId, sessionId: 'cs_x' })),
    ];
    for (const r of refused) expect(r?.error).toBeTruthy();
    expect(Object.keys(actions)).not.toContain('createOrgAction');
  });

  it('buys nothing for the organization: checkout treats them as a guest', async () => {
    const { consoleCheckoutPrefill } = await import('@/lib/console/checkout');
    expect(await consoleCheckoutPrefill()).toBeNull();
    state.user = owner;
    expect(await consoleCheckoutPrefill()).toMatchObject({ orgId });
  });
});
