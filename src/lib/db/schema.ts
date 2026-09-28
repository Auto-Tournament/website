/**
 * The console's Postgres schema (Drizzle). Migrations are generated from this
 * file with `yarn db:generate` into ./drizzle and run at startup
 * (src/lib/db/startup.ts).
 *
 * users, accounts, sessions and verification_tokens are the Auth.js tables
 * (@auth/drizzle-adapter): the property names are the adapter's, the column
 * names are ours. Relative imports only: drizzle-kit reads this file too.
 */
import { sql } from 'drizzle-orm';
import { bigserial, boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { LicensePayload } from '../license/format';

const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const users = pgTable('users', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  /** Lowercase. Auth.js normalizes email-link addresses and Google's. */
  email: text('email').unique(),
  /** Set when the email was proven: an email link was used, or Google said email_verified. */
  emailVerified: at('email_verified'),
  image: text('image'),
  /** Auto Tournament staff: the admin CRM builds on this. Set by hand in the database for now. */
  isAdmin: boolean('is_admin').notNull().default(false),
  createdAt: at('created_at').notNull().defaultNow(),
});

/** Sign-in methods linked to a user (Google). OAuth tokens are not kept (see src/lib/console/adapter.ts). */
export const accounts = pgTable(
  'accounts',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] }), index('accounts_user_idx').on(t.userId)],
);

/** Database sessions. `sessionToken` holds a SHA-256 of the cookie value, never the value (src/lib/console/adapter.ts). */
export const sessions = pgTable(
  'sessions',
  {
    sessionToken: text('session_token_hash').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expires: at('expires').notNull(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

/** Email sign-in links. Auth.js stores a hash of the token (with AUTH_SECRET), single use. */
export const verificationTokens = pgTable(
  'verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token_hash').notNull().unique(),
    expires: at('expires').notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  orgNumber: text('org_number'),
  vatId: text('vat_id'),
  /** ISO 3166-1 alpha-2. */
  country: text('country'),
  addressLine1: text('address_line1'),
  addressLine2: text('address_line2'),
  postalCode: text('postal_code'),
  city: text('city'),
  /** Set from the first license with a Stripe customer that is added to the org. */
  stripeCustomerId: text('stripe_customer_id'),
  createdAt: at('created_at').notNull().defaultNow(),
});

export const ROLES = ['owner', 'admin', 'member'] as const;
export type Role = (typeof ROLES)[number];

export const memberships = pgTable(
  'memberships',
  {
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').$type<Role>().notNull(),
    createdAt: at('created_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.userId] }), index('memberships_user_idx').on(t.userId)],
);

/** Invitations to an organization. The link's token is kept as a SHA-256 only. Single use, 7 days. */
export const invites = pgTable(
  'invites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /** Lowercase. */
    email: text('email').notNull(),
    role: text('role').$type<Role>().notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    invitedBy: text('invited_by').references(() => users.id, { onDelete: 'set null' }),
    expiresAt: at('expires_at').notNull(),
    acceptedAt: at('accepted_at'),
    acceptedBy: text('accepted_by').references(() => users.id, { onDelete: 'set null' }),
    revokedAt: at('revoked_at'),
    createdAt: at('created_at').notNull().defaultNow(),
  },
  (t) => [index('invites_org_idx').on(t.orgId), index('invites_email_idx').on(t.email)],
);

/**
 * Issued license keys, one per Stripe Checkout Session (was licenses.json).
 * The buyer's email is kept only as a SHA-256 (email_hash), never in plain.
 */
export const licenses = pgTable(
  'licenses',
  {
    sessionId: text('session_id').primaryKey(),
    licenseId: text('license_id').notNull().unique(),
    invoiceNumber: text('invoice_number'),
    emailHash: text('email_hash'),
    livemode: boolean('livemode').notNull(),
    datesFromForm: boolean('dates_from_form').notNull(),
    /** Copied out of the payload for queries (the founder cap). */
    kind: text('kind').notNull(),
    issuedAt: at('issued_at').notNull(),
    payload: jsonb('payload').$type<LicensePayload>().notNull(),
    token: text('token').notNull(),
    emailedAt: at('emailed_at'),
    emailError: text('email_error'),
    /** A send in progress (claimed); a claim older than 5 minutes is treated as abandoned. */
    emailClaimedAt: at('email_claimed_at'),
    orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'set null' }),
    createdAt: at('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('licenses_email_hash_idx').on(t.emailHash),
    index('licenses_org_idx').on(t.orgId),
    index('licenses_invoice_number_idx').on(sql`upper(${t.invoiceNumber})`),
  ],
);

/** Every write in the console, and sign-ins. `details` never holds tokens. */
export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    /** The user who did it; null for the system (checkout webhook, import). Not a foreign key, so the log outlives the user. */
    actorUserId: text('actor_user_id'),
    action: text('action').notNull(),
    orgId: uuid('org_id'),
    targetType: text('target_type'),
    targetId: text('target_id'),
    at: at('at').notNull().defaultNow(),
    details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [index('audit_org_idx').on(t.orgId, t.at), index('audit_actor_idx').on(t.actorUserId, t.at)],
);
