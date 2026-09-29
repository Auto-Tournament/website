import { and, asc, eq, inArray, isNotNull, isNull, like, or, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { licenses, memberships, organizations, orgPendingOwners, users } from '../db/schema';
import { emailHash } from '../license/format';
import { fromRow } from '../license/store';
import { audit, type Tx } from './audit';
import { isCountryCode } from './countries';
import { adoptStripeCustomer, isUuid, listOrgs, stripeCustomerOf, verifiedEmail, type ConsoleUser, type OrgInput, type OrgSummary } from './orgs';

/**
 * The organization a card purchase belongs to, worked out when its license is
 * issued (the webhook and the thanks page, src/lib/license/issue.ts) and once
 * for older licenses at startup (backfillCheckoutOrgs). The buyer then signs
 * in and finds their licenses, without a "create your organization" step.
 *
 * 1. Bought from the console for a chosen organization (metadata org_id): that one.
 * 2. The organization whose Stripe customer paid.
 * 3. An organization with the same VAT id / organization number that the buyer
 *    already belongs to (a member with that verified email, or its pending
 *    owner). A VAT id is public, so a match alone never lets a buyer into an
 *    organization: someone else's number gives the buyer a new organization.
 * 4. Otherwise a new one, from the details entered at checkout (the company
 *    name, never the event/client field). Its owner is the buyer: at once when
 *    a console user with that verified email exists, else a pending owner kept
 *    as the email's SHA-256 until they sign in (claimPendingOwnership).
 *
 * Idempotent: the license row is locked, and licenses.org_resolved_at marks
 * it done, so a redelivered webhook, the thanks page and the backfill never
 * create a second organization or membership.
 *
 * Relative imports on purpose: the tests run these against PGlite.
 */

/** The Checkout Session fields used here (a Stripe.Checkout.Session fits), so tests can build one by hand. */
export type CheckoutSessionLike = {
  id: string;
  metadata?: Record<string, string> | null;
  customer_details: {
    email: string | null;
    business_name?: string | null;
    name?: string | null;
    address?: {
      line1?: string | null;
      line2?: string | null;
      postal_code?: string | null;
      city?: string | null;
      country?: string | null;
    } | null;
    tax_ids?: { type: string; value: string | null }[] | null;
  } | null;
  collected_information?: { business_name?: string | null } | null;
};

export type CheckoutCompany = OrgInput & {
  /** Lowercase; used to find the buyer's account, never stored. */
  email: string | null;
  /** Normalized VAT ids and organization numbers to look for (see normalizeTaxId). */
  matchKeys: string[];
};

const line = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
  return s ? s.slice(0, max) : null;
};

/** Upper case, letters and digits only: "no 123 456 789 mva" and "NO123456789MVA" compare equal. */
export function normalizeTaxId(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** The organization details a Checkout Session carries: company name, tax id, country and billing address. Pure. */
export function checkoutCompany(session: CheckoutSessionLike): CheckoutCompany {
  const details = session.customer_details;
  const email = details?.email?.trim().toLowerCase() || null;
  // Stripe's business name field (required at checkout). Never the event/client custom field.
  const name = line(session.collected_information?.business_name, 120) ?? line(details?.business_name, 120) ?? line(details?.name, 120) ?? 'My organization';
  const tax = details?.tax_ids?.find((t) => typeof t.value === 'string' && t.value.trim()) ?? null;
  const vatId = tax ? line(tax.value, 40) : null;
  const keys = new Set<string>();
  let orgNumber: string | null = null;
  if (tax && vatId) {
    const norm = normalizeTaxId(vatId);
    if (norm.length >= 5) keys.add(norm);
    // A Norwegian VAT id is the organization number with MVA after it (and NO before, in the EU form).
    const norwegian = /^(?:NO)?(\d{9})(?:MVA)?$/.exec(norm);
    const digits = norwegian && (tax.type === 'no_vat' || norm !== norwegian[1]) ? norwegian[1] : null;
    if (digits) {
      orgNumber = digits;
      keys.add(digits);
      keys.add(`NO${digits}MVA`);
      keys.add(`${digits}MVA`);
    }
  }
  const address = details?.address ?? null;
  const country = line(address?.country, 2)?.toUpperCase() ?? null;
  return {
    name,
    orgNumber,
    vatId,
    country: country && isCountryCode(country) ? country : null,
    addressLine1: line(address?.line1, 200),
    addressLine2: line(address?.line2, 200),
    postalCode: line(address?.postal_code, 20),
    city: line(address?.city, 100),
    email,
    matchKeys: [...keys],
  };
}

const normalized = (column: typeof organizations.vatId | typeof organizations.orgNumber) =>
  sql`upper(regexp_replace(coalesce(${column}, ''), '[^A-Za-z0-9]', '', 'g'))`;

export type CheckoutOrgOutcome =
  /** Already done earlier (or bought from the console into an organization at issue). */
  | 'done'
  /** No organization: not a card license, no buyer email, revoked or replaced, or (backfill) the buyer already has organizations. */
  | 'none'
  | 'console'
  | 'customer'
  | 'vat'
  | 'created';

/**
 * Puts the license of this Checkout Session into its organization (see the
 * top of the file). Only for a license already issued for the session, whose
 * email hash matches the session's email. `backfill`: for older licenses, a
 * buyer who already belongs to an organization keeps adding them by hand
 * ("Licenses bought with your email"), rather than getting another one.
 */
export async function assignCheckoutOrg(
  db: Db,
  session: CheckoutSessionLike,
  stripeLivemode: boolean,
  options: { now?: Date; backfill?: boolean } = {},
): Promise<{ outcome: CheckoutOrgOutcome; orgId: string | null }> {
  const now = options.now ?? new Date();
  const company = checkoutCompany(session);
  return db.transaction(async (tx) => {
    // The row lock serializes the webhook, the thanks page and the backfill for this license.
    const [row] = await tx.select().from(licenses).where(eq(licenses.sessionId, session.id)).for('update').limit(1);
    if (!row) return { outcome: 'none' as const, orgId: null };
    if (row.orgId || row.orgResolvedAt) return { outcome: 'done' as const, orgId: row.orgId };

    const record = fromRow(row);
    const finish = async (orgId: string | null, outcome: CheckoutOrgOutcome) => {
      await tx.update(licenses).set({ orgId, orgResolvedAt: now }).where(eq(licenses.sessionId, session.id));
      if (orgId) {
        await audit(tx, { actor: null, action: 'license.issue', orgId, targetType: 'license', targetId: record.payload.id, details: { via: 'checkout', session: session.id, match: outcome } });
        await adoptStripeCustomer(tx, orgId, record, stripeLivemode, null);
      }
      return { outcome, orgId };
    };

    const email = company.email;
    const hash = email ? emailHash(email) : null;
    if (row.source !== 'stripe' || row.revokedAt || row.supersededBy || !hash || row.emailHash !== hash) return finish(null, 'none');

    // 1. From the console, for an organization the buyer chose (membership was checked when checkout started).
    const chosen = session.metadata?.org_id;
    if (isUuid(chosen)) {
      const [org] = await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, chosen)).limit(1);
      if (org) return finish(org.id, 'console');
    }

    // 2. The organization whose Stripe customer paid (a customer only the console hands to checkout).
    const customer = stripeCustomerOf(record);
    if (customer && record.livemode === stripeLivemode) {
      const [org] = await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.stripeCustomerId, customer)).orderBy(asc(organizations.createdAt)).limit(1);
      if (org) return finish(org.id, 'customer');
    }

    const [buyer] = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, email!), isNotNull(users.emailVerified)))
      .limit(1);

    // 3. Same VAT id / organization number, and the buyer is already in it (or its pending owner).
    if (company.matchKeys.length > 0) {
      const linked = or(
        sql`exists (select 1 from ${orgPendingOwners} where ${orgPendingOwners.orgId} = ${organizations.id} and ${orgPendingOwners.emailHash} = ${hash})`,
        buyer ? sql`exists (select 1 from ${memberships} where ${memberships.orgId} = ${organizations.id} and ${memberships.userId} = ${buyer.id})` : sql`false`,
      );
      const [org] = await tx
        .select({ id: organizations.id })
        .from(organizations)
        .where(and(or(inArray(normalized(organizations.vatId), company.matchKeys), inArray(normalized(organizations.orgNumber), company.matchKeys)), linked))
        .orderBy(asc(organizations.createdAt))
        .limit(1);
      if (org) return finish(org.id, 'vat');
    }

    if (options.backfill && buyer) {
      const [member] = await tx.select({ orgId: memberships.orgId }).from(memberships).where(eq(memberships.userId, buyer.id)).limit(1);
      if (member) return finish(null, 'none');
    }

    // 4. A new organization from the checkout details.
    const { email: _email, matchKeys: _keys, ...input } = company;
    const [org] = await tx.insert(organizations).values(input).returning({ id: organizations.id });
    await audit(tx, { actor: null, action: 'org.create', orgId: org.id, targetType: 'organization', targetId: org.id, details: { via: 'checkout', session: session.id, name: input.name } });
    await makeOwner(tx, org.id, buyer?.id ?? null, hash, session.id);
    return finish(org.id, 'created');
  });
}

/** The buyer becomes the owner: now, when they have a verified account, else once they sign in with that address. */
async function makeOwner(tx: Tx, orgId: string, buyerId: string | null, hash: string, sessionId: string): Promise<void> {
  if (buyerId) {
    await tx.insert(memberships).values({ orgId, userId: buyerId, role: 'owner' }).onConflictDoUpdate({ target: [memberships.orgId, memberships.userId], set: { role: 'owner', expiresAt: null } });
    await audit(tx, { actor: null, action: 'member.owner_from_checkout', orgId, targetType: 'user', targetId: buyerId, details: { session: sessionId } });
    return;
  }
  await tx.insert(orgPendingOwners).values({ orgId, emailHash: hash, sessionId }).onConflictDoNothing();
  await audit(tx, { actor: null, action: 'org.pending_owner', orgId, targetType: 'organization', targetId: orgId, details: { session: sessionId } });
}

/**
 * At sign-in: every organization waiting for this user's verified email
 * (created from their checkout) gets them as an owner. Idempotent: each
 * pending row is deleted as it is used. Returns the organization ids.
 * Nothing for an unverified address.
 */
export async function claimPendingOwnership(db: Db, userId: string): Promise<string[]> {
  const [user] = await db.select({ email: users.email, emailVerified: users.emailVerified }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user?.email || !user.emailVerified) return [];
  const hash = emailHash(user.email);
  const [any] = await db.select({ orgId: orgPendingOwners.orgId }).from(orgPendingOwners).where(eq(orgPendingOwners.emailHash, hash)).limit(1);
  if (!any) return [];
  return db.transaction(async (tx) => {
    const claimed = await tx.delete(orgPendingOwners).where(eq(orgPendingOwners.emailHash, hash)).returning();
    for (const p of claimed) {
      await tx.insert(memberships).values({ orgId: p.orgId, userId, role: 'owner' }).onConflictDoUpdate({ target: [memberships.orgId, memberships.userId], set: { role: 'owner', expiresAt: null } });
      await audit(tx, { actor: userId, action: 'member.owner_from_checkout', orgId: p.orgId, targetType: 'user', targetId: userId, details: { session: p.sessionId } });
    }
    return claimed.map((p) => p.orgId);
  });
}

/** The user's organizations, after taking up any pending ownership when they have none yet (a fallback for the sign-in event). */
export async function orgsWithPendingClaimed(db: Db, user: ConsoleUser): Promise<OrgSummary[]> {
  const orgs = await listOrgs(db, user.id);
  if (orgs.length > 0 || !verifiedEmail(user)) return orgs;
  return (await claimPendingOwnership(db, user.id)).length > 0 ? listOrgs(db, user.id) : orgs;
}

/** Where the console's front door sends a signed-in user. */
export async function consoleHomePath(db: Db, user: ConsoleUser): Promise<'/admin' | '/licenses' | '/welcome'> {
  if (user.isAdmin) return '/admin';
  return (await orgsWithPendingClaimed(db, user)).length > 0 ? '/licenses' : '/welcome';
}

// ---------------------------------------------------------------------------
// Older licenses

export type BackfillResult = { checked: number; assigned: number; skipped: number; failed: number };

/**
 * Once, for card licenses issued before organizations came from checkout:
 * reads each one's Checkout Session from Stripe (Checkout Sessions: Read, as
 * the thanks page) and runs assignCheckoutOrg. Each license is marked done
 * (org_resolved_at) whatever the outcome, so Stripe is asked once per
 * license; only a failed request (network, rate limit) is tried again at the
 * next start. A license from the other Stripe mode can't be read with this
 * key and is marked done without asking.
 */
export async function backfillCheckoutOrgs(
  db: Db,
  deps: { retrieve: (sessionId: string) => Promise<CheckoutSessionLike>; stripeLivemode: boolean; limit?: number; now?: Date },
): Promise<BackfillResult> {
  const now = deps.now ?? new Date();
  const rows = await db
    .select({ sessionId: licenses.sessionId, livemode: licenses.livemode })
    .from(licenses)
    .where(
      and(
        isNull(licenses.orgId),
        isNull(licenses.orgResolvedAt),
        eq(licenses.source, 'stripe'),
        like(licenses.sessionId, 'cs\\_%'),
        isNull(licenses.supersededBy),
        isNull(licenses.revokedAt),
      ),
    )
    .orderBy(asc(licenses.issuedAt))
    .limit(deps.limit ?? 500);
  const result: BackfillResult = { checked: rows.length, assigned: 0, skipped: 0, failed: 0 };
  const markDone = (sessionId: string) =>
    db.update(licenses).set({ orgResolvedAt: now }).where(and(eq(licenses.sessionId, sessionId), isNull(licenses.orgId), isNull(licenses.orgResolvedAt)));
  for (const row of rows) {
    if (row.livemode !== deps.stripeLivemode) {
      await markDone(row.sessionId);
      result.skipped++;
      continue;
    }
    let session: CheckoutSessionLike;
    try {
      session = await deps.retrieve(row.sessionId);
    } catch (err) {
      const status = (err as { statusCode?: number } | null)?.statusCode;
      // Gone or not readable with this key: asking again won't help.
      if (status === 400 || status === 404) {
        await markDone(row.sessionId);
        result.skipped++;
      } else {
        result.failed++;
      }
      continue;
    }
    if (session.id !== row.sessionId) {
      await markDone(row.sessionId);
      result.skipped++;
      continue;
    }
    const { orgId } = await assignCheckoutOrg(db, session, deps.stripeLivemode, { now, backfill: true });
    if (orgId) result.assigned++;
    else result.skipped++;
  }
  return result;
}
