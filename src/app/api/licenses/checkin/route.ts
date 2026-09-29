import { clientIp, createRateLimiter } from '@/lib/checkout';
import { databaseUrl, db } from '@/lib/db/client';
import { dbError } from '@/lib/db/errors';
import { emailConfig, sendEmail } from '@/lib/email/postmark';
import { CHECKIN_RULES, checkinAnswer, parseCheckin, sameToken, verifiedPayload } from '@/lib/license/checkin';
import { claimUsageEmail, recordCheckin, usageEmail, usageForLicense } from '@/lib/license/checkinStore';
import { publishedPublicKeys } from '@/lib/license/keys';
import { licenseStore } from '@/lib/license/store';
import { consoleUrl } from '@/lib/console/urls';
import { readCapped } from '@/lib/readCapped';
import { DEFAULT_SITE_URL, siteUrl } from '@/lib/site';
import { seller } from '@/components/seller';

// The daily license check-in of a licensed Auto Tournament instance (only
// instances with a license key saved send it; see src/lib/license/checkin.ts
// and the privacy policy, /privacy#license-checkin). Server to server, no
// cookies. The body carries the key so its signature can be checked; the key
// is never stored or logged, only its license id. Answers with the usage the
// instance may show its admins. Nothing is ever blocked: every answer other
// than 200 is ignored by the instance.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Instances check in once a day, at startup and when the key changes: a few an hour is plenty.
const perInstance = createRateLimiter({ limit: 6, windowMs: 60 * 60_000 });
const perIp = createRateLimiter({ limit: 120, windowMs: 60 * 60_000 });

function reply(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

export async function POST(request: Request) {
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) return reply(415, { error: 'expected JSON' });
  if (!databaseUrl()) return reply(503, { error: 'unavailable' });
  const now = new Date();
  if (!perIp(clientIp(request.headers), now.getTime())) return reply(429, { error: 'too many requests' });

  let body: unknown;
  try {
    const raw = await readCapped(request, CHECKIN_RULES.maxBodyBytes);
    if (raw === null) return reply(413, { error: 'too large' });
    body = JSON.parse(raw);
  } catch {
    return reply(400, { error: 'invalid JSON' });
  }
  const parsed = parseCheckin(body);
  if (!parsed.ok) return reply(400, { error: parsed.error });
  const input = parsed.value;
  if (!perInstance(`${input.keyId}:${input.instanceId}`, now.getTime())) return reply(429, { error: 'too many requests' });

  const payload = verifiedPayload(input.token, publishedPublicKeys());
  if (!payload || payload.id !== input.keyId) return reply(401, { error: 'not a valid license key' });

  try {
    const record = await licenseStore().byLicenseId(input.keyId);
    // A genuine signature, but we must also have issued this exact key.
    if (!record || !sameToken(record.token, input.token)) return reply(404, { error: 'unknown license' });

    await recordCheckin(db(), input, now);
    const usage = await usageForLicense(db(), payload, now);

    if (usage.emailReason && record.livemode) {
      // In the background: the answer never waits for the email.
      void notifyUs(payload, usage, now).catch((err) => console.error('[checkin] usage email failed', err instanceof Error ? err.name : 'error'));
    }
    return reply(200, checkinAnswer(payload, usage, `${siteUrl() ?? DEFAULT_SITE_URL}/pricing`));
  } catch (err) {
    console.error('[checkin] failed', dbError(err));
    return reply(500, { error: 'failed' });
  }
}

async function notifyUs(payload: Parameters<typeof usageEmail>[0], usage: Parameters<typeof usageEmail>[1], now: Date): Promise<void> {
  if (!usage.emailReason) return;
  const config = emailConfig();
  if (!(await claimUsageEmail(db(), payload.id, usage.emailReason, now))) return;
  if (!config) {
    console.info('[checkin] usage note (Postmark not configured, no email sent)', { license: payload.id, reason: usage.emailReason });
    return;
  }
  const mail = usageEmail(payload, usage, consoleUrl(`/admin/licenses/${payload.id}`));
  const result = await sendEmail({ to: seller.email, ...mail, tag: 'license-usage' }, config);
  if (result.ok) console.info('[checkin] usage note emailed', { license: payload.id, reason: usage.emailReason });
  else console.error('[checkin] usage note email failed', { license: payload.id, error: result.error });
}
