'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import { tokens } from '@/theme/tokens';
import { CardHead, LiveChip, ProductCard, mono, useScript } from '../ui';
import { HOLD_MS, buildRun, script, stateAfter, type MatchId, type MatchState, type State } from './bracketScript';

const { color, radius, ease } = tokens;

function stageLabel(state: State) {
  if (state.f.winner !== null) return `Champion: ${state.f.teams[state.f.winner]}`;
  if (state.sf1.winner !== null && state.sf2.winner !== null) return 'Final';
  if ([state.qf1, state.qf2, state.qf3, state.qf4].every((m) => m.winner !== null)) return 'Semifinals';
  return 'Quarterfinals';
}

const OPS = script.flat().length;

export function BracketCard() {
  // A fresh random order and timing every loop. Only the order of updates is
  // random, and step 0 is the same for every order, so server and client
  // markup still match.
  const [loopKey, setLoopKey] = useState(0);
  const run = useMemo(() => buildRun(), [loopKey]);
  const delayFor = useCallback((i: number) => run.delays[i - 1] ?? 1200, [run]);
  const { ref, step, loop } = useScript(OPS, { holdMs: HOLD_MS, delayFor });
  useEffect(() => setLoopKey(loop), [loop]);
  const state = useMemo(() => stateAfter(run.ops, step), [run, step]);
  const finished = state.f.winner !== null;

  const rounds: { label: string; ids: MatchId[] }[] = [
    { label: 'Quarterfinals', ids: ['qf1', 'qf2', 'qf3', 'qf4'] },
    { label: 'Semifinals', ids: ['sf1', 'sf2'] },
    { label: 'Final', ids: ['f'] },
  ];

  return (
    <ProductCard ref={ref} aria-label="Example bracket playing through a tournament">
      <CardHead
        title={`Spring Cup · ${stageLabel(state)}`}
        tag={finished ? <Chip size="small" color="primary" label="Finished" /> : <LiveChip />}
      />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0,1fr)', sm: 'repeat(3, minmax(0,1fr))' }, gap: 2, alignItems: 'center' }}>
        {rounds.map((round) => (
          <Box key={round.label} sx={{ display: 'grid', gap: 1.5 }}>
            <Box sx={{ ...mono, fontSize: '0.75rem', color: color.muted }}>{round.label}</Box>
            {round.ids.map((id) => (
              <MatchBox key={id} match={state[id]} champion={id === 'f' && finished} />
            ))}
          </Box>
        ))}
      </Box>
    </ProductCard>
  );
}

const fade = `color 400ms ${ease.out}, background-color 400ms ${ease.out}, border-color 400ms ${ease.out}`;

function MatchBox({ match, champion }: { match: MatchState; champion: boolean }) {
  return (
    <Box
      sx={{
        bgcolor: color.paper3,
        borderRadius: `${radius.sm}px`,
        overflow: 'hidden',
        border: `1px solid ${match.live ? color.accent : 'transparent'}`,
        boxShadow: champion ? `0 0 0 1px ${color.accent}, 0 12px 40px -16px ${color.accent}` : 'none',
        transition: `${fade}, box-shadow 600ms ${ease.out}`,
      }}
    >
      {match.teams.map((team, j) => {
        const won = match.winner === j;
        const lost = match.winner !== null && !won;
        return (
          <Box
            key={j}
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 1,
              px: 1.25,
              py: 0.75,
              borderTop: j ? `1px solid ${color.rule}` : 0,
              fontWeight: won ? 600 : 400,
              color: team === null || lost ? color.muted : won ? color.accentInk : color.ink,
              bgcolor: won ? color.accent : 'transparent',
              transition: fade,
            }}
          >
            <Box
              component="span"
              key={team ?? 'tbd'}
              sx={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                animation: team ? `teamIn 500ms ${ease.out}` : 'none',
                '@keyframes teamIn': { from: { opacity: 0 }, to: { opacity: 1 } },
                '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
              }}
            >
              {team ?? 'TBD'}
            </Box>
            <Box
              component="span"
              key={`${team}-${match.score[j]}`}
              sx={{
                ...mono,
                animation: match.score[j] ? `scoreIn 350ms ${ease.out}` : 'none',
                '@keyframes scoreIn': { from: { opacity: 0, transform: 'translateY(-4px)' }, to: { opacity: 1, transform: 'none' } },
                '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
              }}
            >
              {team === null ? '–' : match.score[j]}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
