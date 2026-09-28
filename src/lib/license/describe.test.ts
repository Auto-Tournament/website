import { describe, expect, it } from 'vitest';
import { formatDay, formatRange, licenseDurationText, statusHint, updatesText } from './describe';
import { LIFETIME, type LicensePayload } from './format';

function payload(over: Partial<LicensePayload> = {}): LicensePayload {
  return {
    v: 1,
    kid: 'kid',
    id: 'L-test',
    customer: 'cus_TEST123',
    product: 'platform',
    pack: 'L',
    max_servers: 40,
    kind: 'event',
    issued_at: '2026-10-16T10:00:00Z',
    updates_until: '2026-10-16',
    valid_from: '2026-10-16',
    valid_to: '2026-10-16',
    ...over,
  };
}

describe('formatDay', () => {
  it('is English, UTC, no weekday', () => {
    expect(formatDay('2026-10-16')).toBe('16 October 2026');
    expect(formatDay('2027-01-02')).toBe('2 January 2027');
  });
  it('returns anything else as is', () => {
    expect(formatDay('soon')).toBe('soon');
  });
});

describe('formatRange', () => {
  it('single day', () => {
    expect(formatRange('2026-10-16', '2026-10-16')).toBe('16 October 2026');
  });
  it('same month', () => {
    expect(formatRange('2026-10-16', '2026-10-18')).toBe('16–18 October 2026');
  });
  it('across months, same year', () => {
    expect(formatRange('2026-10-30', '2026-11-02')).toBe('30 October – 2 November 2026');
  });
  it('across years', () => {
    expect(formatRange('2026-12-30', '2027-01-02')).toBe('30 December 2026 – 2 January 2027');
  });
});

describe('licenseDurationText', () => {
  it('event, single day', () => {
    expect(licenseDurationText(payload())).toBe('One event: 16 October 2026 (1 day)');
  });
  it('event, multi day', () => {
    expect(licenseDurationText(payload({ valid_from: '2026-10-16', valid_to: '2026-10-18' }))).toBe('One event: 16–18 October 2026 (3 days)');
  });
  it('yearly: 12 months, one day short of the anniversary', () => {
    expect(
      licenseDurationText(payload({ kind: 'year', valid_from: undefined, valid_to: undefined, issued_at: '2026-09-28T10:00:00Z', updates_until: '2027-09-28' })),
    ).toBe('12 months: 28 September 2026 – 27 September 2027');
  });
  it('founder: lifetime', () => {
    expect(licenseDurationText(payload({ kind: 'founder', updates_until: LIFETIME }))).toBe('Lifetime (founding supporter)');
  });
});

describe('updatesText', () => {
  it('event/yearly', () => {
    expect(updatesText({ updates_until: '2026-10-16' })).toBe('Includes every version released up to 16 October 2026, and later bugfixes for those versions');
  });
  it('founder', () => {
    expect(updatesText({ updates_until: LIFETIME })).toBe('Includes all future versions (lifetime updates)');
  });
});

describe('statusHint', () => {
  const now = new Date('2026-09-28T12:00:00Z');

  it('event: starts in N days', () => {
    expect(statusHint(payload({ valid_from: '2026-10-16', valid_to: '2026-10-16' }), now)).toBe('starts in 18 days');
  });
  it('event: ends in N days', () => {
    expect(statusHint(payload({ valid_from: '2026-09-25', valid_to: '2026-10-03' }), now)).toBe('ends in 5 days');
  });
  it('event: ends today', () => {
    expect(statusHint(payload({ valid_from: '2026-09-25', valid_to: '2026-09-28' }), now)).toBe('ends today');
  });
  it('event: ended N days ago', () => {
    expect(statusHint(payload({ valid_from: '2026-09-20', valid_to: '2026-09-25' }), now)).toBe('ended 3 days ago');
  });
  it('yearly uses issued_at as the start and updates_until as the end', () => {
    const year = payload({ kind: 'year', valid_from: undefined, valid_to: undefined, issued_at: '2026-09-01T00:00:00Z', updates_until: '2027-09-01' });
    expect(statusHint(year, now)).toBe('ends in 338 days');
  });
  it('founder has no hint', () => {
    expect(statusHint(payload({ kind: 'founder', updates_until: LIFETIME }), now)).toBe('');
  });
});
