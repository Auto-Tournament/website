import { COMPAT_HISTORY_LIMIT } from '@/lib/compat/store';
import { getCompatRuns } from '@/lib/compat/service';
import { json, limitRead, readFailed, readHeaders } from '@/lib/compat/http';

// Recent Ready Up compatibility runs, newest first, each with its components'
// statuses but not their checks. `?limit=` 1 to 200, default 20. Public.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_RUNS = 20;

export async function GET(request: Request) {
  const limited = limitRead(request);
  if (limited) return limited;
  let limit = DEFAULT_RUNS;
  const raw = new URL(request.url).searchParams.get('limit');
  if (raw !== null) {
    limit = /^\d{1,4}$/.test(raw) ? Number(raw) : NaN;
    if (!Number.isInteger(limit) || limit < 1 || limit > COMPAT_HISTORY_LIMIT) {
      return json(400, { success: false, error: `limit must be an integer from 1 to ${COMPAT_HISTORY_LIMIT}` });
    }
  }
  try {
    return json(200, { success: true, runs: await getCompatRuns(limit) }, readHeaders);
  } catch (err) {
    return readFailed('list runs', err);
  }
}
