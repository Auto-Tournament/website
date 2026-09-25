import type {
  CompatCheckKind,
  CompatCheckStatus,
  CompatComponentStatus,
  CompatOverall,
  CompatRunState,
  CompatStage,
  CompatTrigger,
} from '@/lib/compat/document';

/**
 * Words for the compatibility page. English only, like the rest of the site;
 * ported from the platform's compat.json translations. A clean static run is
 * `warn` until Ready Up's live-server stage exists, so it reads "Static check
 * OK" here, as on Ready Up's own badge ("static ok").
 */

export const overallLabel: Record<CompatOverall, string> = {
  pass: 'Compatible',
  warn: 'Static check OK',
  fail: 'Not compatible',
  checking: 'Checking…',
  no_verdict: 'No verdict',
};

export const overallHint: Record<CompatOverall, string> = {
  pass: 'Every component passed every check on this build.',
  warn: 'Everything Ready Up needs from the engine is still there on this build. The live server check is still pending.',
  fail: 'At least one component does not work on this build. Hold off on updating your servers.',
  checking: 'A CS2 build is being checked right now. This page updates by itself when the result is in.',
  no_verdict: 'The last check broke before it reached a verdict. The next run tries again.',
};

export const componentStatusLabel: Record<CompatComponentStatus, string> = {
  pass: 'Pass',
  warn: 'Warning',
  fail: 'Fail',
  pending: 'Pending',
  checking: 'Checking…',
};

export const checkStatusLabel: Record<CompatCheckStatus, string> = {
  pass: 'Pass',
  warn: 'Warning',
  fail: 'Fail',
  pending: 'Pending',
};

export const stageLabel: Record<CompatStage, string> = {
  static: 'Static check',
  selftest: 'Self-test',
  live: 'Live server',
};

export const stateLabel: Record<CompatRunState, string> = {
  queued: 'Queued',
  checking: 'Checking',
  pass: 'Passed',
  warn: 'Static OK',
  fail: 'Failed',
  no_verdict: 'No verdict',
};

export const triggerLabel: Record<CompatTrigger, string> = {
  build_change: 'New CS2 build',
  surface_change: 'Game data changed',
  nightly: 'Nightly',
  release: 'Ready Up release',
  manual: 'Manual run',
};

export const kindLabel: Record<CompatCheckKind, string> = {
  signature: 'Signatures',
  rtti: 'RTTI',
  vtable: 'Virtual tables',
  hook_site: 'Hook sites',
  layout: 'Memory layout',
  schema: 'Schema',
  event: 'Game events',
  selftest: 'Self-test',
  livetest: 'Live test',
};

/** CS2 patch when known, else the build id (a queued run has no patch yet). */
export function cs2Label(cs2: { buildid: string; patch: string }): string {
  return cs2.patch ? `CS2 ${cs2.patch}` : `CS2 build ${cs2.buildid}`;
}

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'} ago`;

/**
 * "3 minutes ago", counted from `now`. Built by hand rather than with Intl, so
 * the server and every browser render exactly the same text (no hydration
 * mismatch).
 */
export function relativeTime(iso: string, now: number): string {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (!Number.isFinite(seconds) || seconds < 45) return 'just now';
  if (seconds < 3600) return plural(Math.max(1, Math.floor(seconds / 60)), 'minute');
  if (seconds < 86_400) return plural(Math.floor(seconds / 3600), 'hour');
  return plural(Math.floor(seconds / 86_400), 'day');
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "25 Sep 2026, 12:00 UTC": the same everywhere, unlike toLocaleString. */
export function utcTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}
