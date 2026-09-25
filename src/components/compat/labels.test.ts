import { describe, expect, it } from 'vitest';
import { cs2Label, relativeTime, utcTime } from './labels';

describe('compat page wording', () => {
  const now = Date.parse('2026-09-25T12:00:00Z');
  it('says how long ago, the same on the server and in any browser', () => {
    expect(relativeTime('2026-09-25T11:59:30Z', now)).toBe('just now');
    expect(relativeTime('2026-09-25T12:00:30Z', now)).toBe('just now'); // clock skew
    expect(relativeTime('2026-09-25T11:59:00Z', now)).toBe('1 minute ago');
    expect(relativeTime('2026-09-25T11:00:01Z', now)).toBe('59 minutes ago');
    expect(relativeTime('2026-09-25T09:00:00Z', now)).toBe('3 hours ago');
    expect(relativeTime('2026-09-24T12:00:00Z', now)).toBe('1 day ago');
    expect(relativeTime('2026-09-15T12:00:00Z', now)).toBe('10 days ago');
  });
  it('prints absolute times in UTC', () => {
    expect(utcTime('2026-09-05T08:07:00.000Z')).toBe('5 Sep 2026, 08:07 UTC');
  });
  it('names the CS2 patch, or the build while the patch is not known yet', () => {
    expect(cs2Label({ buildid: '25537370', patch: '1.41.8.5' })).toBe('CS2 1.41.8.5');
    expect(cs2Label({ buildid: '25537999', patch: '' })).toBe('CS2 build 25537999');
  });
});
