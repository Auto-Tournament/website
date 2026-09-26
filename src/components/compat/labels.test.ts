import { describe, expect, it } from 'vitest';
import { compatSummaryText, cs2Label, durationLabel, progressLabel, relativeTime, utcTime } from './labels';
import { compatSummaryTone } from './CompatDot';

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

describe('nav status dot', () => {
  it('is green, yellow, red or grey', () => {
    expect(compatSummaryTone('pass')).toBe('pass');
    expect(compatSummaryTone('warn')).toBe('warn');
    expect(compatSummaryTone('checking')).toBe('warn');
    expect(compatSummaryTone('fail')).toBe('fail');
    expect(compatSummaryTone('no_verdict')).toBe('none');
    expect(compatSummaryTone(null)).toBe('none');
  });
  it('names the status for screen readers and the tooltip', () => {
    const cs2 = { buildid: '25537370', patch: '1.41.8.5' };
    expect(compatSummaryText({ overall: 'pass', cs2 })).toEqual({
      label: 'CS2 compatibility: compatible',
      title: 'Ready Up on CS2 1.41.8.5: Compatible',
    });
    expect(compatSummaryText({ overall: 'warn', cs2 }).label).toBe('CS2 compatibility: static check OK');
    expect(compatSummaryText({ overall: null, cs2: null })).toEqual({
      label: 'CS2 compatibility: unknown',
      title: 'Ready Up CS2 compatibility: Unknown',
    });
  });
  it('says how long a step took', () => {
    expect(durationLabel(0)).toBe('0s');
    expect(durationLabel(42_900)).toBe('42s');
    expect(durationLabel(185_000)).toBe('3m 05s');
    expect(durationLabel(3_720_000)).toBe('1h 02m');
    expect(durationLabel(-5)).toBe('');
  });
  it('names where a run is', () => {
    const step = (name: string, status: 'queued' | 'running') => ({ id: name, name, stage: 'live' as const, status });
    expect(progressLabel({ inProgress: true, total: 7, index: 5, current: step('Live: match', 'running'), sub: step('round 1 ends', 'running') })).toBe(
      'Step 5 of 7: Live: match · round 1 ends',
    );
    expect(progressLabel({ inProgress: true, total: 7, index: 1, current: step('Build bundle', 'queued'), sub: null })).toBe('Step 1 of 7: Build bundle (up next)');
    expect(progressLabel({ inProgress: false, total: 7, index: 0, current: null, sub: null })).toBeNull();
  });
});
