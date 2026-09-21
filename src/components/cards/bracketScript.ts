/**
 * A scripted playoff: every step changes one match (a map result or the end
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

const series = (m: MatchId, maps: [number, number][]): Step[] => [...maps.map((score) => ({ m, score })), { m, done: true }];

export const script: Step[] = [
  ...series('qf1', [[1, 0], [2, 0]]),
  ...series('qf2', [[0, 1], [1, 1], [1, 2]]),
  ...series('qf3', [[1, 0], [1, 1], [2, 1]]),
  ...series('qf4', [[1, 0], [2, 0]]),
  ...series('sf1', [[1, 0], [1, 1], [1, 2]]),
  ...series('sf2', [[0, 1], [1, 1], [2, 1]]),
  ...series('f', [[0, 1], [1, 1], [1, 2]]),
];

export const STEP_MS = 1300;
export const HOLD_MS = 4500;

export type MatchState = { teams: [string | null, string | null]; score: [number, number]; winner: 0 | 1 | null; live: boolean };
export type State = Record<MatchId, MatchState>;

const ids: MatchId[] = ['qf1', 'qf2', 'qf3', 'qf4', 'sf1', 'sf2', 'f'];

export function stateAt(stepCount: number): State {
  const s = Object.fromEntries(
    ids.map((id) => [id, { teams: seeds[id] ?? [null, null], score: [0, 0], winner: null, live: false }]),
  ) as unknown as State;
  for (const step of script.slice(0, stepCount)) {
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

