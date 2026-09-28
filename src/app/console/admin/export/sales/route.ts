import { db } from '@/lib/db/client';
import { dbError } from '@/lib/db/errors';
import { audit } from '@/lib/console/audit';
import { limits } from '@/lib/console/limits';
import { currentAdmin } from '@/lib/admin/guard';
import { isDay } from '@/lib/admin/licenses';
import { salesBetween, salesCsv } from '@/lib/license/sales';
import { eurNokDailyRates, eurNokRate } from '@/lib/vat/rate';

// GET /admin/export/sales[?from=YYYY-MM-DD&to=YYYY-MM-DD]: paid sales as CSV
// for bookkeeping (src/lib/license/sales.ts). Admins only: anyone else gets
// the same 404 as an unknown path. Default: this calendar year so far. NOK
// amounts use Norges Bank's EUR/NOK rate of each sale's day.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const notFound = () => new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } });

export async function GET(request: Request) {
  const admin = await currentAdmin();
  if (!admin) return notFound();
  if (!limits.adminExport(admin.id, Date.now())) return new Response('Too many exports. Wait a few minutes.', { status: 429, headers: { 'cache-control': 'no-store' } });
  const url = new URL(request.url);
  const now = new Date();
  const fromRaw = url.searchParams.get('from') ?? '';
  const toRaw = url.searchParams.get('to') ?? '';
  const from = isDay(fromRaw) ? fromRaw : `${now.getUTCFullYear()}-01-01`;
  const to = isDay(toRaw) ? toRaw : now.toISOString().slice(0, 10);
  try {
    const [sales, daily, latest] = await Promise.all([
      salesBetween(db(), new Date(`${from}T00:00:00Z`), new Date(`${to}T23:59:59.999Z`)),
      eurNokDailyRates(from, to),
      eurNokRate(),
    ]);
    // Each sale at its own day's rate; the latest rate only when Norges Bank's history can't be read.
    const rateOn = (day: string) => daily?.rateOn(day) ?? latest.rate;
    await audit(db(), { actor: admin.id, action: 'admin.export_sales', details: { from, to, rows: sales.length, daily_rates: daily !== null } });
    return new Response(salesCsv(sales, rateOn), {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="auto-tournament-sales-${from}-to-${to}.csv"`,
        'cache-control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[admin] sales export failed', dbError(err));
    return new Response('Export failed', { status: 500, headers: { 'cache-control': 'no-store' } });
  }
}
