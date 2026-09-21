'use client';

import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import { tokens } from '@/theme/tokens';
import { CardHead, LiveChip, ProductCard, mono, tickIn, useScript } from '../ui';

const { color, radius, ease } = tokens;

const pool = ['Vertigo', 'Anubis', 'Mirage', 'Inferno', 'Nuke', 'Ancient', 'Dust II'];

/** Bo3 veto: ban, ban, pick, pick, ban, ban, and the last map is the decider. */
const turns: { team: 'Nordlys' | 'Polar'; action: 'ban' | 'pick'; map: string }[] = [
  { team: 'Nordlys', action: 'ban', map: 'Vertigo' },
  { team: 'Polar', action: 'ban', map: 'Anubis' },
  { team: 'Nordlys', action: 'pick', map: 'Mirage' },
  { team: 'Polar', action: 'pick', map: 'Inferno' },
  { team: 'Nordlys', action: 'ban', map: 'Nuke' },
  { team: 'Polar', action: 'ban', map: 'Ancient' },
];

// Steps: 0..5 are turns, 6 locks the maps (last one is the decider), 7 loads them.
const LENGTH = turns.length + 1;

export function VetoCard() {
  const { ref, step } = useScript(LENGTH, { stepMs: 1800 });
  const done = turns.slice(0, Math.min(step, turns.length));
  const byMap = new Map(done.map((t) => [t.map, t]));
  const locked = step >= turns.length;
  const loading = step >= turns.length + 1;
  const current = turns[step];
  // Play order: picks in the order they were made, then the decider.
  const picks = done.filter((t) => t.action === 'pick').map((t) => t.map);

  return (
    <ProductCard ref={ref} aria-label="Example map veto playing through">
      <CardHead
        title="Nordlys vs Polar · Bo3"
        tag={locked ? <Chip size="small" color="primary" label="Maps locked" /> : <Chip size="small" label={`Turn ${Math.min(step + 1, turns.length)} of ${turns.length}`} />}
      />
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 1 }}>
        {pool.map((name) => {
          const t = byMap.get(name);
          const decider = locked && !t;
          const state = t?.action ?? (decider ? 'pick' : 'open');
          return (
            <Box
              key={name}
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 1,
                px: 1.5,
                py: 1.2,
                borderRadius: `${radius.sm}px`,
                bgcolor: color.paper3,
                outline: `1px solid ${state === 'pick' ? color.pick : current?.map === name ? color.rule : 'transparent'}`,
                color: state === 'ban' ? color.ban : state === 'pick' ? color.pick : color.ink,
                transition: `color 400ms ${ease.out}, outline-color 400ms ${ease.out}`,
              }}
            >
              <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, textDecoration: state === 'ban' ? 'line-through' : 'none', textDecorationThickness: '2px' }}>
                {state === 'pick' && (
                  <Box
                    component="span"
                    key={`${name}-n`}
                    aria-label={`Map ${decider ? picks.length + 1 : picks.indexOf(name) + 1}`}
                    sx={{ ...mono, ...tickIn, display: 'inline-grid', placeItems: 'center', width: 20, height: 20, flex: 'none', borderRadius: '50%', bgcolor: color.pick, color: color.accentInk, fontSize: '0.7rem', fontWeight: 600 }}
                  >
                    {decider ? picks.length + 1 : picks.indexOf(name) + 1}
                  </Box>
                )}
                {name}
              </Box>
              <Box
                component="span"
                key={`${name}-${state}`}
                sx={{ ...mono, ...(state !== 'open' ? tickIn : {}), fontSize: '0.75rem', color: state === 'pick' ? color.pick : state === 'ban' ? color.ban : color.muted, whiteSpace: 'nowrap' }}
              >
                {t ? `${t.team} ${t.action}` : decider ? 'decider' : 'open'}
              </Box>
            </Box>
          );
        })}
      </Box>
      <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1.5, px: 2, py: 1.5, borderRadius: `${radius.md}px`, bgcolor: color.paper3, minHeight: 58 }}>
        {current ? (
          <Box key={step} sx={{ flex: 1, ...tickIn }}>
            <div>
              {current.team} to {current.action}
            </div>
            <Box sx={{ height: 4, borderRadius: 4, bgcolor: color.rule, overflow: 'hidden', mt: 1 }}>
              <Box
                sx={{
                  height: '100%',
                  bgcolor: color.accent,
                  width: '100%',
                  transformOrigin: 'left',
                  animation: `countdown 1800ms linear forwards`,
                  '@keyframes countdown': { from: { transform: 'scaleX(1)' }, to: { transform: 'scaleX(0.35)' } },
                  '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
                }}
              />
            </Box>
          </Box>
        ) : (
          <Box key={loading ? 'load' : 'lock'} sx={{ flex: 1, ...tickIn }}>
            {loading ? 'Loading Mirage, Inferno, Dust II on cs2-1' : 'Veto done. Sides picked by knife round.'}
          </Box>
        )}
        {current ? <Chip size="small" label="0:18" /> : loading ? <LiveChip label="Loading" /> : <Chip size="small" label="Done" />}
      </Box>
    </ProductCard>
  );
}
