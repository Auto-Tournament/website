/**
 * The console's emails: the sign-in link and the organization invite. Pure.
 * Every value is escaped in the HTML.
 *
 * Relative imports on purpose: vitest runs this file without the `@/` alias.
 */
import { seller } from '../../components/seller';
import { escapeHtml } from '../license/email';

type Mail = { subject: string; text: string; html: string };

const footer = [`${seller.name} (${seller.form}), org. nr. ${seller.orgNumber}`, seller.email];

function layout(subject: string, paragraphs: string[], button: { label: string; href: string }, after: string[]): string {
  const e = escapeHtml;
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(subject)}</title></head>
<body style="margin:0;padding:0;background:#ffffff;color:#1a1a1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55">
<div style="max-width:600px;margin:0 auto;padding:24px 16px">
${paragraphs.map((p) => `<p style="margin:0 0 16px">${e(p)}</p>`).join('\n')}
<p style="margin:0 0 16px"><a href="${e(button.href)}" style="display:inline-block;padding:10px 16px;background:#1a1a1a;color:#ffffff;border-radius:6px;text-decoration:none">${e(button.label)}</a></p>
<p style="margin:0 0 16px;font-size:13px;color:#71717a;word-break:break-all">${e(button.href)}</p>
${after.map((p) => `<p style="margin:0 0 8px">${e(p)}</p>`).join('\n')}
<p style="margin:16px 0 0;padding-top:16px;border-top:1px solid #e4e4e7;color:#71717a;font-size:13px">${footer.map(e).join('<br>')}</p>
</div>
</body>
</html>
`;
}

export function signInEmail(link: string): Mail {
  const subject = 'Sign in to Auto Tournament';
  const intro = 'Open this link to sign in to the Auto Tournament console, where you see your licenses and manage your organization:';
  const after = ['It works once, for 15 minutes.', "Didn't ask for this? Ignore this email; nothing happens."];
  const text = [intro, '', link, '', ...after, '', '-- ', ...footer, ''].join('\n');
  return { subject, text, html: layout(subject, [intro], { label: 'Sign in', href: link }, after) };
}

export function inviteEmail(input: { link: string; orgName: string; inviter: string; role: string }): Mail {
  const org = input.orgName.slice(0, 120);
  const inviter = input.inviter.slice(0, 120);
  const subject = `You're invited to ${org} on Auto Tournament`;
  const intro = `${inviter} invited you to join ${org} in the Auto Tournament console as ${input.role === 'admin' ? 'an admin' : `a ${input.role}`}. Members see the organization's licenses and keys.`;
  const how = 'Open the link, sign in with this email address, and accept the invite.';
  const after = ['The invite works once and expires in 7 days.', "Don't know them? Ignore this email; nothing happens."];
  const text = [intro, '', how, '', input.link, '', ...after, '', '-- ', ...footer, ''].join('\n');
  return { subject, text, html: layout(subject, [intro, how], { label: 'Open the invite', href: input.link }, after) };
}
