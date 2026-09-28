import { clientIp, createRateLimiter } from '@/lib/checkout';
import {
  contactEmailText,
  contactSubject,
  isHoneypotFilled,
  maxBodyBytes,
  sanitizeHeaderValue,
  validateContactRequest,
} from '@/lib/contact';
import { emailConfig, sendEmail } from '@/lib/email/postmark';
import { escapeHtml } from '@/lib/license/email';
import { readCapped } from '@/lib/readCapped';
import { sameOrigin } from '@/lib/site';
import { seller } from '@/components/seller';
import { databaseUrl, db } from '@/lib/db/client';
import { dbError } from '@/lib/db/errors';
import { createLead } from '@/lib/admin/leads';

// The /contact form: POST { name, email, organization, topic, numServers,
// eventDates, message, website (honeypot) }. Stores the message as a lead
// (the admin CRM's inbox, /admin/leads; deleted 24 months after the last
// activity) and sends one email to seller.email through the existing Postmark
// sender, Reply-To the sender's own address. Either one is enough: the answer
// is an error only when neither worked.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const allow = createRateLimiter({ limit: 5, windowMs: 10 * 60_000 });

function reply(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

const sentReply = () => reply(200, { message: "Thanks, we'll reply within 2 working days." });

export async function POST(request: Request) {
  if (!sameOrigin(request.headers)) return reply(403, { error: 'Forbidden.' });
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return reply(400, { error: 'Expected a JSON body.' });
  }
  const config = emailConfig();
  const keep = databaseUrl() !== null;
  if (!config && !keep) return reply(503, { error: 'Email is not set up. Email us directly instead.' });
  if (!allow(clientIp(request.headers), Date.now())) return reply(429, { error: 'Too many messages. Try again in a few minutes.' });

  let body: unknown;
  try {
    const raw = await readCapped(request, maxBodyBytes);
    if (raw === null) return reply(413, { error: 'Request too large.' });
    body = JSON.parse(raw);
  } catch {
    return reply(400, { error: 'Invalid request.' });
  }

  // A filled honeypot is a bot: pretend success without sending anything.
  if (isHoneypotFilled(body)) return sentReply();

  const checked = validateContactRequest(body);
  if (!checked.ok) return reply(400, { error: checked.error });
  const req = checked.value;

  let stored = false;
  if (keep) {
    try {
      await createLead(db(), req);
      stored = true;
    } catch (err) {
      console.error('[contact] could not store the lead', dbError(err));
    }
  }

  if (config) {
    const subject = contactSubject(req);
    const text = contactEmailText(req);
    const html = `<pre style="white-space:pre-wrap;word-break:break-word;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace">${escapeHtml(text)}</pre>`;
    const replyTo = sanitizeHeaderValue(req.email);
    try {
      const result = await sendEmail({ to: seller.email, subject, text, html, replyTo, tag: 'contact' }, config);
      if (!result.ok) {
        console.error('[contact] send failed', result.error);
        if (!stored) return reply(502, { error: "Couldn't send your message. Try again, or email us directly." });
      }
    } catch (err) {
      console.error('[contact] send threw', err instanceof Error ? err.name : 'unknown error');
      if (!stored) return reply(502, { error: "Couldn't send your message. Try again, or email us directly." });
    }
  } else if (!stored) {
    return reply(502, { error: "Couldn't send your message. Try again, or email us directly." });
  }

  return sentReply();
}
