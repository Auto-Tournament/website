import Box from '@mui/material/Box';
import { tokens } from '@/theme/tokens';
import { CodeBlock } from './CodeBlock';
import type { LicensePayload } from '@/lib/license/format';

const { color, radius } = tokens;

const kinds: Record<LicensePayload['kind'], string> = {
  event: 'One event',
  year: 'Yearly',
  founder: 'Founding supporter',
};

/** The license key with a copy button, and what it says. Used by the thanks page and /license. */
export function LicenseKeyView({
  token,
  license,
  reference,
  invoice,
}: {
  token: string;
  license: LicensePayload;
  reference?: string;
  invoice?: string | null;
}) {
  const rows: [string, string][] = [
    ['License', `${license.product === 'platform' ? 'Platform' : 'Servers'} ${license.pack}, up to ${license.max_servers} servers`],
    ['Period', kinds[license.kind]],
    ...(license.valid_from && license.valid_to ? ([['Event window', `${license.valid_from} to ${license.valid_to}`]] as [string, string][]) : []),
    ['Updates', license.updates_until === '9999-12-31' ? 'For life' : `Release lines up to ${license.updates_until}`],
    ...(license.licensee ? ([['Licensee', license.licensee]] as [string, string][]) : []),
    ['License id', license.id],
    ...(reference ? ([['Order reference', reference]] as [string, string][]) : []),
    ...(invoice ? ([['Invoice', invoice]] as [string, string][]) : []),
  ];
  return (
    <Box sx={{ mt: 3, display: 'grid', gap: 2 }}>
      <CodeBlock code={token} what="license key" size="sm" data-testid="license-key" />
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
    </Box>
  );
}
