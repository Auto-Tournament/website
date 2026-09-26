import { COMPAT_LIMITS, type CompatDocument, type CompatOverall, type CompatStep } from './document';

/**
 * The steps of a run (`run.steps`), as Ready Up's CI reports them while it
 * goes: which one is running, how far along the run is, and whether it is
 * still going at all. Pure, like document.ts: the store merges with it and
 * the page renders with it.
 */

/** Steps still waiting or running. */
const OPEN: ReadonlySet<CompatStep['status']> = new Set(['queued', 'running']);

/**
 * A run whose steps say "still going" but that has not reported for this long
 * is treated as over (its CI job died without saying so). Longer than the
 * whole dynamic workflow can take (build 40 min + live job 90 min).
 */
export const COMPAT_STEPS_STALE_MS = 3 * 60 * 60_000;

/**
 * One step updated by a newer copy of it. A step queued again (a re-run)
 * starts over; a running one keeps when it started unless it says otherwise;
 * a finished one keeps anything the newer copy leaves out.
 */
function mergeStep(prev: CompatStep | undefined, next: CompatStep): CompatStep {
  if (!prev || next.status === 'queued') return next;
  if (next.status === 'running') {
    const { finished_at: _f, detail: _d, ...kept } = prev;
    return { ...kept, ...next };
  }
  return { ...prev, ...next };
}

/**
 * The stored steps of a run updated by the steps of a newer copy of it. Steps
 * in both are merged (the newer copy wins), steps only in the newer copy come
 * in its order, and steps only in the stored copy are never lost: each stays
 * right after the step it followed before. Capped at `COMPAT_LIMITS.steps`.
 */
export function mergeSteps(stored: CompatStep[] | undefined, incoming: CompatStep[] | undefined): CompatStep[] | undefined {
  if (!incoming) return stored;
  if (!stored || stored.length === 0) return incoming.slice(0, COMPAT_LIMITS.steps);

  const before = new Map(stored.map((s) => [s.id, s]));
  const result = incoming.map((s) => mergeStep(before.get(s.id), s));
  const incomingIds = new Set(incoming.map((s) => s.id));

  let anchor = -1; // Index in `result` of the last stored step placed so far.
  for (const s of stored) {
    if (incomingIds.has(s.id)) {
      anchor = result.findIndex((r) => r.id === s.id);
    } else {
      result.splice(anchor + 1, 0, s);
      anchor += 1;
    }
  }
  return result.slice(0, COMPAT_LIMITS.steps);
}

/** `doc` with its steps merged into the ones stored for the same run (`existing`). */
export function withMergedSteps(doc: CompatDocument, existing: CompatDocument | undefined): CompatDocument {
  if (!existing || existing.run.id !== doc.run.id) return doc;
  const steps = mergeSteps(existing.run.steps, doc.run.steps);
  if (steps === doc.run.steps) return doc;
  const { steps: _drop, ...run } = doc.run;
  return { ...doc, run: steps ? { ...run, steps } : run };
}

/** Steps shown at the top level: no parent, or a parent that is not in the list. */
export function topLevelSteps(steps: CompatStep[]): CompatStep[] {
  const ids = new Set(steps.map((s) => s.id));
  return steps.filter((s) => !s.parent || !ids.has(s.parent));
}

/** Whether the run is still going: it says so (queued, checking), or one of its steps is open and it reported recently. */
export function runInProgress(doc: Pick<CompatDocument, 'run' | 'checked_at'>, now = Date.now()): boolean {
  if (doc.run.state === 'queued' || doc.run.state === 'checking') return true;
  const steps = doc.run.steps ?? [];
  if (!steps.some((s) => OPEN.has(s.status))) return false;
  const checked = Date.parse(doc.checked_at);
  return Number.isFinite(checked) && now - checked < COMPAT_STEPS_STALE_MS;
}

/** The verdict to show for a run: "checking" while it is still going, whatever a finished stage said. */
export function effectiveOverall(doc: Pick<CompatDocument, 'run' | 'checked_at' | 'overall'>, now = Date.now()): CompatOverall {
  return runInProgress(doc, now) ? 'checking' : doc.overall;
}

export interface CompatProgress {
  inProgress: boolean;
  /** Top-level steps. */
  total: number;
  /** 1-based position of `current` among the top-level steps; 0 when there is none. */
  index: number;
  /** The top-level step running now, else the next one queued (only while in progress). */
  current: CompatStep | null;
  /** The running step nested under `current` (a live test step), if any. */
  sub: CompatStep | null;
}

/** Where a run is: "step 4 of 7: Boot + selftest". */
export function runProgress(doc: Pick<CompatDocument, 'run' | 'checked_at'>, now = Date.now()): CompatProgress {
  const inProgress = runInProgress(doc, now);
  const steps = doc.run.steps ?? [];
  const top = topLevelSteps(steps);
  let current: CompatStep | null = null;
  if (inProgress) {
    current = top.find((s) => s.status === 'running') ?? top.find((s) => s.status === 'queued') ?? null;
  }
  const sub = current
    ? (steps.filter((s) => s.parent === current.id && s.status === 'running').at(-1) ?? null)
    : null;
  return { inProgress, total: top.length, index: current ? top.indexOf(current) + 1 : 0, current, sub };
}
