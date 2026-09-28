import { createRateLimiter } from '@/lib/checkout';

/** In-memory abuse limits for the console (one container, so memory is enough). */
export const limits = {
  /** Sign-in attempts (email link or Google) per IP. */
  signInIp: createRateLimiter({ limit: 10, windowMs: 10 * 60_000 }),
  /** Sign-in emails per address (by hash). Over it, nothing is sent, but the answer is the same. */
  signInEmail: createRateLimiter({ limit: 3, windowMs: 60 * 60_000 }),
  /** Invites sent, per user and per organization. */
  inviteUser: createRateLimiter({ limit: 20, windowMs: 60 * 60_000 }),
  inviteOrg: createRateLimiter({ limit: 50, windowMs: 24 * 60 * 60_000 }),
  /** Any other console write, per user. */
  write: createRateLimiter({ limit: 60, windowMs: 60_000 }),
  /** Stripe customer portal sessions, per user. */
  billing: createRateLimiter({ limit: 10, windowMs: 10 * 60_000 }),
  /** Admin CRM writes (notes, lead status), per admin. */
  adminWrite: createRateLimiter({ limit: 60, windowMs: 60_000 }),
  /** Admin actions that sign keys or send email (reissue, manual license, mark paid, resend, refund/revoke), per admin. */
  adminSensitive: createRateLimiter({ limit: 20, windowMs: 10 * 60_000 }),
  /** Refunds (money leaves), per admin, on top of adminSensitive. */
  adminRefund: createRateLimiter({ limit: 10, windowMs: 60 * 60_000 }),
  /** The bookkeeping CSV export, per admin. */
  adminExport: createRateLimiter({ limit: 10, windowMs: 10 * 60_000 }),
};
