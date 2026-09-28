import { describe, expect, it } from 'vitest';
import { inviteEmail, moneyText, refundConfirmEmail, signInEmail } from './emails';

describe('console emails', () => {
  it('sign-in: the link, escaped in the HTML', () => {
    const mail = signInEmail('https://console.autotournament.gg/signin/confirm?token=abc&x="y"');
    expect(mail.text).toContain('https://console.autotournament.gg/signin/confirm?token=abc&x="y"');
    expect(mail.html).toContain('token=abc&amp;x=&quot;y&quot;');
    expect(mail.html).not.toContain('x="y"');
    expect(mail.text).toContain('15 minutes');
  });

  it('invite: escapes the organization and inviter names', () => {
    const mail = inviteEmail({ link: 'https://console.autotournament.gg/invite?token=t', orgName: '<b>Evil</b> LAN', inviter: 'Ann "A"', role: 'admin' });
    expect(mail.subject).toContain('<b>Evil</b> LAN');
    expect(mail.html).toContain('&lt;b&gt;Evil&lt;/b&gt; LAN');
    expect(mail.html).not.toContain('<b>Evil');
    expect(mail.text).toContain('as an admin');
    expect(mail.text).toContain('7 days');
  });

  it('refund confirmation: amount in the subject, the facts, both links, escaped', () => {
    const mail = refundConfirmEmail({
      confirmLink: 'https://console.autotournament.gg/refunds/confirm?token=abc',
      cancelLink: 'https://console.autotournament.gg/refunds/confirm?token=abc&cancel=1',
      licenseId: 'L-abc',
      licensee: '<i>Evil</i> LAN',
      pack: 'Servers M',
      amount: 5900,
      currency: 'eur',
      reason: 'duplicate',
      via: 'stripe',
      requestedBy: 'sivert@example.com',
      requestedAt: new Date('2026-09-28T12:34:00Z'),
    });
    expect(mail.subject).toBe('Confirm refund of €59.00 for L-abc');
    expect(mail.text).toContain('Reason: Duplicate payment');
    expect(mail.text).toContain('Asked at: 2026-09-28 12:34 UTC');
    expect(mail.text).toContain("If this wasn't you, ignore this email and sign out everywhere");
    expect(mail.text).toContain('Cancel it: https://console.autotournament.gg/refunds/confirm?token=abc&cancel=1');
    expect(mail.html).toContain('&lt;i&gt;Evil&lt;/i&gt; LAN');
    expect(mail.html).toContain('token=abc&amp;cancel=1');
    expect(moneyText(25000, 'nok')).toBe('NOK 250.00');
  });
});
