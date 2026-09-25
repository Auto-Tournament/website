import { describe, expect, it } from 'vitest';
import { BADGE_WORDING, COMPAT_MAX_BYTES, compatBadge, validateCompatDocument } from './document';
import { compatDoc, staticOkDoc } from './testDoc';

// Ported from the platform's tests/api/compat-payload.spec.ts.

describe('compat document validation', () => {
  it('accepts the contract and normalises timestamps to UTC', () => {
    const doc = compatDoc({ run: { started_at: '2026-09-25T14:00:00+02:00', finished_at: null } });
    const checked = validateCompatDocument(doc);
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.value.run.started_at).toBe('2026-09-25T12:00:00.000Z');
    expect(checked.value.run.finished_at).toBeNull();
    // Exactly the contract's keys, in its order.
    expect(Object.keys(checked.value)).toEqual(['schema', 'cs2', 'readyup', 'run', 'overall', 'components', 'checked_at']);
    expect(checked.value.components.map((c) => c.id)).toEqual(['core', 'match']);
  });

  it("accepts what Ready Up's compat-report.py writes for a clean static run", () => {
    const checked = validateCompatDocument(staticOkDoc());
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.value.overall).toBe('warn');
    expect(checked.value.components.map((c) => c.id)).toEqual(['core', 'skins', 'match', 'practice', 'essentials', 'midas', 'whitelist', 'fleet']);
  });

  it('a queued run may have no patch yet (Ready Up reads it from steam.inf later)', () => {
    const queued = validateCompatDocument(
      compatDoc({
        cs2: { buildid: '25537999', patch: '' },
        run: { state: 'queued', finished_at: null },
        overall: 'checking',
        components: [{ id: 'core', name: 'Core', status: 'checking', checks: [] }],
      }),
    );
    expect(queued.ok).toBe(true);
    if (!queued.ok) return;
    expect(queued.value.cs2.patch).toBe('');
    expect(compatBadge(queued.value).message).toContain('CS2 build 25537999');
    expect(validateCompatDocument(compatDoc({ cs2: { buildid: '1', patch: 'x.y' } })).ok).toBe(false);
  });

  it('refuses what the contract does not allow, naming each field', () => {
    type Doc = Record<string, any>;
    const cases: Array<[string, (d: Doc) => void, string]> = [
      ['schema 2', (d) => (d.schema = 2), 'schema'],
      ['unknown top-level field', (d) => (d.extra = true), 'extra'],
      ['unknown nested field', (d) => (d.run.extra = 1), 'run.extra'],
      ['missing overall', (d) => delete d.overall, 'overall'],
      ['bad overall', (d) => (d.overall = 'ok'), 'overall'],
      ['bad trigger', (d) => (d.run.trigger = 'cron'), 'run.trigger'],
      ['bad stage', (d) => (d.run.stage = 'deploy'), 'run.stage'],
      ['bad state', (d) => (d.run.state = 'done'), 'run.state'],
      ['javascript url', (d) => (d.run.url = 'javascript:alert(1)'), 'run.url'],
      ['buildid not numeric', (d) => (d.cs2.buildid = '12a'), 'cs2.buildid'],
      ['buildid a number', (d) => (d.cs2.buildid = 25537370), 'cs2.buildid'],
      ['patch not dotted', (d) => (d.cs2.patch = 'latest'), 'cs2.patch'],
      ['commit not hex', (d) => (d.readyup.commit = 'main'), 'readyup.commit'],
      ['started_at not ISO', (d) => (d.run.started_at = 'yesterday'), 'run.started_at'],
      ['checked_at impossible date', (d) => (d.checked_at = '2026-02-31T25:00:00Z'), 'checked_at'],
      ['component id uppercase', (d) => (d.components[0].id = 'Core'), 'components[0].id'],
      ['duplicate component', (d) => (d.components[1].id = 'core'), 'components[1].id'],
      ['bad component status', (d) => (d.components[0].status = 'ok'), 'components[0].status'],
      ['bad check kind', (d) => (d.components[0].checks[0].kind = 'magic'), 'components[0].checks[0].kind'],
      ['passed > total', (d) => (d.components[0].checks[0].passed = 10), 'components[0].checks[0].passed'],
      ['negative total', (d) => (d.components[0].checks[0].total = -1), 'components[0].checks[0].total'],
      ['fractional passed', (d) => (d.components[0].checks[0].passed = 1.5), 'components[0].checks[0].passed'],
      ['failure not a string', (d) => (d.components[0].checks[0].failures = [1]), 'components[0].checks[0].failures[0]'],
      ['failure too long', (d) => (d.components[0].checks[0].failures = ['x'.repeat(501)]), 'components[0].checks[0].failures[0]'],
      ['control chars in name', (d) => (d.components[0].name = 'Co\nre'), 'components[0].name'],
      ['too many components', (d) => (d.components = Array.from({ length: 33 }, (_, i) => ({ ...d.components[0], id: `c${i}` }))), 'components'],
      ['components not an array', (d) => (d.components = {}), 'components'],
      ['empty version', (d) => (d.readyup.version = ''), 'readyup.version'],
    ];
    for (const [name, mutate, path] of cases) {
      const doc = JSON.parse(JSON.stringify(compatDoc())) as Doc;
      mutate(doc);
      const checked = validateCompatDocument(doc);
      expect(checked.ok, name).toBe(false);
      if (checked.ok) continue;
      expect(checked.errors.some((e) => e.startsWith(`${path}:`)), `${name}: ${checked.errors.join(' | ')}`).toBe(true);
    }
    for (const notADoc of [null, [], 'compat', 42]) {
      expect(validateCompatDocument(notADoc).ok).toBe(false);
    }
  });

  it('caps the error list', () => {
    const doc = compatDoc({ components: [] });
    const bad = { ...doc, components: Array.from({ length: 30 }, (_, i) => ({ id: `c${i}`, name: '', status: 'x', checks: 'y' })) };
    const checked = validateCompatDocument(bad);
    expect(checked.ok).toBe(false);
    if (!checked.ok) expect(checked.errors.length).toBeLessThanOrEqual(50);
  });

  it('the body cap is 256 KB', () => {
    expect(COMPAT_MAX_BYTES).toBe(256 * 1024);
  });
});

describe('compat badge', () => {
  it('is "unknown" before the first run, in shields endpoint format', () => {
    expect(compatBadge(null)).toEqual({ schemaVersion: 1, label: 'Ready Up', message: 'unknown', color: 'lightgrey', cacheSeconds: 300 });
  });

  it('follows the overall verdict, with the words and colours of Ready Up\'s own badge', () => {
    const expected: Record<string, [string, string]> = {
      pass: ['compatible · CS2 1.41.8.5', 'brightgreen'],
      warn: ['static ok · CS2 1.41.8.5', 'yellow'],
      fail: ['incompatible · CS2 1.41.8.5', 'red'],
      checking: ['checking · CS2 1.41.8.5', 'blue'],
      no_verdict: ['no verdict · CS2 1.41.8.5', 'lightgrey'],
    };
    expect(Object.keys(BADGE_WORDING).sort()).toEqual(Object.keys(expected).sort());
    for (const [overall, [message, color]] of Object.entries(expected)) {
      const checked = validateCompatDocument(compatDoc({ overall }));
      expect(checked.ok).toBe(true);
      if (!checked.ok) continue;
      expect(compatBadge(checked.value)).toEqual({ schemaVersion: 1, label: 'Ready Up', message, color, cacheSeconds: 300 });
    }
  });
});
