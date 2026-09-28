import { describe, expect, it } from 'vitest';
import { vatAlertEmail } from './email';

describe('vatAlertEmail', () => {
  it('states the percent, the totals and the rate used', () => {
    const mail = vatAlertEmail({
      percent: 90,
      thresholdNok: 50_000,
      totalNok: 45_312,
      totalEur: 4_231.5,
      rate: 10.7106,
      rateIsFallback: false,
      sales: [{ date: '2026-09-01', licenseId: 'L-abc123', pack: 'Servers M', amount: '€199.00' }],
    });
    expect(mail.subject).toBe('VAT threshold: 90% reached (NOK 45,312 of NOK 50,000)');
    expect(mail.text).toContain('90%');
    expect(mail.text).toContain('NOK 45,312');
    expect(mail.text).toContain('€4231.50');
    expect(mail.text).toContain('10.7106');
    expect(mail.text).toContain('L-abc123');
    expect(mail.text).toContain('Servers M');
    expect(mail.text).toContain('€199.00');
    expect(mail.text).toContain('Merverdiavgiftsregisteret');
    expect(mail.html).toContain('90%');
    expect(mail.html).toContain('L-abc123');
  });

  it('says when the fallback rate was used', () => {
    const mail = vatAlertEmail({
      percent: 100,
      thresholdNok: 50_000,
      totalNok: 51_000,
      totalEur: 4_250,
      rate: 12,
      rateIsFallback: true,
      sales: [],
    });
    expect(mail.text).toContain('fallback rate');
    expect(mail.text).toContain('no sales in the window');
  });
});
