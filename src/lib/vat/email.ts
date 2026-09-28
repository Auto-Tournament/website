/**
 * The VAT threshold alert email: plain text and simple inline-styled HTML.
 * Pure (no Postmark, no database), so it's easy to test.
 *
 * Relative imports on purpose: vitest runs this file without the `@/` alias.
 */
import { escapeHtml } from '../license/email';

export type SaleLine = {
  date: string;
  licenseId: string;
  pack: string;
  /** Formatted, e.g. "€199.00". */
  amount: string;
};

export type VatAlertInput = {
  percent: 70 | 90 | 100;
  thresholdNok: number;
  totalNok: number;
  totalEur: number;
  rate: number;
  rateIsFallback: boolean;
  sales: SaleLine[];
};

export type VatAlert = { subject: string; text: string; html: string };

const nok = (n: number) => `NOK ${Math.round(n).toLocaleString('en-US')}`;
const eur = (n: number) => `€${n.toFixed(2)}`;

export function vatAlertEmail(input: VatAlertInput): VatAlert {
  const { percent, thresholdNok, totalNok, totalEur, rate, rateIsFallback, sales } = input;
  const subject = `VAT threshold: ${percent}% reached (${nok(totalNok)} of ${nok(thresholdNok)})`;
  const rateLine = `Rate used: ${rate.toFixed(4)} NOK/EUR${rateIsFallback ? ' (Norges Bank could not be reached; this is the conservative fallback rate)' : ' (Norges Bank, EUR/NOK spot)'}`;
  const nextStep =
    "Register in Merverdiavgiftsregisteret via Altinn when you pass NOK 50,000; then update the 'No VAT added' text and Stripe tax settings.";

  const salesLines = sales.length
    ? sales.map((s) => `- ${s.date}  ${s.licenseId}  ${s.pack}  ${s.amount}`)
    : ['(no sales in the window — the total is 0)'];

  const text = [
    `The rolling 12-month license revenue has reached ${percent}% of the NOK ${thresholdNok.toLocaleString('en-US')} VAT registration threshold.`,
    '',
    `Rolling total: ${nok(totalNok)} (${eur(totalEur)})`,
    rateLine,
    '',
    `SALES IN THE LAST 12 MONTHS (${sales.length})`,
    ...salesLines,
    '',
    'NEXT STEP',
    nextStep,
    '',
  ].join('\n');

  const e = escapeHtml;
  const font = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(subject)}</title></head>
<body style="margin:0;padding:0;background:#ffffff;color:#1a1a1a;${font};font-size:15px;line-height:1.55">
<div style="max-width:640px;margin:0 auto;padding:24px 16px">
<p style="margin:0 0 16px">The rolling 12-month license revenue has reached <strong>${percent}%</strong> of the ${e(nok(thresholdNok))} VAT registration threshold.</p>
<p style="margin:0 0 4px"><strong>Rolling total:</strong> ${e(nok(totalNok))} (${e(eur(totalEur))})</p>
<p style="margin:0 0 24px;color:#71717a;font-size:13px">${e(rateLine)}</p>
<p style="margin:0 0 6px;font-weight:600">Sales in the last 12 months (${sales.length})</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;margin:0 0 24px;font-size:13px">
${
  sales.length
    ? sales
        .map(
          (s) =>
            `<tr><td style="padding:4px 12px 4px 0;color:#71717a;white-space:nowrap">${e(s.date)}</td><td style="padding:4px 12px 4px 0;white-space:nowrap">${e(s.licenseId)}</td><td style="padding:4px 12px 4px 0">${e(s.pack)}</td><td style="padding:4px 0;text-align:right">${e(s.amount)}</td></tr>`,
        )
        .join('\n')
    : '<tr><td style="padding:4px 0;color:#71717a">No sales in the window — the total is 0.</td></tr>'
}
</table>
<p style="margin:0 0 6px;font-weight:600">Next step</p>
<p style="margin:0">${e(nextStep)}</p>
</div>
</body>
</html>
`;
  return { subject, text, html };
}
