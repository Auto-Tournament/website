/**
 * A scripted playoff: every tick moves the matches of one round forward (a map result or the end
 * of a series). Winners feed into the next round, the final crowns a
 * champion, then the whole thing resets and plays again.
 */

export type MatchId = 'qf1' | 'qf2' | 'qf3' | 'qf4' | 'sf1' | 'sf2' | 'f';
type Step = { m: MatchId; score?: [number, number]; done?: true };

const seeds: Partial<Record<MatchId, [string, string]>> = {
  qf1: ['Nordlys', 'Baltic Five'],
  qf2: ['Fjord', 'Polar'],
  qf3: ['Ironside', 'Kvarken'],
  qf4: ['Midnight', 'Tundra'],
};

/** Where each winner goes: [next match, slot]. */
const feeds: Partial<Record<MatchId, [MatchId, 0 | 1]>> = {
  qf1: ['sf1', 0],
  qf2: ['sf1', 1],
  qf3: ['sf2', 0],
  qf4: ['sf2', 1],
  sf1: ['f', 0],
  sf2: ['f', 1],
};

/**
 * One tick of the script. Every match in a round plays at the same time, so a
 * tick carries a map result for each of them; series end on different ticks.
 */
export const script: Step[][] = [
  // Quarterfinals: all four live at once.
  [{ m: 'qf1', score: [1, 0] }, { m: 'qf2', score: [0, 1] }, { m: 'qf3', score: [1, 0] }, { m: 'qf4', score: [1, 0] }],
  [{ m: 'qf1', score: [2, 0] }, { m: 'qf2', score: [1, 1] }, { m: 'qf3', score: [1, 1] }, { m: 'qf4', score: [2, 0] }],
  [{ m: 'qf1', done: true }, { m: 'qf4', done: true }, { m: 'qf2', score: [1, 2] }, { m: 'qf3', score: [2, 1] }],
  [{ m: 'qf2', done: true }, { m: 'qf3', done: true }],
  // Semifinals: both live.
  [{ m: 'sf1', score: [1, 0] }, { m: 'sf2', score: [0, 1] }],
  [{ m: 'sf1', score: [1, 1] }, { m: 'sf2', score: [1, 1] }],
  [{ m: 'sf1', score: [1, 2] }, { m: 'sf2', score: [2, 1] }],
  [{ m: 'sf1', done: true }, { m: 'sf2', done: true }],
  // Final.
  [{ m: 'f', score: [0, 1] }],
  [{ m: 'f', score: [1, 1] }],
  [{ m: 'f', score: [1, 2] }],
  [{ m: 'f', done: true }],
];

export const STEP_MS = 1800;
export const HOLD_MS = 3200;

export type MatchState = { teams: [string | null, string | null]; score: [number, number]; winner: 0 | 1 | null; live: boolean };
export type State = Record<MatchId, MatchState>;

const ids: MatchId[] = ['qf1', 'qf2', 'qf3', 'qf4', 'sf1', 'sf2', 'f'];

/**
 * One play-through as single updates with their own delays. Updates inside a
 * tick are shuffled and each waits a random 0.18–0.7 s, so scores don't land on
 * a beat; a round only ends after all its series are done, then pauses.
 */
export function buildRun(rand: () => number = Math.random): { ops: Step[]; delays: number[] } {
  const ops: Step[] = [];
  const delays: number[] = [];
  script.forEach((tick, i) => {
    const shuffled = [...tick].sort(() => rand() - 0.5);
    const nextIsNewRound = script[i + 1] && script[i + 1][0].m.slice(0, 2) !== tick[0].m.slice(0, 2);
    shuffled.forEach((op, j) => {
      ops.push(op);
      const lastOfRound = nextIsNewRound && j === shuffled.length - 1;
      delays.push(lastOfRound ? 1100 : 180 + Math.round(rand() * 520));
    });
  });
  return { ops, delays };
}

export function stateAfter(ops: Step[], count: number): State {
  return applyOps(ops.slice(0, count));
}

export function stateAt(stepCount: number): State {
  return applyOps(script.slice(0, stepCount).flat());
}

function applyOps(ops: Step[]): State {
  const s = Object.fromEntries(
    ids.map((id) => [id, { teams: seeds[id] ?? [null, null], score: [0, 0], winner: null, live: false }]),
  ) as unknown as State;
  for (const step of ops) {
    const match = s[step.m];
    if (step.score) {
      match.score = step.score;
      match.live = true;
    }
    if (step.done) {
      match.live = false;
      match.winner = match.score[0] > match.score[1] ? 0 : 1;
      const feed = feeds[step.m];
      if (feed) {
        const [next, slot] = feed;
        s[next].teams = slot === 0 ? [match.teams[match.winner], s[next].teams[1]] : [s[next].teams[0], match.teams[match.winner]];
      }
    }
  }
  return s;
}

