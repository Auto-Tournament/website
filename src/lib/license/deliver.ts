import 'server-only';
import { emailConfig, sendEmail } from '@/lib/email/postmark';
import { dbError } from '@/lib/db/errors';
import { siteUrl } from '@/lib/site';
import { emailHash } from './format';
import { licenseEmail } from './email';
import { licenseStore, type LicenseStore } from './store';

/**
 * Emails a license key to the buyer. Off (returns 'disabled') without
 * POSTMARK_SERVER_TOKEN. Never throws: a failed send is logged (license id and
 * error, never the address) and recorded on the license as email_error, so
 * it can be sent again.
 *
 * - once (default): only when the license hasn't been emailed yet. The store's
 *   claim makes the webhook, its retries and the thanks page send it once.
 * - again: a resend from the console (its own admin actions; rate-limited there).
 *
 * `to` must be the address the license was bought with: its hash is checked
 * against the license, so a key never goes anywhere else.
 */
export type DeliverResult = 'sent' | 'skipped' | 'failed' | 'disabled';

export async function emailLicense(
  sessionId: string,
  to: string,
  options: { again?: boolean; store?: LicenseStore; fetchImpl?: typeof fetch } = {},
): Promise<DeliverResult> {
  const config = emailConfig();
  if (!config) return 'disabled';
  const site = siteUrl();
  if (!site) {
    console.error('[license] SITE_URL is not a valid http(s) URL; license email not sent');
    return 'failed';
  }
  const store = options.store ?? licenseStore();
  let claimed = false;
  try {
    const record = await store.claimEmail(sessionId, { again: options.again });
    if (!record) return 'skipped';
    claimed = true;
    const at = new Date().toISOString();
    if (!record.email_sha256 || record.email_sha256 !== emailHash(to)) {
      await store.finishEmail(sessionId, { ok: false, at, error: 'address does not match the license' });
      claimed = false;
      console.warn('[license] email not sent: the address does not match the license', { id: record.payload.id });
      return 'failed';
    }
    const mail = licenseEmail(record, site);
    const result = await sendEmail({ to: to.trim(), ...mail, tag: 'license-key' }, config, options.fetchImpl);
    await store.finishEmail(sessionId, result.ok ? { ok: true, at } : { ok: false, at, error: result.error });
    claimed = false;
    if (result.ok) {
      console.info('[license] emailed', { id: record.payload.id, again: Boolean(options.again) });
      return 'sent';
    }
    console.error('[license] email failed', { id: record.payload.id, error: result.error });
    return 'failed';
  } catch (err) {
    console.error('[license] email failed', { session: sessionId }, dbError(err));
    if (claimed) await store.finishEmail(sessionId, { ok: false, at: new Date().toISOString(), error: 'internal error' }).catch(() => {});
    return 'failed';
  }
}
