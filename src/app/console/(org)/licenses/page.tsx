import type { Metadata } from 'next';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { tokens } from '@/theme/tokens';
import { LicenseCard, type RepoCoverage } from '@/components/console/LicenseCard';
import { ActionButton } from '@/components/console/forms';
import { PageTitle, Panel } from '@/components/console/ConsoleShell';
import { db } from '@/lib/db/client';
import { formatDay, packName, todayUtc } from '@/lib/license/describe';
import type { LicenseRecord } from '@/lib/license/store';
import { licensesForOrg, unassignedLicenses, verifiedEmail } from '@/lib/console/orgs';
import { requireOrg } from '@/lib/console/session';
import { consoleHref } from '@/lib/console/urls';
import { repoLines, repoNames, reposFor } from '@/lib/releases/github';
import { coverageFor, type Line } from '@/lib/releases/versions';
import { siteUrl } from '@/lib/site';
import { claimLicenseAction } from '../../actions';

const { color } = tokens;

export const metadata: Metadata = { title: 'Licenses' };
export const dynamic = 'force-dynamic';

/** Lines per repo for these licenses; null when any repo couldn't be read (the section is hidden then). */
async function releaseLinesFor(records: LicenseRecord[]): Promise<Map<string, Line[]> | null> {
  const repos = [...new Set(records.flatMap((r) => reposFor(r.payload.product)))];
  const lines = await Promise.all(repos.map((repo) => repoLines(repo)));
  if (lines.some((l) => l === null)) return null;
  return new Map(repos.map((repo, i) => [repo, lines[i] as Line[]]));
}

function versionsFor(record: LicenseRecord, lines: Map<string, Line[]> | null): RepoCoverage[] | null {
  if (!lines) return null;
  return reposFor(record.payload.product).map((repo) => ({ repo, name: repoNames[repo] ?? repo, coverage: coverageFor(lines.get(repo) ?? [], record.payload.updates_until) }));
}

export default async function Licenses() {
  const { user, org } = await requireOrg();
  const [records, mine] = await Promise.all([licensesForOrg(db(), user.id, org.id), unassignedLicenses(db(), user)]);
  const lines = records.length > 0 ? await releaseLinesFor(records) : null;
  const site = siteUrl() ?? '';
  const today = todayUtc();

  return (
    <>
      <PageTitle
        sub={
          records.length > 0
            ? `${records.length} ${records.length === 1 ? 'license' : 'licenses'} for ${org.name}, newest first.`
            : `${org.name} has no licenses yet.`
        }
      >
        Licenses
      </PageTitle>

      {mine.length > 0 && (
        <Panel title="Licenses bought with your email">
          <Typography sx={{ mb: 2, fontSize: '0.9375rem' }}>
            These were bought with {verifiedEmail(user)} and aren&apos;t in an organization yet. Add them to {org.name} so its members see them too.
          </Typography>
          <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none', display: 'grid', gap: 2 }}>
            {mine.map((r) => (
              <Box
                component="li"
                key={r.session_id}
                data-testid="unassigned-license"
                sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, pt: 2, borderTop: `1px solid ${color.rule}` }}
              >
                <Box sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                  <Box sx={{ color: color.ink, fontWeight: 600 }}>
                    {packName(r.payload)}
                    {r.payload.licensee ? ` · ${r.payload.licensee}` : ''}
                    {!r.livemode ? ' · test' : ''}
                  </Box>
                  <Box sx={{ fontSize: '0.875rem', color: color.muted }}>
                    {r.payload.id} · bought {formatDay(r.payload.issued_at.slice(0, 10))}
                  </Box>
                </Box>
                <ActionButton action={claimLicenseAction} fields={{ orgId: org.id, sessionId: r.session_id }} label={`Add to ${org.name}`} pendingLabel="Adding…" />
              </Box>
            ))}
          </Box>
        </Panel>
      )}

      {records.length === 0 && mine.length === 0 && (
        <Typography sx={{ maxWidth: '62ch' }}>
          Licenses bought from the <a href={consoleHref('/buy')}>Buy</a> page land here. Bought one as a guest? Sign in with the email you paid with, and it shows up
          here to add.
        </Typography>
      )}

      {records.map((r) => (
        <LicenseCard
          key={r.session_id}
          license={r.payload}
          token={r.token}
          reference={r.session_id}
          livemode={r.livemode}
          today={today}
          checkUrl={`${site}/verify/${r.payload.id}`}
          versions={versionsFor(r, lines)}
        />
      ))}
    </>
  );
}
