'use client';

import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import { tokens } from '@/theme/tokens';
import { CardHead, LiveChip, ProductCard, mono, tickIn, useScript } from '../ui';

const { color, radius, ease } = tokens;

type Srv = { match?: string; state: 'free' | 'loading' | 'live' | 'done'; sub: string };

/**
 * Each frame is the full picture after one allocation tick: matches leave the
 * queue, servers load them, scores run, a finished server is freed and picks
 * up the next match.
 */
const frames: { servers: [Srv, Srv, Srv]; queue: string[] }[] = [
  {
    servers: [
      { state: 'free', sub: 'Idle · ready for a match' },
      { state: 'free', sub: 'Idle · ready for a match' },
      { state: 'free', sub: 'Idle · ready for a match' },
    ],
    queue: ['Nordlys vs Polar', 'Ironside vs Midnight', 'Fjord vs Kvarken', 'Tundra vs Baltic Five'],
  },
  {
    servers: [
      { match: 'Nordlys vs Polar', state: 'loading', sub: 'Loading config' },
      { state: 'free', sub: 'Idle · ready for a match' },
      { state: 'free', sub: 'Idle · ready for a match' },
    ],
    queue: ['Ironside vs Midnight', 'Fjord vs Kvarken', 'Tundra vs Baltic Five'],
  },
  {
    servers: [
      { match: 'Nordlys vs Polar', state: 'live', sub: 'Mirage · 0–0 · warmup' },
      { match: 'Ironside vs Midnight', state: 'loading', sub: 'Loading config' },
      { match: 'Fjord vs Kvarken', state: 'loading', sub: 'Loading config' },
    ],
    queue: ['Tundra vs Baltic Five'],
  },
  {
    servers: [
      { match: 'Nordlys vs Polar', state: 'live', sub: 'Mirage · 5–3 · round 9' },
      { match: 'Ironside vs Midnight', state: 'live', sub: 'Nuke · 1–0 · round 2' },
      { match: 'Fjord vs Kvarken', state: 'live', sub: 'Ancient · 0–0 · warmup' },
    ],
    queue: ['Tundra vs Baltic Five'],
  },
  {
    servers: [
      { match: 'Nordlys vs Polar', state: 'live', sub: 'Mirage · 11–7 · round 19' },
      { match: 'Ironside vs Midnight', state: 'live', sub: 'Nuke · 6–4 · round 11' },
      { match: 'Fjord vs Kvarken', state: 'live', sub: 'Ancient · 3–3 · round 7' },
    ],
    queue: ['Tundra vs Baltic Five'],
  },
  {
    servers: [
      { match: 'Nordlys vs Polar', state: 'done', sub: 'Nordlys win 13–9 · uploading demo' },
      { match: 'Ironside vs Midnight', state: 'live', sub: 'Nuke · 9–7 · round 17' },
      { match: 'Fjord vs Kvarken', state: 'live', sub: 'Ancient · 6–5 · round 12' },
    ],
    queue: ['Tundra vs Baltic Five'],
  },
  {
    servers: [
      { match: 'Tundra vs Baltic Five', state: 'loading', sub: 'Loading config' },
      { match: 'Ironside vs Midnight', state: 'live', sub: 'Nuke · 11–9 · round 21' },
      { match: 'Fjord vs Kvarken', state: 'live', sub: 'Ancient · 8–7 · round 16' },
    ],
    queue: [],
  },
  {
    servers: [
      { match: 'Tundra vs Baltic Five', state: 'live', sub: 'Dust II · 0–0 · warmup' },
      { match: 'Ironside vs Midnight', state: 'live', sub: 'Nuke · 12–10 · round 23' },
      { match: 'Fjord vs Kvarken', state: 'live', sub: 'Ancient · 10–8 · round 19' },
    ],
    queue: [],
  },
];

const dot = { free: color.muted, loading: color.accent, live: color.live, done: color.ink2 };

export function ServersCard() {
  const { ref, step } = useScript(frames.length - 1, { stepMs: 2000 });
  const frame = frames[step];
  const busy = frame.servers.filter((s) => s.state !== 'free').length;

  return (
    <ProductCard ref={ref} aria-label="Example server allocation playing through">
      <CardHead title="Servers" tag={<Chip size="small" label={`${busy} of 3 in use`} />} />
      <Box sx={{ display: 'grid', gap: 1 }}>
        {frame.servers.map((s, i) => (
          <Box
            key={i}
            sx={{
              display: 'grid',
              gridTemplateColumns: 'auto minmax(0,1fr) auto',
              gap: 2,
              alignItems: 'center',
              px: 1.75,
              py: 1.4,
              borderRadius: `${radius.md}px`,
              bgcolor: color.paper3,
              outline: `1px solid ${s.state === 'loading' ? color.accent : 'transparent'}`,
              transition: `outline-color 400ms ${ease.out}`,
            }}
          >
            <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: dot[s.state], transition: `background-color 400ms ${ease.out}` }} />
            <Box sx={{ minWidth: 0 }}>
              <Box key={s.match ?? 'idle'} sx={{ ...tickIn, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                cs2-{i + 1}
                {s.match ? ` · ${s.match}` : ''}
              </Box>
              <Box key={s.sub} sx={{ ...mono, ...tickIn, fontSize: '0.75rem', color: color.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.sub}
              </Box>
            </Box>
            {s.state === 'live' ? (
              <LiveChip />
            ) : (
              <Chip size="small" label={s.state === 'loading' ? 'Loading' : s.state === 'done' ? 'Finished' : 'Free'} color={s.state === 'done' ? 'primary' : 'default'} />
            )}
          </Box>
        ))}
      </Box>
      <Box key={frame.queue.join()} sx={{ ...tickIn, mt: 2, color: color.muted, fontSize: '0.75rem' }}>
        {frame.queue.length ? `Queue: ${frame.queue.join(' · ')}` : 'Queue empty · every match has a server'}
      </Box>
    </ProductCard>
  );
}
