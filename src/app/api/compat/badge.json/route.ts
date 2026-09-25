import { compatBadge } from '@/lib/compat/document';
import { getCompatLatest } from '@/lib/compat/service';
import { json, limitRead, readFailed } from '@/lib/compat/http';

// A shields.io endpoint badge for the newest run:
// https://img.shields.io/endpoint?url=https://autotournament.gg/api/compat/badge.json
// "Ready Up" and the verdict with its CS2 patch, green, yellow, red, blue
// (checking) or grey. Public.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const limited = limitRead(request);
  if (limited) return limited;
  try {
    return json(200, compatBadge(await getCompatLatest()), {
      'cache-control': 'public, max-age=60',
      'access-control-allow-origin': '*',
    });
  } catch (err) {
    return readFailed('build the badge', err);
  }
}
