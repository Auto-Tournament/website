/**
 * The console's emails: the sign-in link, the organization invite and the
 * admin's refund confirmation. Pure.
 * Every value is escaped in the HTML.
 *
 * Relative imports on purpose: vitest runs this file without the `@/` alias.
 */
import { seller } from '../../components/seller';
import { escapeHtml } from '../license/email';

type Mail = { subject: string; text: string; html: string };

const footer = [`${seller.name} (${seller.form}), org. nr. ${seller.orgNumber}`, seller.email];

function layout(subject: string, paragraphs: string[], button: { label: string; href: string }, after: string[], secondary?: { label: string; href: string }): string {
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
${secondary ? `<p style="margin:16px 0 0"><a href="${e(secondary.href)}" style="color:#1a1a1a">${e(secondary.label)}</a></p>` : ''}
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

/** "€59.00", "NOK 250.00": an amount in minor units. */
export function moneyText(amount: number, currency: string): string {
  const value = (amount / 100).toFixed(2);
  return currency.toLowerCase() === 'eur' ? `€${value}` : `${currency.toUpperCase()} ${value}`;
}

export const REFUND_REASON_TEXT: Record<string, string> = {
  requested_by_customer: 'Requested by the customer',
  duplicate: 'Duplicate payment',
  fraudulent: 'Fraudulent',
};

/**
 * To the admin's own address: confirm a refund asked for in the admin CRM.
 * The links carry the single-use token; nothing moves until the admin opens
 * the link and presses Confirm on the page, signed in as themselves.
 */
export function refundConfirmEmail(input: {
  confirmLink: string;
  cancelLink: string;
  licenseId: string;
  licensee: string | null;
  pack: string;
  amount: number;
  currency: string;
  reason: string;
  via: 'stripe' | 'manual';
  requestedBy: string;
  requestedAt: Date;
}): Mail {
  const money = moneyText(input.amount, input.currency);
  const subject = `Confirm refund of ${money} for ${input.licenseId}`;
  const when = `${input.requestedAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
  const intro = `${input.requestedBy.slice(0, 120)} asked to refund ${money} for license ${input.licenseId} in the admin console. Nothing has been refunded yet.`;
  const facts = [
    `Licensee: ${input.licensee?.slice(0, 200) || 'not given'}`,
    `Pack: ${input.pack}`,
    `Amount: ${money}${input.via === 'stripe' ? ', back to the card through Stripe' : ', recorded as a bank refund'}`,
    `Reason: ${REFUND_REASON_TEXT[input.reason] ?? input.reason}`,
    `Asked by: ${input.requestedBy.slice(0, 120)}`,
    `Asked at: ${when}`,
  ];
  const how = 'To refund it, open the link while signed in to the console as yourself and press Confirm. It works once, for 15 minutes.';
  const after = ["If this wasn't you, ignore this email and sign out everywhere: the cancel link below does both. Then tell the other admins."];
  const text = [intro, '', ...facts, '', how, '', input.confirmLink, '', ...after, '', `Cancel it: ${input.cancelLink}`, '', '-- ', ...footer, ''].join('\n');
  return {
    subject,
    text,
    html: layout(subject, [intro, ...facts, how], { label: `Confirm the refund of ${money}`, href: input.confirmLink }, after, { label: 'Cancel it (and sign out everywhere)', href: input.cancelLink }),
  };
}

/** To an admin's own address: the link that lets them add a passkey (or recover after losing them all). */
export function passkeyLinkEmail(input: { link: string; purpose: 'register' | 'recover' }): Mail {
  const recover = input.purpose === 'recover';
  const subject = recover ? 'Recover your Auto Tournament admin passkey' : 'Add a passkey to your Auto Tournament admin account';
  const intro = recover
    ? 'Someone signed in as you asked to recover admin access because all passkeys were lost. Open this link, signed in to the console, to add a new passkey. It will start to work 24 hours after you add it.'
    : 'Open this link, signed in to the console, to add a passkey (Touch ID, Face ID or a security key) to your admin account.';
  const after = ['It works once, for 15 minutes.', "If this wasn't you, don't open the link: someone may have your console session. Sign out everywhere from the admin page and tell the other admins."];
  const text = [intro, '', input.link, '', ...after, '', '-- ', ...footer, ''].join('\n');
  return { subject, text, html: layout(subject, [intro], { label: recover ? 'Recover with a new passkey' : 'Add a passkey', href: input.link }, after) };
}

/** To an admin's own address, at once when a passkey was added (a recovery one gets a louder warning). */
export function passkeyAddedEmail(input: { name: string; recovery: boolean; usableFrom: Date; manageLink: string }): Mail {
  const when = `${input.usableFrom.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
  const name = input.name.slice(0, 60);
  const subject = input.recovery ? 'Warning: a recovery passkey was added to your admin account' : 'A passkey was added to your admin account';
  const intro = input.recovery
    ? `A passkey named "${name}" was added to your Auto Tournament admin account through email recovery. It starts to work at ${when}.`
    : `A passkey named "${name}" was added to your Auto Tournament admin account.`;
  const after = input.recovery
    ? ["If this wasn't you, someone has your email and a console session. Before that time, sign in with a passkey you still have and remove it on the Passkeys page, then sign out everywhere and secure your email account."]
    : ["If this wasn't you, remove it on the Passkeys page and tell the other admins."];
  const text = [intro, '', input.manageLink, '', ...after, '', '-- ', ...footer, ''].join('\n');
  return { subject, text, html: layout(subject, [intro], { label: 'Open the Passkeys page', href: input.manageLink }, after) };
}
