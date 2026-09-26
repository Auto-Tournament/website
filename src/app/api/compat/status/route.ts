import { compatStatus } from '@/lib/compat/document';
import { getCompatLatest } from '@/lib/compat/service';
import { json, limitRead, readFailed } from '@/lib/compat/http';

// The newest verdict in brief ({ overall, cs2, checked_at }, all null before
// the first run), for the status dot in the site nav. Public; cached for a
// minute like the badge, since every page view asks for it.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const limited = limitRead(request);
  if (limited) return limited;
  try {
    return json(200, { success: true, status: compatStatus(await getCompatLatest()) }, {
      'cache-control': 'public, max-age=60',
      'access-control-allow-origin': '*',
    });
  } catch (err) {
    return readFailed('read the status', err);
  }
}
