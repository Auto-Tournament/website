import { describe, expect, it } from 'vitest';
import { inviteEmail, signInEmail } from './emails';

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
});
