/**
 * Test helper: a valid schema-1 compat.json to start from (ported from the
 * platform's tests/helpers/compat.ts). Only the tests import it.
 */

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

export interface TestCompatDoc {
  schema: number;
  cs2: { buildid: string; patch: string };
  readyup: { version: string; commit: string };
  run: { id: string; url: string; trigger: string; stage: string; state: string; started_at: string; finished_at: string | null };
  overall: string;
  components: Array<{
    id: string;
    name: string;
    status: string;
    checks: Array<{ kind: string; status: string; passed: number; total: number; failures: string[] }>;
  }>;
  checked_at: string;
}

let counter = 0;

/** A unique run id, so tests never collide with each other's runs. */
export function uniqueRunId(prefix = 'test'): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}

/**
 * A passing run started now: core (two checks) and match. Override any
 * top-level field; `run`, `cs2` and `readyup` are merged.
 */
export function compatDoc(overrides: DeepPartial<TestCompatDoc> = {}): TestCompatDoc {
  const now = new Date().toISOString();
  const base: TestCompatDoc = {
    schema: 1,
    cs2: { buildid: '25537370', patch: '1.41.8.5' },
    readyup: { version: '0.1.0-dev.a1b2c3d', commit: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678' },
    run: {
      id: uniqueRunId(),
      url: 'https://github.com/Auto-Tournament/ready-up/actions/runs/1',
      trigger: 'build_change',
      stage: 'static',
      state: 'pass',
      started_at: now,
      finished_at: now,
    },
    overall: 'pass',
    components: [
      {
        id: 'core',
        name: 'Core',
        status: 'pass',
        checks: [
          { kind: 'signature', status: 'pass', passed: 9, total: 9, failures: [] },
          { kind: 'vtable', status: 'pass', passed: 4, total: 4, failures: [] },
        ],
      },
      {
        id: 'match',
        name: 'Match',
        status: 'pass',
        checks: [{ kind: 'event', status: 'pass', passed: 12, total: 12, failures: [] }],
      },
    ],
    checked_at: now,
  };
  return {
    ...base,
    ...(overrides as Partial<TestCompatDoc>),
    cs2: { ...base.cs2, ...(overrides.cs2 ?? {}) },
    readyup: { ...base.readyup, ...(overrides.readyup ?? {}) },
    run: { ...base.run, ...(overrides.run ?? {}) } as TestCompatDoc['run'],
  };
}

/** What Ready Up's compat-report.py writes for a clean static run: core passes, the runtime-only plugins are pending. */
export function staticOkDoc(overrides: DeepPartial<TestCompatDoc> = {}): TestCompatDoc {
  const pending = { kind: 'selftest', status: 'pending', passed: 0, total: 0, failures: [] as string[] };
  const runtimeOnly = ['match', 'practice', 'essentials', 'midas', 'whitelist', 'fleet'];
  return {
    ...compatDoc({ overall: 'warn', ...overrides, run: { state: 'warn', ...(overrides.run ?? {}) } }),
    components: [
      {
        id: 'core',
        name: 'Core',
        status: 'pass',
        checks: [
          { kind: 'signature', status: 'pass', passed: 41, total: 41, failures: [] },
          { kind: 'rtti', status: 'pass', passed: 6, total: 6, failures: [] },
          { kind: 'vtable', status: 'pass', passed: 12, total: 12, failures: [] },
          { kind: 'hook_site', status: 'pass', passed: 9, total: 9, failures: [] },
          { kind: 'layout', status: 'pass', passed: 3, total: 3, failures: [] },
          pending,
        ],
      },
      {
        id: 'skins',
        name: 'Skins',
        status: 'pass',
        checks: [{ kind: 'signature', status: 'pass', passed: 5, total: 5, failures: [] }, pending],
      },
      ...runtimeOnly.map((id) => ({ id, name: id[0].toUpperCase() + id.slice(1), status: 'pending', checks: [pending] })),
    ],
  };
}
