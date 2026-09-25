import { getCompatLatest } from '@/lib/compat/service';
import { json, limitRead, readFailed, readHeaders } from '@/lib/compat/http';

// The newest Ready Up compatibility run with every component's checks, plus
// `source`, `received_at` and `updated_at`. `latest` is null until the first
// run arrives. Public.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const limited = limitRead(request);
  if (limited) return limited;
  try {
    return json(200, { success: true, latest: await getCompatLatest() }, readHeaders);
  } catch (err) {
    return readFailed('read the latest run', err);
  }
}
