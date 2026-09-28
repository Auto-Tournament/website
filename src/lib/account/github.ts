import 'server-only';
import type { LicensePayload } from '@/lib/license/format';
import { releaseLines, type GithubRelease, type Line } from './versions';

/**
 * Release lines of the repos a license covers, from GitHub's public API (no
 * token, 60 requests an hour per IP). Cached in memory for an hour; a failure
 * (rate limit, network, GitHub down) is cached for 10 minutes and returns
 * null, and the page hides the "Versions covered" section.
 */

export const repoNames: Record<string, string> = {
  'Auto-Tournament/ready-up': 'Ready Up',
  'Auto-Tournament/cs2-server-manager': 'CS2 Server Manager',
  'Auto-Tournament/auto-tournament': 'Auto Tournament platform',
};

export function reposFor(product: LicensePayload['product']): string[] {
  const servers = ['Auto-Tournament/ready-up', 'Auto-Tournament/cs2-server-manager'];
  return product === 'platform' ? ['Auto-Tournament/auto-tournament', ...servers] : servers;
}

const OK_TTL = 60 * 60_000;
const ERROR_TTL = 10 * 60_000;
const cache = new Map<string, { at: number; lines: Line[] | null; pending?: Promise<Line[] | null> }>();

async function fetchLines(repo: string): Promise<Line[] | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=100`, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'autotournament.gg', 'x-github-api-version': '2022-11-28' },
      signal: AbortSignal.timeout(5_000),
      cache: 'no-store',
    });
    if (!res.ok) {
      console.warn('[account] GitHub releases unavailable', { repo, status: res.status });
      return null;
    }
    const data = (await res.json()) as unknown;
    if (!Array.isArray(data)) return null;
    const releases: GithubRelease[] = data
      .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
      .map((r) => ({
        tag_name: typeof r.tag_name === 'string' ? r.tag_name : '',
        published_at: typeof r.published_at === 'string' ? r.published_at : null,
        prerelease: r.prerelease === true,
        draft: r.draft === true,
      }));
    return releaseLines(releases);
  } catch (err) {
    console.warn('[account] GitHub releases unavailable', { repo }, err instanceof Error ? err.name : 'unknown error');
    return null;
  }
}

export async function repoLines(repo: string, now = Date.now()): Promise<Line[] | null> {
  const hit = cache.get(repo);
  if (hit?.pending) return hit.pending;
  if (hit && now - hit.at < (hit.lines ? OK_TTL : ERROR_TTL)) return hit.lines;
  const pending = fetchLines(repo).then((lines) => {
    cache.set(repo, { at: Date.now(), lines });
    return lines;
  });
  cache.set(repo, { at: hit?.at ?? 0, lines: hit?.lines ?? null, pending });
  return pending;
}
