import { describe, expect, it } from 'vitest';
import { licenseStatus, statusText } from '../license/describe';
import { emailHash, type LicensePayload } from '../license/format';
import { publicCheck } from '../license/verify';
import { compareVersions, coverageFor, parseVersion, releaseLines, type GithubRelease } from './versions';

const rel = (tag: string, day: string, prerelease = false, draft = false): GithubRelease => ({
  tag_name: tag,
  published_at: `${day}T12:00:00Z`,
  prerelease,
  draft,
});

describe('release lines', () => {
  const releases = [
    rel('v1.0.0', '2026-01-10'),
    rel('v1.0.1', '2026-02-01'),
    rel('v1.1.0-beta.1', '2026-02-20', true),
    rel('v1.1.0', '2026-03-01'),
    rel('v1.1.5', '2027-06-01'), // a late patch of a covered line
    rel('v1.2.0', '2026-10-01'),
    rel('v2.0.0-beta.1', '2026-12-01', true),
    rel('v2.0.0-beta.2', '2026-12-05', true),
    rel('v2.1.0', '2027-01-01', false, true), // draft: ignored
    rel('cs2-plugin-7', '2026-05-01'), // not a version: ignored
  ];

  it('groups by major.minor, dated by x.y.0, pre-releases only for lines without a stable x.y.0', () => {
    const lines = releaseLines(releases);
    expect(lines.map((l) => [l.name, l.date, l.newest.tag])).toEqual([
      ['1.0', '2026-01-10', 'v1.0.1'],
      ['1.1', '2026-03-01', 'v1.1.5'],
      ['1.2', '2026-10-01', 'v1.2.0'],
      ['2.0', '2026-12-01', 'v2.0.0-beta.2'],
    ]);
  });

  it('a yearly license covers lines dated on or before updates_until, with their later patches', () => {
    const c = coverageFor(releaseLines(releases), '2026-10-01');
    expect(c.covered.map((l) => l.name)).toEqual(['1.0', '1.1', '1.2']);
    expect(c.newestCovered?.tag).toBe('v1.2.0');
    expect(c.latest?.tag).toBe('v2.0.0-beta.2');
    expect(c.firstUncovered?.name).toBe('2.0');
    // 1.1.5 came out after updates_until, but its line didn't.
    expect(coverageFor(releaseLines(releases), '2026-09-30').newestCovered?.tag).toBe('v1.1.5');
  });

  it('founder covers every line', () => {
    const c = coverageFor(releaseLines(releases), '9999-12-31');
    expect(c.covered).toHaveLength(4);
    expect(c.firstUncovered).toBeNull();
  });

  it('handles no releases', () => {
    expect(coverageFor(releaseLines([]), '2027-01-01')).toMatchObject({ lines: [], covered: [], newestCovered: null, latest: null, firstUncovered: null });
  });

  it('orders versions like semver', () => {
    const v = (tag: string) => parseVersion(tag, '2026-01-01T00:00:00Z')!;
    expect(compareVersions(v('1.0.0-beta.2'), v('1.0.0-beta.10'))).toBeLessThan(0);
    expect(compareVersions(v('1.0.0-beta.10'), v('1.0.0'))).toBeLessThan(0);
    expect(compareVersions(v('1.10.0'), v('1.9.9'))).toBeGreaterThan(0);
    expect(parseVersion('v1.2', '2026-01-01T00:00:00Z')).toBeNull();
  });
});

function payload(over: Partial<LicensePayload> = {}): LicensePayload {
  return {
    v: 1,
    kid: 'kid',
    id: 'L-abcdefgh',
    customer: 'cus_TEST123',
    licensee: 'Example LAN AS',
    product: 'servers',
    pack: 'M',
    max_servers: 20,
    kind: 'event',
    issued_at: '2026-09-28T10:00:00Z',
    updates_until: '2026-10-05',
    valid_from: '2026-10-03',
    valid_to: '2026-10-05',
    ...over,
  };
}

describe('license status', () => {
  it('event: upcoming, active, expired', () => {
    expect(licenseStatus(payload(), '2026-10-02')).toBe('upcoming');
    expect(licenseStatus(payload(), '2026-10-03')).toBe('active');
    expect(licenseStatus(payload(), '2026-10-05')).toBe('active');
    expect(licenseStatus(payload(), '2026-10-06')).toBe('expired');
  });
  it('year: active, then updates ended; founder: always active', () => {
    const year = payload({ kind: 'year', updates_until: '2027-09-28', valid_from: undefined, valid_to: undefined });
    expect(licenseStatus(year, '2027-09-28')).toBe('active');
    expect(licenseStatus(year, '2027-09-29')).toBe('updates-ended');
    expect(statusText(year, '2027-09-29')).toContain('stay licensed');
    expect(licenseStatus(payload({ kind: 'founder', updates_until: '9999-12-31' }), '2099-01-01')).toBe('active');
  });
});

describe('public check', () => {
  const record = (over: Partial<LicensePayload> = {}, livemode = true) => ({
    session_id: 'cs_live_secretref',
    invoice_number: 'INV-1',
    email_sha256: emailHash('buyer@example.com'),
    livemode,
    dates_from_form: true,
    payload: payload(over),
    token: 'ATL1.secret.key',
  });

  it('shows only the public fields', () => {
    const c = publicCheck(record(), '2026-10-04');
    expect(c.status).toBe('valid');
    const shown = JSON.stringify(c);
    for (const hidden of ['ATL1', 'cs_live_secretref', 'INV-1', 'cus_TEST123', emailHash('buyer@example.com'), '@']) expect(shown).not.toContain(hidden);
    expect(shown).toContain('Example LAN AS');
    expect(shown).toContain('Servers M');
  });

  it('upcoming, expired, test and not found', () => {
    expect(publicCheck(record(), '2026-10-01').status).toBe('upcoming');
    expect(publicCheck(record(), '2026-10-09').status).toBe('expired');
    expect(publicCheck(record({}, false), '2026-10-04').status).toBe('test');
    expect(publicCheck(null, '2026-10-04')).toEqual({ status: 'not-found' });
  });
});
