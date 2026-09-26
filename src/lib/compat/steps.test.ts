import { describe, expect, it } from 'vitest';
import { compatBadge, compatStatus, validateCompatDocument, type CompatDocument, type CompatStep } from './document';
import { COMPAT_STEPS_STALE_MS, effectiveOverall, mergeSteps, runInProgress, runProgress, withMergedSteps } from './steps';
import { compatDoc, type TestCompatDoc } from './testDoc';

const at = (minutes: number) => new Date(Date.UTC(2026, 8, 26, 12, minutes)).toISOString();

const step = (id: string, status: CompatStep['status'], extra: Partial<CompatStep> = {}): CompatStep => ({
  id,
  name: id,
  stage: 'setup',
  status,
  ...extra,
});

/** The plan cs2-dynamic.yml sends first. */
const plan = (): CompatStep[] =>
  ['build', 'update', 'install', 'selftest', 'live-match', 'live-scrim', 'record'].map((id) => step(id, 'queued'));

function withSteps(doc: TestCompatDoc, steps: CompatStep[]): CompatDocument {
  const checked = validateCompatDocument({ ...doc, run: { ...doc.run, steps } });
  if (!checked.ok) throw new Error(checked.errors.join('; '));
  return checked.value;
}

describe('run.steps validation', () => {
  it('accepts steps and keeps them in order; documents without them are unchanged', () => {
    const doc = withSteps(compatDoc(), [
      step('build', 'pass', { started_at: '2026-09-26T14:00:00+02:00', finished_at: at(5) }),
      step('selftest', 'running', { stage: 'selftest', started_at: at(6) }),
      step('live-match.03', 'queued', { stage: 'live', parent: 'live-match', name: 'warmup (match_warmup)' }),
      step('record', 'fail', { stage: 'record', detail: 'git push was refused' }),
    ]);
    expect(doc.run.steps?.map((s) => s.id)).toEqual(['build', 'selftest', 'live-match.03', 'record']);
    expect(doc.run.steps?.[0].started_at).toBe('2026-09-26T12:00:00.000Z');
    expect(Object.keys(doc.run)).toEqual(['id', 'url', 'trigger', 'stage', 'state', 'started_at', 'finished_at', 'steps']);

    const plain = validateCompatDocument(compatDoc());
    expect(plain.ok && 'steps' in plain.value.run).toBe(false);
  });

  it('refuses bad steps: unknown fields and statuses, duplicate ids, control characters, too many', () => {
    const bad = (steps: unknown) => {
      const checked = validateCompatDocument({ ...compatDoc(), run: { ...compatDoc().run, steps } });
      return checked.ok ? [] : checked.errors;
    };
    expect(bad([{ ...step('a', 'queued'), colour: 'red' }])).toEqual(['run.steps[0].colour: is not a known field']);
    expect(bad([step('a', 'done' as never)])[0]).toMatch(/^run\.steps\[0\]\.status: must be one of/);
    expect(bad([step('a', 'queued'), step('a', 'pass')])).toEqual(['run.steps[1].id: duplicates "a"']);
    expect(bad([step('a', 'fail', { detail: 'line\nbreak' })])).toEqual(['run.steps[0].detail: must not contain control characters']);
    expect(bad([step('a b', 'queued')])[0]).toMatch(/^run\.steps\[0\]\.id/);
    expect(bad([step('a', 'queued', { started_at: 'yesterday' })])[0]).toMatch(/^run\.steps\[0\]\.started_at/);
    expect(bad(Array.from({ length: 101 }, (_, i) => step(`s${i}`, 'queued')))).toEqual(['run.steps: must have at most 100 entries']);
    expect(bad('build')).toEqual(['run.steps: must be an array']);
  });
});

describe('mergeSteps', () => {
  it('updates steps one by one and never loses one the newer copy leaves out', () => {
    const stored = plan();
    stored[0] = step('build', 'running', { started_at: at(0) });
    const merged = mergeSteps(stored, [step('build', 'pass', { finished_at: at(20) }), step('update', 'running', { started_at: at(21) })]);
    expect(merged?.map((s) => `${s.id}:${s.status}`)).toEqual([
      'build:pass',
      'update:running',
      'install:queued',
      'selftest:queued',
      'live-match:queued',
      'live-scrim:queued',
      'record:queued',
    ]);
    // The start time the newer copy left out is kept.
    expect(merged?.[0]).toMatchObject({ started_at: at(0), finished_at: at(20) });
  });

  it('keeps a step that only the stored copy has right after the one it followed', () => {
    const stored = [step('a', 'pass'), step('a.1', 'pass', { parent: 'a' }), step('a.2', 'running', { parent: 'a' }), step('b', 'queued')];
    const merged = mergeSteps(stored, [step('a', 'running'), step('b', 'queued'), step('a.3', 'queued', { parent: 'a' })]);
    expect(merged?.map((s) => s.id)).toEqual(['a', 'a.1', 'a.2', 'b', 'a.3']);
    // Nothing stored before the first step it has in common: it goes first.
    expect(mergeSteps([step('x', 'pass'), step('a', 'pass')], [step('a', 'pass')])?.map((s) => s.id)).toEqual(['x', 'a']);
  });

  it('a copy without steps keeps the stored ones; a step queued again starts over', () => {
    const stored = [step('a', 'fail', { started_at: at(0), finished_at: at(1), detail: 'boom' })];
    expect(mergeSteps(stored, undefined)).toBe(stored);
    expect(mergeSteps(stored, [step('a', 'queued')])).toEqual([step('a', 'queued')]);
    expect(mergeSteps(stored, [step('a', 'running', { started_at: at(5) })])).toEqual([step('a', 'running', { started_at: at(5) })]);
  });

  it('is capped at the schema limit, so the stored run still validates', () => {
    const stored = Array.from({ length: 80 }, (_, i) => step(`old${i}`, 'pass'));
    const incoming = Array.from({ length: 80 }, (_, i) => step(`new${i}`, 'queued'));
    expect(mergeSteps(stored, incoming)).toHaveLength(100);
  });

  it('withMergedSteps: only for the same run', () => {
    const existing = withSteps(compatDoc({ run: { id: 'r1' } }), plan());
    const update = withSteps(compatDoc({ run: { id: 'r1' } }), [step('build', 'pass')]);
    expect(withMergedSteps(update, existing).run.steps).toHaveLength(7);
    const bare = withSteps(compatDoc({ run: { id: 'r1' } }), []);
    const { steps: _none, ...run } = bare.run;
    expect(withMergedSteps({ ...bare, run }, existing).run.steps).toHaveLength(7);
    expect(withMergedSteps(update, undefined)).toBe(update);
  });
});

describe('a run in progress', () => {
  const now = Date.parse(at(30));

  it('a finished stage verdict does not end the run while steps are still open', () => {
    // What cs2-dynamic.yml stores after the selftest stage, with the live test still to come.
    const steps = plan().map((s, i) => (i < 4 ? { ...s, status: 'pass' as const } : s));
    steps[4] = step('live-match', 'running', { stage: 'live', name: 'Live: match', started_at: at(25) });
    const doc = withSteps(compatDoc({ run: { state: 'warn', finished_at: at(24) }, overall: 'warn', checked_at: at(29) }), [
      ...steps.slice(0, 5),
      step('live-match.05', 'pass', { parent: 'live-match', name: 'warmup' }),
      step('live-match.06', 'running', { parent: 'live-match', name: 'knife: round running' }),
      ...steps.slice(5),
    ]);
    expect(runInProgress(doc, now)).toBe(true);
    expect(effectiveOverall(doc, now)).toBe('checking');
    expect(compatStatus(doc, now).overall).toBe('checking');
    expect(compatBadge(doc, now).message).toMatch(/^checking/);
    const progress = runProgress(doc, now);
    expect(progress).toMatchObject({ inProgress: true, total: 7, index: 5 });
    expect(progress.current?.name).toBe('Live: match');
    expect(progress.sub?.name).toBe('knife: round running');
  });

  it('while everything is queued, the next step is the current one', () => {
    const doc = withSteps(compatDoc({ run: { state: 'checking', finished_at: null }, overall: 'checking', checked_at: at(29) }), plan());
    expect(runProgress(doc, now)).toMatchObject({ inProgress: true, index: 1, total: 7, sub: null });
  });

  it('is over once every step is done, and the stage verdict shows again', () => {
    const done = plan().map((s) => ({ ...s, status: 'pass' as const }));
    const doc = withSteps(compatDoc({ overall: 'pass', checked_at: at(29) }), done);
    expect(runInProgress(doc, now)).toBe(false);
    expect(effectiveOverall(doc, now)).toBe('pass');
    expect(runProgress(doc, now)).toMatchObject({ inProgress: false, index: 0, current: null, total: 7 });
  });

  it('a run that stopped reporting long ago is not "in progress" forever', () => {
    const doc = withSteps(compatDoc({ overall: 'warn', checked_at: at(0) }), plan());
    expect(runInProgress(doc, Date.parse(at(0)) + COMPAT_STEPS_STALE_MS - 1)).toBe(true);
    expect(runInProgress(doc, Date.parse(at(0)) + COMPAT_STEPS_STALE_MS)).toBe(false);
    expect(effectiveOverall(doc, Date.parse(at(0)) + COMPAT_STEPS_STALE_MS)).toBe('warn');
  });

  it('without steps, the run state alone decides (older producers)', () => {
    expect(runInProgress(validateOk(compatDoc({ run: { state: 'checking' } })), now)).toBe(true);
    expect(runInProgress(validateOk(compatDoc()), now)).toBe(false);
  });
});

function validateOk(doc: TestCompatDoc): CompatDocument {
  const checked = validateCompatDocument(doc);
  if (!checked.ok) throw new Error(checked.errors.join('; '));
  return checked.value;
}
