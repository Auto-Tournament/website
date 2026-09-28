import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '../db/testing';
import { accounts, sessions, verificationTokens } from '../db/schema';
import { consoleAdapter } from './adapter';

let t: Awaited<ReturnType<typeof testDb>>;
beforeEach(async () => {
  t = await testDb();
});
afterEach(async () => {
  await t.close();
});

describe('Auth.js adapter', () => {
  it('stores sessions as a hash of the cookie value', async () => {
    const adapter = consoleAdapter(t.db);
    const user = await adapter.createUser!({ id: 'ignored', email: 'a@x.example', emailVerified: null });
    const expires = new Date(Date.now() + 60_000);
    const created = await adapter.createSession!({ sessionToken: 'cookie-value', userId: user.id, expires });
    expect(created.sessionToken).toBe('cookie-value');
    const [row] = await t.db.select().from(sessions);
    expect(row.sessionToken).toBe(createHash('sha256').update('cookie-value').digest('hex'));
    expect((await adapter.getSessionAndUser!('cookie-value'))?.user.email).toBe('a@x.example');
    expect(await adapter.getSessionAndUser!(row.sessionToken)).toBeNull();
    await adapter.deleteSession!('cookie-value');
    expect(await t.db.select().from(sessions)).toEqual([]);
  });

  it("doesn't keep Google's tokens", async () => {
    const adapter = consoleAdapter(t.db);
    const user = await adapter.createUser!({ id: 'x', email: 'a@x.example', emailVerified: null });
    await adapter.linkAccount!({ userId: user.id, type: 'oidc', provider: 'google', providerAccountId: '123', access_token: 'secret-access', id_token: 'secret-id', refresh_token: 'secret-refresh' });
    const rows = await t.db.select().from(accounts);
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain('secret');
    expect((await adapter.getUserByAccount!({ provider: 'google', providerAccountId: '123' }))?.id).toBe(user.id);
  });

  it('uses a sign-in token once, found by the token alone', async () => {
    const adapter = consoleAdapter(t.db);
    await adapter.createVerificationToken!({ identifier: 'a@x.example', token: 'hashed', expires: new Date(Date.now() + 60_000) });
    expect((await adapter.useVerificationToken!({ identifier: undefined as unknown as string, token: 'hashed' }))?.identifier).toBe('a@x.example');
    expect(await adapter.useVerificationToken!({ identifier: 'a@x.example', token: 'hashed' })).toBeNull();
    expect(await t.db.select().from(verificationTokens)).toEqual([]);
  });
});
