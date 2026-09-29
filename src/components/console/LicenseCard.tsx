import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { tokens } from '@/theme/tokens';
import { LicenseKeyField } from '../LicenseKeyField';
import { DetailList, PublicCheckLink } from '../LicenseKeyView';
import { kindNames, licenseDurationText, packName, productContents, statusHint, statusText } from '@/lib/license/describe';
import type { LicensePayload } from '@/lib/license/format';
import type { Coverage, Version } from '@/lib/releases/versions';

const { color, radius } = tokens;

export type RepoCoverage = { repo: string; name: string; coverage: Coverage };

const label = (v: Version | null) => (v ? v.tag.replace(/^v/, '') : 'None');

function linesText(c: Coverage): string {
  if (c.lines.length === 0) return 'No releases yet';
  if (c.covered.length === 0) return 'None';
  const names = c.covered.map((l) => l.name);
  return names.length <= 4 ? names.join(', ') : `${names[0]} to ${names[names.length - 1]}`;
}

/** One license in the console: what it is, its status, the key, the public check link and the versions it covers. */
export function LicenseCard({
  license,
  token,
  reference,
  livemode,
  today,
  checkUrl,
  versions,
  children,
  usage,
}: {
  license: LicensePayload;
  token: string;
  reference: string;
  livemode: boolean;
  today: string;
  checkUrl: string;
  /** null: GitHub couldn't be read, so the section is hidden. */
  versions: RepoCoverage[] | null;
  /** Actions for this license (such as "Add to <org>"). */
  children?: React.ReactNode;
  /** Where the key is in use (the daily check-ins), shown last. */
  usage?: React.ReactNode;
}) {
  const hint = livemode ? statusHint(license, new Date(`${today}T00:00:00Z`)) : '';
  const rows: [string, React.ReactNode][] = [
    ['Licensee', license.licensee ?? 'Not given'],
    ['Pack', `${packName(license)}, up to ${license.max_servers} servers: ${productContents(license.product)}`],
    ['Kind', kindNames[license.kind]],
    ['License duration', licenseDurationText(license)],
    ['Status', livemode ? `${statusText(license, today)}${hint ? ` (${hint})` : ''}` : 'Test license (made in Stripe test mode, not valid for use)'],
    ['License id', license.id],
    ['Order reference', reference],
  ];
  const renew = license.kind === 'event' ? 'A new license is needed for' : license.kind === 'year' ? 'Renew yearly to get' : null;

  return (
    <Box component="section" aria-label={`License ${license.id}`} sx={{ mt: 4, pt: 4, borderTop: `1px solid ${color.rule}`, display: 'grid', gap: 2, minWidth: 0 }}>
      <Typography variant="h3" sx={{ m: '0 !important', fontSize: '1.25rem', color: color.ink, overflowWrap: 'anywhere' }}>
        {packName(license)}
        {license.licensee ? ` · ${license.licensee}` : ''}
      </Typography>
      {children}
      <DetailList rows={rows} />
      <Box>
        <Box sx={{ color: color.muted, fontSize: '0.875rem', mb: 0.75 }}>License key</Box>
        <LicenseKeyField token={token} />
      </Box>
      <PublicCheckLink url={checkUrl} />
      {versions && (
        <Box sx={{ p: 2.5, border: `1px solid ${color.rule}`, borderRadius: `${radius.lg}px` }}>
          <Typography sx={{ color: color.ink, fontWeight: 600, mb: 1 }}>Versions covered</Typography>
          <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 1 }}>
            {versions.map(({ repo, name, coverage: c }) => (
              <li key={repo}>
                <strong>{name}</strong>: {c.lines.length === 0 ? 'no releases yet.' : (
                  <>
                    lines {linesText(c)}. Newest covered: {label(c.newestCovered)}. Latest release: {label(c.latest)}.
                    {renew && c.firstUncovered && (
                      <>
                        {' '}
                        {renew} {c.firstUncovered.name} and later.
                      </>
                    )}
                  </>
                )}
              </li>
            ))}
          </Box>
        </Box>
      )}
      {usage}
    </Box>
  );
}
