/**
 * The "here is your license key" email, as plain text and simple inline-styled
 * HTML. Pure: the record in, subject + bodies out. Every value that comes from
 * the buyer or Stripe is escaped in the HTML.
 *
 * Relative imports on purpose: vitest runs this file without the `@/` alias.
 */
import { seller } from '../../components/seller';
import { coverageText, licenseDurationText, packName, productContents, updatesText } from './describe';
import type { LicensePayload } from './format';

export type LicenseEmailInput = {
  payload: LicensePayload;
  token: string;
  session_id: string;
  invoice_number: string | null;
};

export type LicenseEmail = { subject: string; text: string; html: string };

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

/** Label/value rows, in order. */
function detailRows(r: LicenseEmailInput): [string, string][] {
  const p = r.payload;
  return [
    ['License id', p.id],
    ...(p.licensee ? ([['Licensee', p.licensee]] as [string, string][]) : []),
    ['Pack', `${packName(p)}: ${productContents(p.product)}`],
    ['Servers', `Up to ${p.max_servers} game servers set up at any one time, spares included`],
    ['License duration', licenseDurationText(p)],
    ['Updates', updatesText(p)],
    ['Order reference', r.session_id],
    ...(r.invoice_number ? ([['Invoice', r.invoice_number]] as [string, string][]) : []),
  ];
}

export function licenseEmail(r: LicenseEmailInput, site: string): LicenseEmail {
  const p = r.payload;
  const subject = `Your Auto Tournament license key — ${p.id}`;
  const licenseUrl = `${site}/license`;
  const termsUrl = `${site}/terms`;
  const rows = detailRows(r);
  const coverage = coverageText(p);
  const rules = "The license is for the licensee and its contractors. It can't be transferred or resold.";
  const footer = [
    `${seller.name} (${seller.form}), org. nr. ${seller.orgNumber}`,
    seller.address,
    `${seller.email} · ${site.replace(/^https?:\/\//, '')}`,
    `${seller.vatNote}`,
  ];

  const text = [
    'Thanks for your order. Here is your Auto Tournament license key.',
    '',
    "Paste it into Ready Up or the platform's settings. The software checks it offline and never locks anything: if something is off, you get a warning.",
    '',
    'LICENSE KEY',
    r.token,
    '',
    'DETAILS',
    ...rows.map(([k, v]) => `${k}: ${v}`),
    '',
    'WHAT IT COVERS',
    coverage,
    rules,
    `Commercial License Terms: ${termsUrl}`,
    '',
    `Lost this email? Get the key again at ${licenseUrl} with the order reference and this email address.`,
    '',
    'Questions? Reply to this email.',
    '',
    '-- ',
    ...footer,
    '',
  ].join('\n');

  const e = escapeHtml;
  const font = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(subject)}</title></head>
<body style="margin:0;padding:0;background:#ffffff;color:#1a1a1a;${font};font-size:15px;line-height:1.55">
<div style="max-width:600px;margin:0 auto;padding:24px 16px">
<p style="margin:0 0 16px">Thanks for your order. Here is your Auto Tournament license key.</p>
<p style="margin:0 0 16px">Paste it into Ready Up or the platform&#39;s settings. The software checks it offline and never locks anything: if something is off, you get a warning.</p>
<p style="margin:0 0 6px;font-weight:600">License key</p>
<pre style="margin:0 0 24px;padding:12px;background:#f4f4f5;border:1px solid #e4e4e7;border-radius:6px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;white-space:pre-wrap;word-break:break-all">${e(r.token)}</pre>
<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;margin:0 0 24px">
${rows.map(([k, v]) => `<tr><td style="padding:4px 16px 4px 0;color:#71717a;vertical-align:top;white-space:nowrap">${e(k)}</td><td style="padding:4px 0;vertical-align:top;word-break:break-word">${e(v)}</td></tr>`).join('\n')}
</table>
<p style="margin:0 0 6px;font-weight:600">What it covers</p>
<p style="margin:0 0 8px">${e(coverage)}</p>
<p style="margin:0 0 8px">${e(rules)}</p>
<p style="margin:0 0 24px"><a href="${e(termsUrl)}" style="color:#1a1a1a">Commercial License Terms</a></p>
<p style="margin:0 0 16px">Lost this email? Get the key again on the <a href="${e(licenseUrl)}" style="color:#1a1a1a">license page</a> with the order reference and this email address.</p>
<p style="margin:0 0 24px">Questions? Reply to this email.</p>
<p style="margin:0;padding-top:16px;border-top:1px solid #e4e4e7;color:#71717a;font-size:13px">${footer.map(e).join('<br>')}</p>
</div>
</body>
</html>
`;
  return { subject, text, html };
}
