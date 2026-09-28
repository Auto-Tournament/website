import Box from '@mui/material/Box';
import { tokens } from '@/theme/tokens';
import { fontDisplay } from '@/theme/theme';

const { color, radius } = tokens;

export type Column = { key: string; label: string; align?: 'left' | 'right'; /** Hidden in the stacked (phone) layout when empty. */ wide?: boolean };

/**
 * A table that stays readable everywhere: a normal table from the small-tablet
 * width up (scrolling inside its own box when it must, never the page), and
 * stacked label/value rows on a phone.
 */
export function DataTable({
  columns,
  rows,
  empty = 'Nothing here yet.',
  label,
}: {
  columns: Column[];
  rows: { key: string; cells: Record<string, React.ReactNode> }[];
  empty?: string;
  label: string;
}) {
  if (rows.length === 0) return <Box sx={{ py: 2, color: color.muted }}>{empty}</Box>;
  return (
    <Box sx={{ overflowX: { sm: 'auto' }, maxWidth: '100%', border: { sm: `1px solid ${color.rule}` }, borderRadius: { sm: `${radius.md}px` } }}>
      <Box
        component="table"
        aria-label={label}
        sx={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '0.875rem',
          '& th': { textAlign: 'left', color: color.muted, fontWeight: 500, px: 1.5, py: 1, borderBottom: `1px solid ${color.rule}`, whiteSpace: 'nowrap', bgcolor: color.paper2 },
          '& td': { px: 1.5, py: 1.25, borderBottom: `1px solid ${color.rule}`, verticalAlign: 'top', color: color.ink2, overflowWrap: 'anywhere' },
          '& tbody tr:last-of-type td': { borderBottom: { sm: 'none' } },
          '& tbody tr:hover td': { bgcolor: { sm: color.paper2 } },
          '& a': { color: `${color.ink} !important` },
          // Phone: each row is a card of label/value lines.
          '@media (max-width: 599.95px)': {
            '& thead': { display: 'none' },
            '& tbody, & tr, & td': { display: 'block', width: '100%' },
            '& tr': { border: `1px solid ${color.rule}`, borderRadius: `${radius.md}px`, mb: 1.5, px: 1.5, py: 1, bgcolor: color.paper2 },
            '& td': { border: 'none', px: 0, py: 0.4, display: 'grid', gridTemplateColumns: '7.5rem 1fr', gap: 1 },
            '& td::before': { content: 'attr(data-label)', color: color.muted },
            '& td > *': { justifySelf: 'start' },
            '& td[data-empty="true"]': { display: 'none' },
          },
        }}
      >
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={c.align === 'right' ? { textAlign: 'right' } : undefined}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              {columns.map((c) => {
                const v = r.cells[c.key];
                const blank = v === null || v === undefined || v === '';
                return (
                  <td key={c.key} data-label={c.label} data-empty={blank ? 'true' : undefined} style={c.align === 'right' ? { textAlign: 'right' } : undefined}>
                    {blank ? '' : v}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </Box>
    </Box>
  );
}

const tones = {
  good: color.live,
  info: color.info,
  warn: color.warn,
  bad: color.ban,
  muted: color.muted,
} as const;
export type Tone = keyof typeof tones;

/** A small status pill. */
export function Badge({ tone = 'muted', children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        px: 1,
        py: 0.125,
        borderRadius: `${radius.pill}px`,
        border: `1px solid ${color.rule}`,
        fontSize: '0.8125rem',
        color: color.ink,
        whiteSpace: 'nowrap',
        '&::before': { content: '""', width: 7, height: 7, borderRadius: '50%', bgcolor: tones[tone], flexShrink: 0 },
      }}
    >
      {children}
    </Box>
  );
}

/** A number with its label, for the overview. */
export function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <Box sx={{ p: 2, border: `1px solid ${color.rule}`, borderRadius: `${radius.md}px`, bgcolor: color.paper2, minWidth: 0 }}>
      <Box sx={{ color: color.muted, fontSize: '0.8125rem' }}>{label}</Box>
      <Box sx={{ color: color.ink, fontFamily: fontDisplay, fontWeight: 600, fontSize: '1.375rem', mt: 0.5, overflowWrap: 'anywhere' }}>{value}</Box>
      {sub && <Box sx={{ color: color.muted, fontSize: '0.8125rem', mt: 0.25 }}>{sub}</Box>}
    </Box>
  );
}

/** A labelled progress bar (a <meter>-like div with the value in text too). */
export function Progress({ label, value, max, text }: { label: string; value: number; max: number; text: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const tone = pct >= 90 ? color.ban : pct >= 70 ? color.warn : color.live;
  return (
    <Box sx={{ minWidth: 0 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 1, fontSize: '0.875rem', mb: 0.75 }}>
        <Box sx={{ color: color.ink }}>{label}</Box>
        <Box sx={{ color: color.muted }}>{text}</Box>
      </Box>
      <Box
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.round(value)}
        aria-valuetext={text}
        sx={{ height: 10, borderRadius: `${radius.pill}px`, bgcolor: color.paper3, border: `1px solid ${color.rule}`, overflow: 'hidden' }}
      >
        <Box sx={{ width: `${pct}%`, height: '100%', bgcolor: tone }} />
      </Box>
    </Box>
  );
}

/** A section heading with optional actions on the right. */
export function SectionHead({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 1.5, mt: 5, mb: 1.5 }}>
      <Box component="h2" sx={{ m: 0, color: color.ink, fontSize: '1.125rem', fontWeight: 600 }}>
        {title}
      </Box>
      {children && <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, fontSize: '0.875rem' }}>{children}</Box>}
    </Box>
  );
}

/** A GET filter bar: plain form fields, so it works without JavaScript and the filter is in the URL. */
export function FilterBar({ children, action, label }: { children: React.ReactNode; action?: string; label?: string }) {
  return (
    <Box
      component="form"
      method="get"
      action={action}
      role={action ? undefined : 'search'}
      aria-label={label}
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 1,
        alignItems: 'center',
        mb: 2,
        '& input, & select': {
          font: 'inherit',
          fontSize: '0.9375rem',
          color: color.ink,
          bgcolor: color.paper2,
          border: `1px solid ${color.rule}`,
          borderRadius: `${radius.sm}px`,
          px: 1.25,
          py: 0.75,
          minWidth: 0,
          maxWidth: '100%',
        },
        '& input[type="search"], & input[type="text"]': { flex: '1 1 14rem' },
        '& label': { display: 'inline-flex', alignItems: 'center', gap: 0.75, fontSize: '0.875rem', color: color.muted },
        '& button': {
          font: 'inherit',
          fontSize: '0.9375rem',
          color: color.accentInk,
          bgcolor: color.accent,
          border: 'none',
          borderRadius: `${radius.sm}px`,
          px: 1.75,
          py: 0.8,
          cursor: 'pointer',
        },
      }}
    >
      {children}
    </Box>
  );
}

/** Muted small text. */
export function Muted({ children }: { children: React.ReactNode }) {
  return (
    <Box component="span" sx={{ color: color.muted, fontSize: '0.8125rem' }}>
      {children}
    </Box>
  );
}
