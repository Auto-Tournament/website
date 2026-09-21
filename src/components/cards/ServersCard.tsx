import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import { tokens } from '@/theme/tokens';
import { CardHead, LiveChip, ProductCard, mono } from '../ui';

const { color, radius } = tokens;

const servers = [
  { name: 'cs2-1 · Nordlys vs Polar', sub: 'Mirage · 9–7 · round 17', state: 'live' as const },
  { name: 'cs2-2 · Ironside vs Midnight', sub: 'Loading config', state: 'loading' as const },
  { name: 'cs2-3', sub: 'Idle · ready for the next match', state: 'free' as const },
];

const dot = { live: color.live, loading: color.accent, free: color.muted };

export function ServersCard() {
  return (
    <ProductCard aria-label="Example server list">
      <CardHead title="Servers" tag={<Chip size="small" label="3 of 3 online" />} />
      <Box sx={{ display: 'grid', gap: 1 }}>
        {servers.map((s) => (
          <Box
            key={s.name}
            sx={{ display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr) auto', gap: 2, alignItems: 'center', px: 1.75, py: 1.4, borderRadius: `${radius.md}px`, bgcolor: color.paper3 }}
          >
            <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: dot[s.state] }} />
            <div>
              <div>{s.name}</div>
              <Box sx={{ ...mono, fontSize: '0.75rem', color: color.muted }}>{s.sub}</Box>
            </div>
            {s.state === 'live' ? <LiveChip /> : <Chip size="small" label={s.state === 'loading' ? 'Loading' : 'Free'} />}
          </Box>
        ))}
      </Box>
      <Box sx={{ mt: 2, color: color.muted, fontSize: '0.75rem' }}>Next in queue: Fjord vs Kvarken (lower bracket)</Box>
    </ProductCard>
  );
}
