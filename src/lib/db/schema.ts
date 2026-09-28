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
  /**
   * Auto Tournament staff: the admin CRM (/admin). Kept in step with the
   * ADMIN_EMAILS env at every sign-in and at startup (src/lib/admin/access.ts);
   * never set by hand.
   */
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
export type LicenseSource = 'stripe' | 'manual';
export type RevokeReason = 'refunded' | 'revoked';

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
    /** 'stripe' (card checkout) or 'manual' (bank transfer / invoice, created in the admin CRM). */
    source: text('source').$type<LicenseSource>().notNull().default('stripe'),
    /**
     * The Checkout Session's amount_total, in minor units (cents) of `currency`
     * (EUR). Null on licenses issued before this column existed; the VAT
     * threshold check (src/lib/vat) treats a null amount as 0 — there is no
     * way to recover the historical amount without new Stripe permissions. A
     * free or test purchase is recorded as 0, not null. Manual licenses (bank
     * transfer / invoice, source 'manual') carry what was invoiced, in EUR or
     * NOK; a reissue carries only a difference paid for it, never the original
     * amount again.
     */
    amountTotal: integer('amount_total'),
    /** Lowercase ISO 4217: 'eur' (Stripe, manual) or 'nok' (manual). */
    currency: text('currency'),
    /** When Stripe considers the session paid (falls back to issuedAt when unknown). Used for the VAT rolling window. */
    paidAt: at('paid_at'),
    /** Bank transfer / invoice reference for manual licenses and paid reissues. */
    paymentRef: text('payment_ref'),
    /** The license id this one replaced (a reissue). */
    supersedes: text('supersedes'),
    /** The license id that replaced this one. The old key keeps working offline; /verify says "replaced by". */
    supersededBy: text('superseded_by'),
    /** Marked refunded or revoked (admin CRM, or a full Stripe refund). Never deleted: /verify shows "revoked". */
    revokedAt: at('revoked_at'),
    revokeReason: text('revoke_reason').$type<RevokeReason>(),
    /**
     * The Stripe PaymentIntent that paid the Checkout Session (card licenses
     * issued since refunds were added; learned on the first refund for older
     * ones). The refund webhook (charge.refunded) finds the license by it.
     */
    paymentIntent: text('payment_intent'),
    /**
     * How much of this row's payment was given back, in minor units of
     * `currency` (Stripe refunds, or a manual refund recorded in the admin
     * CRM). Null: none. Kept on the row that holds the payment (the first of a
     * reissue chain). Revenue and the VAT total count amount_total minus this;
     * a full refund also marks the license refunded.
     */
    refundedAmount: integer('refunded_amount'),
    /** The last refund. */
    refundedAt: at('refunded_at'),
    createdAt: at('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('licenses_email_hash_idx').on(t.emailHash),
    index('licenses_org_idx').on(t.orgId),
    index('licenses_invoice_number_idx').on(sql`upper(${t.invoiceNumber})`),
    index('licenses_paid_at_idx').on(t.paidAt),
    index('licenses_payment_intent_idx').on(t.paymentIntent),
  ],
);

/**
 * One row per VAT threshold percentage (70/90/100 of VAT_THRESHOLD_NOK).
 * `active` is set once the rolling 12-month NOK total reaches the threshold
 * (the alert fires then) and cleared once the total drops back below it, so
 * crossing the same line again fires another alert (src/lib/vat/threshold.ts).
 */
export const vatAlerts = pgTable('vat_alerts', {
  percent: integer('percent').primaryKey(),
  active: boolean('active').notNull().default(false),
  /** When this crossing was first detected. */
  firstCrossedAt: at('first_crossed_at'),
  /** The rolling NOK total at the last check, for visibility only. */
  lastTotalNok: integer('last_total_nok'),
  updatedAt: at('updated_at').notNull().defaultNow(),
});

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
  (t) => [index('audit_org_idx').on(t.orgId, t.at), index('audit_actor_idx').on(t.actorUserId, t.at), index('audit_action_idx').on(t.action, t.at)],
);

// ---------------------------------------------------------------------------
// The admin CRM (/admin, src/lib/admin)

export type ManualOrderStatus = 'unpaid' | 'paid' | 'cancelled';

/**
 * A license sold outside Stripe (bank transfer / invoice). Unpaid: no key yet,
 * but a founder order already holds its place under the cap. "Mark paid"
 * issues the key into `licenses` (source 'manual') and sets license_id.
 */
export const manualOrders = pgTable(
  'manual_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    status: text('status').$type<ManualOrderStatus>().notNull(),
    licensee: text('licensee').notNull(),
    orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'set null' }),
    /** SHA-256 of the buyer's lowercased email, like licenses.email_hash. Never the address. */
    emailHash: text('email_hash'),
    product: text('product').notNull(),
    pack: text('pack').notNull(),
    maxServers: integer('max_servers').notNull(),
    kind: text('kind').notNull(),
    /** YYYY-MM-DD. Event: the first day; year: the day updates count from. */
    startDay: text('start_day'),
    /** YYYY-MM-DD. Event: the last day. */
    endDay: text('end_day'),
    amountTotal: integer('amount_total').notNull(),
    currency: text('currency').notNull(),
    paymentRef: text('payment_ref'),
    licenseId: text('license_id'),
    createdBy: text('created_by'),
    createdAt: at('created_at').notNull().defaultNow(),
    paidAt: at('paid_at'),
  },
  (t) => [index('manual_orders_status_idx').on(t.status, t.createdAt)],
);

/** Staff notes on a license or an organization. */
export const adminNotes = pgTable(
  'admin_notes',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    targetType: text('target_type').$type<'license' | 'organization'>().notNull(),
    targetId: text('target_id').notNull(),
    authorUserId: text('author_user_id'),
    body: text('body').notNull(),
    createdAt: at('created_at').notNull().defaultNow(),
  },
  (t) => [index('admin_notes_target_idx').on(t.targetType, t.targetId, t.createdAt)],
);

export const LEAD_STATUSES = ['new', 'replied', 'won', 'lost'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/**
 * /contact submissions, kept next to the email they also send. Deleted 24
 * months after the last activity (updated_at), src/lib/db/prune.ts.
 */
export const leads = pgTable(
  'leads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    organization: text('organization'),
    topic: text('topic').notNull(),
    servers: text('servers'),
    eventDates: text('event_dates'),
    message: text('message').notNull(),
    status: text('status').$type<LeadStatus>().notNull().default('new'),
    note: text('note'),
    createdAt: at('created_at').notNull().defaultNow(),
    /** The last activity: created, or status or note changed. Retention counts from here. */
    updatedAt: at('updated_at').notNull().defaultNow(),
  },
  (t) => [index('leads_status_idx').on(t.status, t.createdAt), index('leads_updated_idx').on(t.updatedAt)],
);

/** The register of free LAN confirmations (non-profit LANs that may use the paid tools for free). */
export const freeLans = pgTable('free_lan_confirmations', {
  id: uuid('id').primaryKey().defaultRandom(),
  event: text('event').notNull(),
  organizer: text('organizer').notNull(),
  dates: text('dates'),
  servers: text('servers'),
  /** YYYY-MM-DD. */
  confirmedOn: text('confirmed_on').notNull(),
  note: text('note'),
  leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
  createdBy: text('created_by'),
  createdAt: at('created_at').notNull().defaultNow(),
});
