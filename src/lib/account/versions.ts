/**
 * Which releases a license covers, from a repo's GitHub releases. Pure.
 *
 * Coverage is by version line (major.minor). A line's date is the release date
 * of its x.y.0; a line is covered when that date is on or before the
 * license's updates_until, and then every release of the line is (later
 * patches too). Pre-releases count only for a line that has no stable x.y.0
 * yet (a beta-only 3.0 is a line; once 3.0.0 is out, its betas are ignored).
 */

export type GithubRelease = { tag_name: string; published_at: string | null; prerelease: boolean; draft: boolean };

export type Version = { major: number; minor: number; patch: number; pre: string | null; tag: string; day: string };

export type Line = {
  /** "3.1" */
  name: string;
  major: number;
  minor: number;
  /** YYYY-MM-DD: when x.y.0 came out (or the line's first release when there is no x.y.0). */
  date: string;
  /** Newest release of the line. */
  newest: Version;
};

export type Coverage = {
  /** Every line, oldest first. */
  lines: Line[];
  covered: Line[];
  /** Newest release in a covered line. */
  newestCovered: Version | null;
  /** Newest release of all. */
  latest: Version | null;
  /** The first line after the covered ones that isn't covered ("3.2"), or null when all are. */
  firstUncovered: Line | null;
};

const VERSION = /^v?(\d{1,6})\.(\d{1,6})\.(\d{1,6})(?:-([0-9A-Za-z.-]{1,64}))?$/;

export function parseVersion(tag: string, publishedAt: string | null): Version | null {
  const m = VERSION.exec(tag.trim());
  if (!m || !publishedAt || !/^\d{4}-\d{2}-\d{2}/.test(publishedAt)) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] ?? null, tag: tag.trim(), day: publishedAt.slice(0, 10) };
}

function comparePre(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1; // a release is newer than its pre-releases
  if (b === null) return -1;
  const pa = a.split('.');
  const pb = b.split('.');
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if (pa[i] === undefined) return -1;
    if (pb[i] === undefined) return 1;
    const na = /^\d+$/.test(pa[i]) ? Number(pa[i]) : null;
    const nb = /^\d+$/.test(pb[i]) ? Number(pb[i]) : null;
    if (na !== null && nb !== null) {
      if (na !== nb) return na - nb;
    } else if (na !== null) return -1;
    else if (nb !== null) return 1;
    else if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}

export function compareVersions(a: Version, b: Version): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch || comparePre(a.pre, b.pre);
}

/** Groups releases into lines, oldest line first. Drafts and tags that aren't x.y.z are ignored. */
export function releaseLines(releases: readonly GithubRelease[]): Line[] {
  const byLine = new Map<string, Version[]>();
  for (const r of releases) {
    if (r.draft) continue;
    const v = parseVersion(r.tag_name, r.published_at);
    if (!v) continue;
    // GitHub's flag wins: a plain x.y.z marked pre-release is one.
    if (r.prerelease && v.pre === null) v.pre = 'pre';
    const key = `${v.major}.${v.minor}`;
    byLine.set(key, [...(byLine.get(key) ?? []), v]);
  }
  const lines: Line[] = [];
  for (const [name, all] of byLine) {
    const hasStableZero = all.some((v) => v.patch === 0 && v.pre === null);
    const versions = hasStableZero ? all.filter((v) => v.pre === null) : all;
    if (versions.length === 0) continue;
    const zeros = versions.filter((v) => v.patch === 0);
    const dated = (zeros.length > 0 ? zeros : versions).map((v) => v.day).sort();
    const newest = [...versions].sort(compareVersions).at(-1) as Version;
    lines.push({ name, major: newest.major, minor: newest.minor, date: dated[0], newest });
  }
  return lines.sort((a, b) => a.major - b.major || a.minor - b.minor);
}

/** What a license with this updates_until covers (YYYY-MM-DD, inclusive; 9999-12-31 for founder covers all). */
export function coverageFor(lines: readonly Line[], updatesUntil: string): Coverage {
  const covered = lines.filter((l) => l.date <= updatesUntil);
  const last = covered.at(-1);
  const newest = (list: readonly Line[]) => list.map((l) => l.newest).sort(compareVersions).at(-1) ?? null;
  const firstUncovered = lines.find((l) => l.date > updatesUntil && (!last || l.major > last.major || (l.major === last.major && l.minor > last.minor))) ?? null;
  return { lines: [...lines], covered, newestCovered: newest(covered), latest: newest(lines), firstUncovered };
}
