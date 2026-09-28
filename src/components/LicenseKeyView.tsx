import Box from '@mui/material/Box';
import { tokens } from '@/theme/tokens';
import { CodeBlock } from './CodeBlock';
import { licenseDurationText, updatesText } from '@/lib/license/describe';
import type { LicensePayload } from '@/lib/license/format';

const { color, radius } = tokens;

/** The license key with a copy button, and what it says. Used by the thanks page and /license. */
export function LicenseKeyView({
  token,
  license,
  reference,
  invoice,
  checkUrl,
}: {
  token: string;
  license: LicensePayload;
  reference?: string;
  invoice?: string | null;
  /** The public /verify link for this license, shown with a copy button. */
  checkUrl?: string;
}) {
  const rows: [string, string][] = [
    ['License', `${license.product === 'platform' ? 'Platform' : 'Servers'} ${license.pack}, up to ${license.max_servers} servers`],
    ['License duration', licenseDurationText(license)],
    ['Updates', updatesText(license)],
    ...(license.licensee ? ([['Licensee', license.licensee]] as [string, string][]) : []),
    ['License id', license.id],
    ...(reference ? ([['Order reference', reference]] as [string, string][]) : []),
    ...(invoice ? ([['Invoice', invoice]] as [string, string][]) : []),
  ];
  return (
    <Box sx={{ mt: 3, display: 'grid', gap: 2 }}>
      <CodeBlock code={token} what="license key" size="sm" data-testid="license-key" />
      <DetailList rows={rows} />
      {checkUrl && <PublicCheckLink url={checkUrl} />}
    </Box>
  );
}

/** Label/value rows in a bordered box. */
export function DetailList({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <Box
      component="dl"
      sx={{
        m: 0,
        p: 2.5,
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: 'max-content 1fr' },
        columnGap: 3,
        rowGap: { xs: 0.25, sm: 1 },
        border: `1px solid ${color.rule}`,
        borderRadius: `${radius.lg}px`,
        bgcolor: color.paper2,
        fontSize: '0.9375rem',
        '& dt': { color: color.muted, mt: { xs: 1, sm: 0 } },
        '& dd': { m: 0, color: color.ink, overflowWrap: 'anywhere' },
      }}
    >
      {rows.map(([k, v]) => (
        <Box key={k} sx={{ display: 'contents' }}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </Box>
      ))}
    </Box>
  );
}

/** The public check link (/verify/<id>), to give to an event or client who wants to see the license is real. */
export function PublicCheckLink({ url }: { url: string }) {
  return (
    <Box>
      <Box sx={{ color: color.muted, fontSize: '0.875rem', mb: 0.75 }}>
        Public check link. Share it with anyone who needs to see the license is real: it shows the licensee, pack and period, never the key.
      </Box>
      <CodeBlock code={url} what="public check link" size="sm" />
    </Box>
  );
}
