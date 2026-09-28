/**
 * The sign-in link email for /account. Pure. The link is the only value in
 * it, and it is escaped in the HTML.
 *
 * Relative imports on purpose: vitest runs this file without the `@/` alias.
 */
import { seller } from '../../components/seller';
import { escapeHtml } from '../license/email';

export function signInEmail(link: string): { subject: string; text: string; html: string } {
  const subject = 'Sign in to see your Auto Tournament licenses';
  const text = [
    'Open this link to sign in and see your Auto Tournament licenses:',
    '',
    link,
    '',
    'It works once, for 15 minutes.',
    "Didn't ask for this? Ignore this email; nothing happens.",
    '',
    '-- ',
    `${seller.name} (${seller.form}), org. nr. ${seller.orgNumber}`,
    seller.email,
    '',
  ].join('\n');
  const e = escapeHtml;
  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(subject)}</title></head>
<body style="margin:0;padding:0;background:#ffffff;color:#1a1a1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55">
<div style="max-width:600px;margin:0 auto;padding:24px 16px">
<p style="margin:0 0 16px">Open this link to sign in and see your Auto Tournament licenses:</p>
<p style="margin:0 0 16px"><a href="${e(link)}" style="display:inline-block;padding:10px 16px;background:#1a1a1a;color:#ffffff;border-radius:6px;text-decoration:none">Sign in</a></p>
<p style="margin:0 0 16px;font-size:13px;color:#71717a;word-break:break-all">${e(link)}</p>
<p style="margin:0 0 8px">It works once, for 15 minutes.</p>
<p style="margin:0 0 24px">Didn&#39;t ask for this? Ignore this email; nothing happens.</p>
<p style="margin:0;padding-top:16px;border-top:1px solid #e4e4e7;color:#71717a;font-size:13px">${e(`${seller.name} (${seller.form}), org. nr. ${seller.orgNumber}`)}<br>${e(seller.email)}</p>
</div>
</body>
</html>
`;
  return { subject, text, html };
}
