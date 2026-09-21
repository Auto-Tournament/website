import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import { tokens } from '@/theme/tokens';
import { fontDisplay } from '@/theme/theme';
import { ProductCard, mono } from '../ui';

const { color, radius } = tokens;

const stats = [
  { value: '1 842', label: 'Rating' },
  { value: '1.21', label: 'K/D' },
  { value: '86.4', label: 'ADR' },
  { value: '74%', label: 'KAST' },
];

export function ProfileCard() {
  return (
    <ProductCard aria-label="Example player profile">
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
        <Box
          aria-hidden
          sx={{ width: 56, height: 56, flex: 'none', borderRadius: `${radius.md}px`, bgcolor: color.accent, color: color.accentInk, display: 'grid', placeItems: 'center', fontFamily: fontDisplay, fontWeight: 700, fontSize: '1.375rem' }}
        >
          E
        </Box>
        <div>
          <Box sx={{ fontFamily: fontDisplay, fontWeight: 600, fontSize: '1.125rem' }}>elkjop_enjoyer</Box>
          <Box sx={{ color: color.muted }}>Nordlys · 14 tournaments</Box>
        </div>
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0,1fr))', sm: 'repeat(4, minmax(0,1fr))' }, gap: 1, mt: 3 }}>
        {stats.map((s) => (
          <Box key={s.label} sx={{ bgcolor: color.paper3, borderRadius: `${radius.sm}px`, p: 1.5 }}>
            <Box sx={{ ...mono, fontWeight: 600, fontSize: '1.125rem' }}>{s.value}</Box>
            <Box sx={{ color: color.muted, fontSize: '0.75rem' }}>{s.label}</Box>
          </Box>
        ))}
      </Box>
      <Box component="svg" viewBox="0 0 300 56" preserveAspectRatio="none" aria-hidden sx={{ display: 'block', width: '100%', height: 56, mt: 2 }}>
        <path d="M0 44 L30 40 L60 42 L90 34 L120 36 L150 26 L180 30 L210 20 L240 22 L270 12 L300 14" fill="none" stroke={color.accent} strokeWidth={2} />
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 2 }}>
        <Chip size="small" color="primary" label="Spring Cup 2026 · 1st" />
        <Chip size="small" label="Winter LAN · 3rd" />
        <Chip size="small" label="Most clutches" />
      </Box>
    </ProductCard>
  );
}
