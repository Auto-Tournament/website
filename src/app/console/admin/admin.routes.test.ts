import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setDb } from '@/lib/db/client';
import { testDb } from '@/lib/db/testing';
import { adminNotes, leads, licenses, manualOrders, organizations, users } from '@/lib/db/schema';
import type { ConsoleUser } from '@/lib/console/orgs';
import { toRow } from '@/lib/license/store';

// Every admin page, route and server action must answer a non-admin the same
// way: 404 (pages, routes) or "Not found." (actions), before doing anything.
// This walks the admin folder, so a new page or action is covered by default.

const state: { user: ConsoleUser | null; fetchSite: string } = { user: null, fetchSite: 'same-origin' };

vi.mock('@/lib/console/session', () => ({
  currentUser: async () => state.user,
  requireUser: async () => state.user,
}));
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'sec-fetch-site': state.fetchSite, host: 'localhost:4611' }),
  cookies: async () => ({ get: () => undefined, set: () => {} }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
// Auth.js itself isn't loaded here (the session is mocked above); the console's on/off switch is.
vi.mock('@/lib/console/auth', () => ({
  consoleEnabled: () => (process.env.AUTH_SECRET?.length ?? 0) >= 32 && Boolean(process.env.DATABASE_URL),
}));
vi.mock('@/lib/vat/rate', () => ({
  eurNokRate: async () => ({ rate: 11, fallback: false }),
  eurNokDailyRates: async () => null,
}));

const here = path.dirname(fileURLToPath(import.meta.url));

function files(dir: string, name: RegExp): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? files(p, name) : name.test(e.name) ? [p] : [];
  });
}

const pages = files(here, /^(page|layout)\.tsx$/);
const routes = files(here, /^route\.ts$/);

const is404 = (err: unknown) => typeof (err as { digest?: unknown })?.digest === 'string' && (err as { digest: string }).digest.startsWith('NEXT_HTTP_ERROR_FALLBACK;404');

let t: Awaited<ReturnType<typeof testDb>>;
let adminRow: typeof users.$inferSelect;
let memberRow: typeof users.$inferSelect;
const ids: Record<string, string> = { licenses: 'L-route123' };
const asUser = (row: typeof users.$inferSelect, over: Partial<ConsoleUser> = {}): ConsoleUser => ({
  id: row.id,
  email: row.email,
  emailVerified: row.emailVerified,
  name: row.name,
  isAdmin: row.isAdmin,
  ...over,
});

beforeAll(async () => {
  t = await testDb();
  setDb(t.db);
  [adminRow] = await t.db.insert(users).values({ email: 'sivert@example.com', emailVerified: new Date(), isAdmin: true }).returning();
  [memberRow] = await t.db.insert(users).values({ email: 'member@example.com', emailVerified: new Date() }).returning();
  await t.db.insert(licenses).values(
    toRow({
      session_id: 'cs_live_route1',
      invoice_number: null,
      email_sha256: null,
      livemode: true,
      dates_from_form: false,
      token: 'ATL1.x.y',
      payload: { v: 1, kid: 'k', id: 'L-route123', customer: 'cus_X', product: 'servers', pack: 'M', max_servers: 20, kind: 'year', issued_at: '2026-09-01T00:00:00Z', updates_until: '2027-09-01' },
    }),
  );
  const [org] = await t.db.insert(organizations).values({ name: 'Route Org' }).returning();
  const [lead] = await t.db.insert(leads).values({ name: 'Lead', email: 'lead@example.com', topic: 'free-lan', message: 'Hi' }).returning();
  const [order] = await t.db
    .insert(manualOrders)
    .values({ status: 'unpaid', licensee: 'Unpaid AS', product: 'servers', pack: 'M', maxServers: 20, kind: 'year', amountTotal: 100, currency: 'eur' })
    .returning();
  Object.assign(ids, { orgs: org.id, leads: lead.id, orders: order.id });
}, 60_000);
afterAll(async () => {
  setDb(null);
  await t.close();
});
beforeEach(() => {
  vi.stubEnv('AUTH_SECRET', 'x'.repeat(40));
  vi.stubEnv('DATABASE_URL', 'postgres://test/unused');
  vi.stubEnv('AUTH_URL', 'http://localhost:4611');
  vi.stubEnv('ADMIN_EMAILS', 'sivert@example.com');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  state.fetchSite = 'same-origin';
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const nonAdmins: [string, () => ConsoleUser | null][] = [
  ['signed out', () => null],
  ['a signed-in customer', () => asUser(memberRow)],
  ['is_admin, but the email left ADMIN_EMAILS', () => asUser(adminRow, { email: 'former@example.com' })],
  ['is_admin, but the email is not verified', () => asUser(adminRow, { emailVerified: null })],
];

const props = { params: Promise.resolve({ id: 'L-route123' }), searchParams: Promise.resolve({}), children: null };

describe('admin area: non-admins get 404', () => {
  it('finds the pages, routes and actions it checks', () => {
    expect(pages.length).toBeGreaterThanOrEqual(12);
    expect(routes.length).toBeGreaterThanOrEqual(1);
  });

  for (const [who, user] of nonAdmins) {
    describe(who, () => {
      beforeEach(() => {
        state.user = user();
      });

      it('every page and layout', async () => {
        for (const file of pages) {
          const mod = (await import(file)) as { default: (p: typeof props) => Promise<unknown> };
          const err = await mod.default(props).then(
            () => null,
            (e: unknown) => e,
          );
          expect(is404(err), path.relative(here, file)).toBe(true);
        }
      });

      it('every route', async () => {
        for (const file of routes) {
          const mod = (await import(file)) as Record<string, (r: Request) => Promise<Response>>;
          for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].filter((m) => typeof mod[m] === 'function')) {
            const res = await mod[method](new Request('http://localhost:4611/console/admin/export/sales', { method }));
            expect(res.status, `${method} ${path.relative(here, file)}`).toBe(404);
          }
        }
      });

      it('every server action, before touching anything', async () => {
        const actions = (await import('./actions')) as Record<string, unknown>;
        const names = Object.keys(actions).filter((k) => typeof actions[k] === 'function');
        expect(names.length).toBeGreaterThanOrEqual(10);
        const notesBefore = (await t.db.select().from(adminNotes)).length;
        for (const name of names) {
          const fd = new FormData();
          fd.set('licenseId', 'L-route123');
          fd.set('body', 'should not be written');
          fd.set('reason', 'refunded');
          const result = await (actions[name] as (p: null, f: FormData) => Promise<unknown>)(null, fd);
          expect(result, name).toEqual({ error: 'Not found.' });
        }
        expect((await t.db.select().from(adminNotes)).length).toBe(notesBefore);
        const [row] = await t.db.select().from(licenses);
        expect(row.revokedAt).toBeNull();
      });
    });
  }
});

describe('admin area: the admin', () => {
  beforeEach(() => {
    state.user = asUser(adminRow);
  });

  it('sees the pages', async () => {
    for (const file of pages) {
      const mod = (await import(file)) as { default: (p: typeof props) => Promise<unknown> };
      // A detail page gets the id of a record of its own kind.
      const section = path.relative(here, file).split(path.sep)[0];
      const id = ids[section] ?? 'unused';
      await expect(mod.default({ ...props, params: Promise.resolve({ id }) }), path.relative(here, file)).resolves.toBeTruthy();
    }
  });

  it('can write, only same-origin', async () => {
    const { addLicenseNoteAction } = await import('./actions');
    const fd = new FormData();
    fd.set('licenseId', 'L-route123');
    fd.set('body', 'Checked by phone.');
    state.fetchSite = 'cross-site';
    expect(await addLicenseNoteAction(null, fd)).toEqual({ error: 'Forbidden.' });
    state.fetchSite = 'same-origin';
    expect(await addLicenseNoteAction(null, fd)).toEqual({ ok: 'Note added.' });
    expect((await t.db.select().from(adminNotes)).map((n) => [n.body, n.authorUserId])).toEqual([['Checked by phone.', adminRow.id]]);
  });

  it('downloads the sales CSV', async () => {
    const { GET } = await import('./export/sales/route');
    const res = await GET(new Request('http://localhost:4611/console/admin/export/sales?from=2026-01-01&to=2026-12-31'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/csv/);
    expect(await res.text()).toMatch(/^date,license_id,licensee,country,amount,currency,amount_nok,payment_ref,eur_nok_rate\r\n2026-09-01,L-route123,/);
  });
});
