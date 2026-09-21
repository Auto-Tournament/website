import Box from '@mui/material/Box';
import { tokens } from '@/theme/tokens';
import { CardHead, LiveChip, ProductCard, mono } from '../ui';

const { color, radius } = tokens;

type Team = { name: string; score: string; result?: 'win' | 'lose' };
type Match = { teams: [Team, Team]; now?: boolean };

const rounds: { label: string; matches: Match[] }[] = [
  {
    label: 'Quarterfinals',
    matches: [
      { teams: [{ name: 'Nordlys', score: '2', result: 'win' }, { name: 'Baltic Five', score: '0', result: 'lose' }] },
      { teams: [{ name: 'Fjord', score: '1', result: 'lose' }, { name: 'Polar', score: '2', result: 'win' }] },
      { teams: [{ name: 'Ironside', score: '2', result: 'win' }, { name: 'Kvarken', score: '1', result: 'lose' }] },
      { teams: [{ name: 'Midnight', score: '2', result: 'win' }, { name: 'Tundra', score: '0', result: 'lose' }] },
    ],
  },
  {
    label: 'Semifinals',
    matches: [
      { now: true, teams: [{ name: 'Nordlys', score: '1' }, { name: 'Polar', score: '1' }] },
      { teams: [{ name: 'Ironside', score: '2', result: 'win' }, { name: 'Midnight', score: '1', result: 'lose' }] },
    ],
  },
  {
    label: 'Final',
    matches: [{ teams: [{ name: 'Winner SF1', score: '–', result: 'lose' }, { name: 'Ironside', score: '–', result: 'win' }] }],
  },
];

export function BracketCard() {
  return (
    <ProductCard aria-label="Example bracket">
      <CardHead title="Spring Cup · Playoffs" tag={<LiveChip />} />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0,1fr)', sm: 'repeat(3, minmax(0,1fr))' }, gap: 2, alignItems: 'center' }}>
        {rounds.map((round) => (
          <Box key={round.label} sx={{ display: 'grid', gap: 1.5 }}>
            <Box sx={{ ...mono, fontSize: '0.75rem', color: color.muted }}>{round.label}</Box>
            {round.matches.map((match, i) => (
              <Box
                key={i}
                sx={{
                  bgcolor: color.paper3,
                  borderRadius: `${radius.sm}px`,
                  overflow: 'hidden',
                  border: `1px solid ${match.now ? color.accent : 'transparent'}`,
                }}
              >
                {match.teams.map((team, j) => (
                  <Box
                    key={team.name}
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 1,
                      px: 1.25,
                      py: 0.75,
                      borderTop: j ? `1px solid ${color.rule}` : 0,
                      fontWeight: team.result === 'win' ? 600 : 400,
                      color: team.result === 'lose' ? color.muted : color.ink,
                    }}
                  >
                    <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {team.name}
                    </Box>
                    <Box component="span" sx={mono}>
                      {team.score}
                    </Box>
                  </Box>
                ))}
              </Box>
            ))}
          </Box>
        ))}
      </Box>
    </ProductCard>
  );
}
