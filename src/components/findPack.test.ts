import { describe, expect, it } from 'vitest';
import { validateCheckoutRequest } from '../lib/checkout';
import { FALLBACK_PACKS } from './pricing';
import {
  checkoutPayload,
  headline,
  jobOptions,
  packGames,
  parseAnswers,
  previousStep,
  priceTip,
  recommend,
  resolveStep,
  serversFromTeams,
  stepsFor,
  toQuery,
  whyThisSize,
  type Answers,
  type Context,
} from './findPack';

const ctx: Context = { packs: FALLBACK_PACKS, founderOpen: true };
const closed: Context = { packs: FALLBACK_PACKS, founderOpen: false };
const q = (s: string) => parseAnswers(new URLSearchParams(s));
const rec = (s: string, c: Context = ctx) => recommend(q(s).answers, c);

describe('parseAnswers / toQuery', () => {
  it('reads a shared link and a plain form the same way', () => {
    expect(q('g=cs2,valorant&do=servers').answers.games).toEqual(['cs2', 'valorant']);
    expect(q('g=cs2&g=valorant').answers.games).toEqual(['cs2', 'valorant']);
  });

  it('drops unknown values', () => {
    const { answers, at } = q('g=cs2,nope&do=everything&money=maybe&servers=-3&freq=weekly&at=nowhere');
    expect(answers).toEqual({ games: ['cs2'], job: undefined, money: undefined, servers: undefined, freq: undefined });
    expect(at).toBeUndefined();
  });

  it('round-trips', () => {
    const a: Answers = { games: ['cs2'], job: 'platform', money: 'yes', servers: 8, freq: 'event' };
    const query = toQuery(a, 'result');
    expect(query).toBe('g=cs2&do=platform&money=yes&servers=8&freq=event&at=result');
    expect(q(query)).toEqual({ answers: a, at: 'result' });
  });

  it('reads a server-side searchParams object', () => {
    expect(parseAnswers({ g: ['cs2', 'chess'], servers: '12' }).answers).toMatchObject({ games: ['cs2', 'chess'], servers: 12 });
  });
});

describe('steps', () => {
  it('asks what it should do only when CS2 is the only game', () => {
    expect(jobOptions(q('g=cs2').answers)).toEqual(['plugin', 'servers', 'platform']);
    expect(jobOptions(q('g=valorant').answers)).toEqual(['platform']);
    expect(jobOptions(q('g=cs2,valorant').answers)).toEqual(['platform']);
    expect(jobOptions(q('g=other').answers)).toEqual(['platform']);
  });

  it('skips servers for games that run on no server of ours', () => {
    expect(stepsFor(q('g=valorant').answers, ctx)).toEqual(['games', 'money', 'freq', 'result']);
    expect(stepsFor(q('g=cs2&do=servers').answers, ctx)).toEqual(['games', 'job', 'money', 'servers', 'freq', 'result']);
  });

  it('stops after the plugin, after "no money" and above the biggest pack', () => {
    expect(stepsFor(q('g=cs2&do=plugin').answers, ctx)).toEqual(['games', 'job', 'result']);
    expect(stepsFor(q('g=cs2&do=platform&money=no').answers, ctx)).toEqual(['games', 'job', 'money', 'result']);
    expect(stepsFor(q('g=cs2&do=platform&money=yes&servers=41').answers, ctx)).toEqual(['games', 'job', 'money', 'servers', 'result']);
  });

  it('starts at the first open question', () => {
    expect(resolveStep(q('').answers, ctx)).toEqual({ step: 'games', held: false });
    expect(resolveStep(q('g=cs2&do=platform').answers, ctx)).toEqual({ step: 'money', held: false });
    expect(resolveStep(q('g=cs2&do=platform&money=yes&servers=8&freq=event').answers, ctx).step).toBe('result');
  });

  it('holds on an unanswered question and says so', () => {
    expect(resolveStep(q('g=cs2&do=platform&money=unsure').answers, ctx, 'servers')).toEqual({ step: 'money', held: true });
    expect(resolveStep(q('').answers, ctx, 'job')).toEqual({ step: 'games', held: true });
  });

  it('moves past a step that does not apply', () => {
    expect(resolveStep(q('g=valorant').answers, ctx, 'job').step).toBe('money');
    expect(resolveStep(q('g=cs2&do=plugin').answers, ctx, 'money').step).toBe('result');
    expect(resolveStep(q('g=valorant&money=yes').answers, ctx, 'servers').step).toBe('freq');
  });

  it('lets you go back to any answered step', () => {
    const a = q('g=cs2&do=platform&money=yes&servers=8&freq=event').answers;
    expect(resolveStep(a, ctx, 'games')).toEqual({ step: 'games', held: false });
    expect(previousStep(a, ctx, 'freq')).toBe('servers');
    expect(previousStep(q('g=valorant').answers, ctx, 'money')).toBe('games');
    expect(previousStep(a, ctx, 'games')).toBeNull();
  });

  it('does not accept a founder answer once founder sales close', () => {
    const a = q('g=cs2&do=platform&money=yes&servers=8&freq=founder').answers;
    expect(resolveStep(a, ctx).step).toBe('result');
    expect(resolveStep(a, closed).step).toBe('freq');
  });
});

describe('recommend', () => {
  it('free: plugin only', () => {
    expect(rec('g=cs2&do=plugin')).toEqual({ kind: 'free-plugin' });
  });

  it('free: nobody earns money', () => {
    expect(rec('g=cs2&do=platform&money=no')).toEqual({ kind: 'free' });
    expect(rec('g=valorant&money=no')).toEqual({ kind: 'free' });
  });

  it('not before every question is answered', () => {
    expect(rec('g=cs2&do=platform&money=unsure&servers=8&freq=event').kind).toBe('incomplete');
    expect(rec('g=cs2&do=servers&money=yes&servers=8').kind).toBe('incomplete');
  });

  it('servers for one event', () => {
    const r = rec('g=cs2&do=servers&money=yes&servers=10&freq=event');
    expect(r.kind).toBe('pack');
    if (r.kind !== 'pack') return;
    expect(r.pack.id).toBe('servers-m');
    expect(headline(r)).toBe('Servers M · for one event · €59');
    expect(whyThisSize(r, q('g=cs2').answers)).toBe('You said 10 game servers at once; Servers M covers up to 20. Servers S stops at 6.');
    expect(priceTip(r)).toContain('Running 3 or more events in 12 months? Yearly (€149) costs less.');
  });

  it('platform yearly', () => {
    const r = rec('g=cs2&do=platform&money=yes&servers=30&freq=year');
    if (r.kind !== 'pack') throw new Error(r.kind);
    expect(headline(r)).toBe('Platform L · for a year · €429');
    expect(priceTip(r)).toBe('Yearly pays off from your 3rd event in 12 months. Fewer events than that? One-event packs are cheaper, at €159 each.');
  });

  it('founder', () => {
    const r = rec('g=cs2&do=platform&money=yes&servers=6&freq=founder');
    if (r.kind !== 'pack') throw new Error(r.kind);
    expect(headline(r)).toBe('Platform S · paid once · €399');
    expect(whyThisSize(r, q('g=cs2').answers)).toContain("It's the smallest pack.");
    expect(priceTip(r)).toContain('4 years of yearly');
  });

  it('above the biggest pack is a quote', () => {
    expect(rec('g=cs2&do=servers&money=yes&servers=41')).toEqual({ kind: 'quote', servers: 41, max: 40 });
  });

  it('other games only: the smallest Platform pack, no server count', () => {
    const r = rec('g=valorant,chess&money=yes&freq=event');
    if (r.kind !== 'pack') throw new Error(r.kind);
    expect(r.pack.id).toBe('platform-s');
    expect(r.countsServers).toBe(false);
    expect(whyThisSize(r, q('g=valorant,chess').answers)).toContain('With these games, teams report their own results');
    expect(whyThisSize(r, q('g=valorant').answers)).toContain('With Valorant,');
  });

  it('CS2 with another game: Platform, sized by the CS2 servers', () => {
    const r = rec('g=cs2,rocket-league&money=yes&servers=12&freq=event');
    if (r.kind !== 'pack') throw new Error(r.kind);
    expect(r.pack.id).toBe('platform-m');
  });

  it('every pack it recommends passes the checkout validation', () => {
    for (const product of ['servers', 'platform']) {
      for (const servers of [1, 6, 7, 20, 21, 40]) {
        for (const freq of ['event', 'year', 'founder']) {
          const r = rec(`g=cs2&do=${product}&money=yes&servers=${servers}&freq=${freq}`);
          if (r.kind !== 'pack') throw new Error(r.kind);
          const check = validateCheckoutRequest(checkoutPayload(r), FALLBACK_PACKS);
          expect(check.ok, `${product} ${servers} ${freq}`).toBe(true);
        }
      }
    }
    const other = rec('g=valorant&money=yes&freq=year');
    if (other.kind !== 'pack') throw new Error(other.kind);
    expect(validateCheckoutRequest(checkoutPayload(other), FALLBACK_PACKS).ok).toBe(true);
  });
});

describe('serversFromTeams', () => {
  it('first-round matches plus spares', () => {
    expect(serversFromTeams(16)).toEqual({ matches: 8, spares: 2, total: 10 });
    expect(serversFromTeams(8)).toEqual({ matches: 4, spares: 1, total: 5 });
    expect(serversFromTeams(5)).toEqual({ matches: 3, spares: 1, total: 4 });
    expect(serversFromTeams(1)).toEqual({ matches: 1, spares: 1, total: 2 });
  });
});

describe('games', () => {
  it('lists the 34 game packs', () => {
    expect(packGames).toHaveLength(34);
  });
});
