import { db } from '@/lib/db/client';
import { dbError } from '@/lib/db/errors';
import { audit } from '@/lib/console/audit';
import { limits } from '@/lib/console/limits';
import { currentAdmin } from '@/lib/admin/guard';
import { approvalError, gateFor } from '@/lib/admin/approval';
import { sameOrigin } from '@/lib/site';
import { consoleOrigin } from '@/lib/console/urls';
import { isDay } from '@/lib/admin/licenses';
import { salesBetween, salesCsv } from '@/lib/license/sales';
import { eurNokDailyRates, eurNokRate } from '@/lib/vat/rate';

// POST /admin/export/sales (form: from, to as YYYY-MM-DD, passkey): paid
// sales as CSV for bookkeeping (src/lib/license/sales.ts). Admins only:
// anyone else gets the same 404 as an unknown path. Same-origin only, the
// passkey gate passed, and a fresh passkey approval of 'export.sales' (the
// Export button gets it). Default: this calendar year so far. NOK amounts use
// Norges Bank's EUR/NOK rate of each sale's day.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const notFound = () => new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } });

const refuse = (status: number, body: string) => new Response(body, { status, headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' } });

export async function POST(request: Request) {
  const admin = await currentAdmin();
  if (!admin) return notFound();
  if (!sameOrigin(request.headers, consoleOrigin())) return refuse(403, 'Forbidden.');
  if ((await gateFor(admin)) !== 'ok') return refuse(403, 'Check your passkey on the admin page first.');
  if (!limits.adminExport(admin.id, Date.now())) return refuse(429, 'Too many exports. Wait a few minutes.');
  const fd = await request.formData().catch(() => new FormData());
  const approval = await approvalError(admin, 'export.sales', 'sales', fd);
  if (approval) return refuse(403, approval);
  const now = new Date();
  const fromRaw = String(fd.get('from') ?? '').slice(0, 10);
  const toRaw = String(fd.get('to') ?? '').slice(0, 10);
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
