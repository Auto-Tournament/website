/**
 * Sends email through Postmark's HTTP API (no SDK). Off unless
 * POSTMARK_SERVER_TOKEN is set: then emailConfig() is null and nothing is sent.
 *
 * - `POSTMARK_SERVER_TOKEN`: the server's API token (secret).
 * - `EMAIL_FROM`: default `Auto Tournament <licenses@autotournament.gg>`; the
 *   domain must be verified in Postmark.
 * - `POSTMARK_MESSAGE_STREAM`: default `outbound` (transactional).
 *
 * Errors are reported as the HTTP status and Postmark's numeric error code,
 * never Postmark's message: it can quote the recipient's address.
 *
 * No process.env read at import and no Next import, so it is easy to test.
 */

export const POSTMARK_URL = 'https://api.postmarkapp.com/email';
export const DEFAULT_EMAIL_FROM = 'Auto Tournament <licenses@autotournament.gg>';
export const REPLY_TO = 'sivert@autotournament.gg';
const TIMEOUT_MS = 8_000;

export type EmailConfig = { token: string; from: string; stream: string };

export function emailConfig(env: Record<string, string | undefined> = process.env): EmailConfig | null {
  const token = env.POSTMARK_SERVER_TOKEN?.trim();
  if (!token) return null;
  // One line only: a header value.
  const from = (env.EMAIL_FROM?.trim() || DEFAULT_EMAIL_FROM).replace(/[\r\n]+/g, ' ');
  const stream = env.POSTMARK_MESSAGE_STREAM?.trim() || 'outbound';
  return { token, from, stream };
}

export type OutgoingEmail = {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Postmark tag, for filtering in its activity log. */
  tag?: string;
};

export type SendResult = { ok: true; messageId: string } | { ok: false; error: string };

type Fetch = (input: string, init: RequestInit) => Promise<Response>;

export async function sendEmail(mail: OutgoingEmail, config: EmailConfig, fetchImpl: Fetch = fetch): Promise<SendResult> {
  let res: Response;
  try {
    res = await fetchImpl(POSTMARK_URL, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'x-postmark-server-token': config.token,
      },
      body: JSON.stringify({
        From: config.from,
        To: mail.to,
        ReplyTo: REPLY_TO,
        Subject: mail.subject,
        TextBody: mail.text,
        HtmlBody: mail.html,
        MessageStream: config.stream,
        ...(mail.tag ? { Tag: mail.tag } : {}),
        // No open or click tracking.
        TrackOpens: false,
        TrackLinks: 'None',
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error && err.name === 'TimeoutError' ? 'timeout' : 'network error' };
  }
  const data = (await res.json().catch(() => null)) as { ErrorCode?: unknown; MessageID?: unknown } | null;
  const code = typeof data?.ErrorCode === 'number' ? data.ErrorCode : null;
  if (res.ok && code === 0 && typeof data?.MessageID === 'string') return { ok: true, messageId: data.MessageID };
  return { ok: false, error: `postmark http ${res.status}${code !== null ? ` code ${code}` : ''}` };
}
