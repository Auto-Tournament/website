import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import { tokens } from '@/theme/tokens';
import { CardHead, ProductCard, mono } from '../ui';

const { color, radius } = tokens;

const maps: { name: string; state: 'ban' | 'pick' | 'open'; by?: string }[] = [
  { name: 'Vertigo', state: 'ban', by: 'Nordlys ban' },
  { name: 'Anubis', state: 'ban', by: 'Polar ban' },
  { name: 'Mirage', state: 'pick', by: 'Nordlys pick' },
  { name: 'Inferno', state: 'pick', by: 'Polar pick' },
  { name: 'Nuke', state: 'open' },
  { name: 'Ancient', state: 'open' },
  { name: 'Dust II', state: 'open' },
];

export function VetoCard() {
  return (
    <ProductCard aria-label="Example map veto">
      <CardHead title="Nordlys vs Polar · Bo3" tag={<Chip size="small" label="Veto 5 of 7" />} />
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 1 }}>
        {maps.map((m) => (
          <Box
            key={m.name}
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 1,
              px: 1.5,
              py: 1.2,
              borderRadius: `${radius.sm}px`,
              bgcolor: color.paper3,
              outline: m.state === 'pick' ? `1px solid ${color.accent}` : 'none',
              color: m.state === 'ban' ? color.muted : color.ink,
            }}
          >
            <Box component="span" sx={{ textDecoration: m.state === 'ban' ? 'line-through' : 'none' }}>
              {m.name}
            </Box>
            <Box component="span" sx={{ ...mono, fontSize: '0.75rem', color: m.state === 'pick' ? color.accent : color.muted }}>
              {m.by ?? 'open'}
            </Box>
          </Box>
        ))}
      </Box>
      <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1.5, px: 2, py: 1.5, borderRadius: `${radius.md}px`, bgcolor: color.paper3 }}>
        <Box sx={{ flex: 1 }}>
          <div>Nordlys to ban</div>
          <Box sx={{ height: 4, borderRadius: 4, bgcolor: color.rule, overflow: 'hidden', mt: 1 }}>
            <Box sx={{ height: '100%', width: '62%', bgcolor: color.accent }} />
          </Box>
        </Box>
        <Chip size="small" label="0:18" />
      </Box>
    </ProductCard>
  );
}
