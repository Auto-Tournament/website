/**
 * The pricing guide ("find your pack") as pure functions: the answers, which
 * question comes next, and the one recommendation at the end. The guide
 * component (PackFinder.tsx) and the server-rendered pricing page both use
 * these, so the page renders the same step with or without JavaScript.
 *
 * The answers live in the URL query (?g=cs2&do=platform&money=yes&servers=8
 * &freq=event&at=result), so a reload or a shared link lands on the same
 * step. No 'use client' and relative imports only: vitest runs this file
 * without the `@/` alias.
 */
import { derivePack, type CheckoutRequest, type CheckoutTool } from '../lib/checkout';
import { formatEuro, maxPackServers, packFor, type Pack, type PackProduct, type Period } from './pricing';

/* ------------------------------------------------------------------ games */

export type Game = { slug: string; name: string };

/** Counter-Strike 2: the one game with full support (servers, match plugin, platform). */
export const cs2: Game = { slug: 'cs2', name: 'Counter-Strike 2' };

/**
 * The game packs in github.com/Auto-Tournament/packs (catalog.json, 34 packs,
 * all engine "manual-report"): the platform runs sign-ups and brackets, and
 * the teams report each result. Icons are the packs' app icons, copied to
 * public/games/<slug>.webp (sources and trademark note: app-icons/SOURCES.md
 * in the packs repo). Game icons only identify the game.
 */
export const packGames: readonly Game[] = [
  { slug: 'age-of-empires-ii', name: 'Age of Empires II' },
  { slug: 'apex-legends', name: 'Apex Legends' },
  { slug: 'battlefield-6', name: 'Battlefield 6' },
  { slug: 'brawl-stars', name: 'Brawl Stars' },
  { slug: 'call-of-duty', name: 'Call of Duty' },
  { slug: 'chess', name: 'Chess' },
  { slug: 'clash-royale', name: 'Clash Royale' },
  { slug: 'deadlock', name: 'Deadlock' },
  { slug: 'dota-2', name: 'Dota 2' },
  { slug: 'ea-sports-fc-25', name: 'EA Sports FC' },
  { slug: 'fortnite', name: 'Fortnite' },
  { slug: 'guilty-gear-strive', name: 'Guilty Gear -Strive-' },
  { slug: 'halo-infinite', name: 'Halo Infinite' },
  { slug: 'hearthstone', name: 'Hearthstone' },
  { slug: 'league-of-legends', name: 'League of Legends' },
  { slug: 'mario-kart-8-deluxe', name: 'Mario Kart 8 Deluxe' },
  { slug: 'marvel-rivals', name: 'Marvel Rivals' },
  { slug: 'minecraft', name: 'Minecraft' },
  { slug: 'mobile-legends-bang-bang', name: 'Mobile Legends: Bang Bang' },
  { slug: 'mortal-kombat-1', name: 'Mortal Kombat 1' },
  { slug: 'osu', name: 'osu!' },
  { slug: 'overwatch-2', name: 'Overwatch 2' },
  { slug: 'pubg-battlegrounds', name: 'PUBG: Battlegrounds' },
  { slug: 'rainbow-six-siege', name: 'Rainbow Six Siege' },
  { slug: 'rocket-league', name: 'Rocket League' },
  { slug: 'splatoon-3', name: 'Splatoon 3' },
  { slug: 'starcraft-ii', name: 'StarCraft II' },
  { slug: 'street-fighter-6', name: 'Street Fighter 6' },
  { slug: 'super-smash-bros-ultimate', name: 'Super Smash Bros. Ultimate' },
  { slug: 'team-fortress-2', name: 'Team Fortress 2' },
  { slug: 'teamfight-tactics', name: 'Teamfight Tactics' },
  { slug: 'tekken-8', name: 'Tekken 8' },
  { slug: 'trackmania', name: 'Trackmania' },
  { slug: 'valorant', name: 'Valorant' },
];

/** Shown before "Show all games". */
export const featuredGameSlugs: readonly string[] = [
  'valorant',
  'league-of-legends',
  'rocket-league',
  'dota-2',
  'fortnite',
  'overwatch-2',
  'rainbow-six-siege',
  'street-fighter-6',
];

/** A game with no pack yet. */
export const otherGame = 'other';

/** Where each game's square icon is served from; null for "another game". */
export function gameIcon(slug: string): string | null {
  if (slug === cs2.slug) return '/games/counter-strike-2.webp';
  return packGames.some((g) => g.slug === slug) ? `/games/${slug}.webp` : null;
}

export function gameName(slug: string): string {
  if (slug === cs2.slug) return cs2.name;
  if (slug === otherGame) return 'Another game';
  return packGames.find((g) => g.slug === slug)?.name ?? slug;
}

const knownGames = new Set([cs2.slug, otherGame, ...packGames.map((g) => g.slug)]);

/* ---------------------------------------------------------------- answers */

/** What they want Auto Tournament to do. Only CS2 has more than the platform. */
export type Job = 'plugin' | 'servers' | 'platform';
export type Money = 'no' | 'yes' | 'unsure';

export type Answers = {
  games: string[];
  job?: Job;
  money?: Money;
  /** Most game servers at once, spares included. */
  servers?: number;
  freq?: Period;
};

export const stepIds = ['games', 'job', 'money', 'servers', 'freq', 'result'] as const;
export type StepId = (typeof stepIds)[number];

export const stepTitles: Record<StepId, string> = {
  games: 'Which games will you run?',
  job: 'What do you want Auto Tournament to do?',
  money: 'Does anyone earn money from your events?',
  servers: 'How many game servers at once?',
  freq: 'How often?',
  result: 'Result',
};

/** Short labels for the progress dots and the answer summary. */
export const stepShort: Record<StepId, string> = {
  games: 'Games',
  job: 'What it does',
  money: 'Money',
  servers: 'Servers',
  freq: 'How often',
  result: 'Answer',
};

const jobs: readonly Job[] = ['plugin', 'servers', 'platform'];
const moneys: readonly Money[] = ['no', 'yes', 'unsure'];
const freqs: readonly Period[] = ['event', 'year', 'founder'];

/** The biggest number the servers field takes; anything above the biggest pack is a quote anyway. */
export const serversCap = 999;

type Params = URLSearchParams | Record<string, string | string[] | undefined>;

function all(params: Params, key: string): string[] {
  if (params instanceof URLSearchParams) return params.getAll(key);
  const v = params[key];
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

const first = (params: Params, key: string): string | undefined => all(params, key)[0];

const pick = <T extends string>(list: readonly T[], value: string | undefined): T | undefined =>
  value !== undefined && (list as readonly string[]).includes(value) ? (value as T) : undefined;

/**
 * Answers and the requested step from a query. Games may come as g=a&g=b
 * (a plain form) or g=a,b (a shared link). Anything unknown is dropped.
 */
export function parseAnswers(params: Params): { answers: Answers; at?: StepId } {
  const games = [...new Set(all(params, 'g').flatMap((v) => v.split(',')).map((s) => s.trim()).filter((s) => knownGames.has(s)))];
  const serversRaw = first(params, 'servers')?.trim();
  const serversNum = serversRaw && /^\d{1,4}$/.test(serversRaw) ? Number(serversRaw) : undefined;
  const servers = serversNum !== undefined && serversNum >= 1 ? Math.min(serversNum, serversCap) : undefined;
  return {
    answers: {
      games,
      job: pick(jobs, first(params, 'do')),
      money: pick(moneys, first(params, 'money')),
      servers,
      freq: pick(freqs, first(params, 'freq')),
    },
    at: pick(stepIds, first(params, 'at')),
  };
}

/** The query for these answers, in a fixed order, games comma-separated: "g=cs2&do=platform&…". */
export function toQuery(answers: Answers, at?: StepId): string {
  const q = new URLSearchParams();
  if (answers.games.length) q.set('g', answers.games.join(','));
  if (answers.job) q.set('do', answers.job);
  if (answers.money) q.set('money', answers.money);
  if (answers.servers !== undefined) q.set('servers', String(answers.servers));
  if (answers.freq) q.set('freq', answers.freq);
  if (at) q.set('at', at);
  // Keep the comma readable in shared links.
  return q.toString().replace(/%2C/g, ',');
}

/** The answers as form fields (name, value) for hidden inputs. */
export function answerFields(answers: Answers, except: StepId): [string, string][] {
  const out: [string, string][] = [];
  if (except !== 'games') for (const g of answers.games) out.push(['g', g]);
  if (except !== 'job' && answers.job) out.push(['do', answers.job]);
  if (except !== 'money' && answers.money) out.push(['money', answers.money]);
  if (except !== 'servers' && answers.servers !== undefined) out.push(['servers', String(answers.servers)]);
  if (except !== 'freq' && answers.freq) out.push(['freq', answers.freq]);
  return out;
}

/* ------------------------------------------------------------------ steps */

export type Context = { packs: readonly Pack[]; founderOpen: boolean };

export const hasCs2 = (a: Answers) => a.games.includes(cs2.slug);
/** Games other than CS2, including "another game". */
export const otherGames = (a: Answers) => a.games.filter((g) => g !== cs2.slug);

/** The choices on "What do you want Auto Tournament to do?". Every game but CS2 runs on the platform only. */
export function jobOptions(a: Answers): Job[] {
  if (hasCs2(a) && otherGames(a).length === 0) return ['plugin', 'servers', 'platform'];
  return ['platform'];
}

/** The job that counts: their pick when there is a choice, else the platform. */
export function effectiveJob(a: Answers): Job | undefined {
  const options = jobOptions(a);
  if (options.length === 1) return options[0];
  return a.job && options.includes(a.job) ? a.job : undefined;
}

/** Game servers that count toward the pack: only CS2 servers run our software. */
export function countsServers(a: Answers): boolean {
  return hasCs2(a);
}

/** The steps that apply to these answers, in order, ending with the result. */
export function stepsFor(a: Answers, ctx: Context): StepId[] {
  const steps: StepId[] = ['games'];
  if (jobOptions(a).length > 1) steps.push('job');
  const job = effectiveJob(a);
  if (job !== 'plugin') {
    steps.push('money');
    if (a.money !== 'no') {
      if (countsServers(a)) steps.push('servers');
      const overLimit = countsServers(a) && a.servers !== undefined && a.servers > maxPackServers(ctx.packs);
      if (!overLimit) steps.push('freq');
    }
  }
  steps.push('result');
  return steps;
}

export function isAnswered(step: StepId, a: Answers, ctx: Context): boolean {
  switch (step) {
    case 'games':
      return a.games.length > 0;
    case 'job':
      return effectiveJob(a) !== undefined;
    case 'money':
      return a.money === 'yes' || a.money === 'no';
    case 'servers':
      return a.servers !== undefined;
    case 'freq':
      return a.freq !== undefined && (a.freq !== 'founder' || ctx.founderOpen);
    case 'result':
      return true;
  }
}

/**
 * The step to show. `at` is the step asked for (the Next and Back buttons
 * send it). A step that doesn't apply moves on to the next one that does; a
 * step past an unanswered question goes back to that question (`held`, so
 * the page can say why). No `at`: the first unanswered question, or the
 * result when all are answered.
 */
export function resolveStep(a: Answers, ctx: Context, at?: StepId): { step: StepId; held: boolean } {
  const steps = stepsFor(a, ctx);
  const firstOpen = steps.find((s) => !isAnswered(s, a, ctx)) ?? 'result';
  if (!at) return { step: firstOpen, held: false };
  const order = (s: StepId) => stepIds.indexOf(s);
  const target = steps.find((s) => order(s) >= order(at)) ?? 'result';
  if (order(target) > order(firstOpen)) return { step: firstOpen, held: true };
  return { step: target, held: false };
}

/** The step before `step` among those that apply; null on the first. */
export function previousStep(a: Answers, ctx: Context, step: StepId): StepId | null {
  const steps = stepsFor(a, ctx);
  const i = steps.indexOf(step);
  return i > 0 ? steps[i - 1] : null;
}

/** The step the Next button asks for (resolveStep skips what doesn't apply). */
export function nextStep(step: StepId): StepId {
  const i = stepIds.indexOf(step);
  return stepIds[Math.min(i + 1, stepIds.length - 1)];
}

/* --------------------------------------------------------- recommendation */

/**
 * Rule of thumb for servers from teams: every first-round match at once,
 * plus spares (1 up to 4 matches, else 2). 16 teams → 8 + 2 = 10.
 */
export function serversFromTeams(teams: number): { matches: number; spares: number; total: number } {
  const matches = Math.max(1, Math.ceil(Math.max(2, Math.floor(teams)) / 2));
  const spares = matches <= 4 ? 1 : 2;
  return { matches, spares, total: matches + spares };
}

export type Recommendation =
  | { kind: 'incomplete' }
  /** CS2, "just run my matches": MatchZy Enhanced, MIT. */
  | { kind: 'free-plugin' }
  /** Nobody earns money from it. */
  | { kind: 'free' }
  /** More servers than the biggest pack. */
  | { kind: 'quote'; servers: number; max: number }
  | {
      kind: 'pack';
      pack: Pack;
      product: PackProduct;
      period: Period;
      price: number;
      /** Servers sent to checkout: what they said, or 1 when no server counts. */
      servers: number;
      /** False when no game server counts (every game is reported by hand). */
      countsServers: boolean;
      /** The next smaller pack of the same product, for "why this size". */
      smaller: Pack | null;
    };

export function recommend(a: Answers, ctx: Context): Recommendation {
  const { step } = resolveStep(a, ctx);
  if (step !== 'result') return { kind: 'incomplete' };
  const job = effectiveJob(a);
  if (job === 'plugin') return { kind: 'free-plugin' };
  if (a.money === 'no') return { kind: 'free' };
  const product: PackProduct = job === 'servers' ? 'servers' : 'platform';
  const counts = countsServers(a);
  const servers = counts ? (a.servers ?? 1) : 1;
  const max = maxPackServers(ctx.packs);
  if (servers > max) return { kind: 'quote', servers, max };
  const pack = packFor(ctx.packs, product, servers);
  if (!pack || !a.freq) return { kind: 'incomplete' };
  const smaller =
    ctx.packs
      .filter((p) => p.product === product && p.maxServers < pack.maxServers)
      .reduce<Pack | null>((best, p) => (best === null || p.maxServers > best.maxServers ? p : best), null) ?? null;
  return { kind: 'pack', pack, product, period: a.freq, price: pack.prices[a.freq], servers, countsServers: counts, smaller };
}

/** The tools checkout gets for a product: the same as the pack cards send. */
export function checkoutToolsFor(product: PackProduct): CheckoutTool[] {
  return product === 'platform' ? ['platform'] : ['csm'];
}

/** The /api/checkout body for a pack recommendation. The server derives the same pack from it. */
export function checkoutPayload(rec: Extract<Recommendation, { kind: 'pack' }>): CheckoutRequest {
  const tools = checkoutToolsFor(rec.product);
  // Same derivation as the server; a mismatch here would be a 400 there.
  const derived = derivePack([rec.pack], tools, rec.servers);
  if (!derived) throw new Error(`No pack for ${rec.product} with ${rec.servers} servers`);
  return { pack: rec.pack.id, period: rec.period, servers: rec.servers, tools, use: 'commercial' };
}

/** "Platform M · for one event · €99". */
export function headline(rec: Extract<Recommendation, { kind: 'pack' }>): string {
  const when = { event: 'for one event', year: 'for a year', founder: 'paid once' }[rec.period];
  return `${rec.pack.name} · ${when} · ${formatEuro(rec.price)}`;
}

/** Why this size, in one sentence. */
export function whyThisSize(rec: Extract<Recommendation, { kind: 'pack' }>, a: Answers): string {
  if (!rec.countsServers) {
    const others = otherGames(a);
    const list = others.length > 1 ? 'these games' : others[0] === otherGame ? 'your game' : gameName(others[0]);
    return `Only game servers that run our software count. With ${list}, teams report their own results, so no server counts and the smallest pack covers you.`;
  }
  const n = rec.servers;
  const fits = `You said ${n} game server${n === 1 ? '' : 's'} at once; ${rec.pack.name} covers up to ${rec.pack.maxServers}.`;
  return rec.smaller ? `${fits} ${rec.smaller.name} stops at ${rec.smaller.maxServers}.` : `${fits} It's the smallest pack.`;
}

/**
 * A money tip for their answers, or null: yearly against event packs, and
 * what a founder pack is worth against yearly.
 */
export function priceTip(rec: Extract<Recommendation, { kind: 'pack' }>): string | null {
  const { event, year, founder } = rec.pack.prices;
  const breakEven = Math.ceil(year / event);
  if (rec.period === 'event') {
    return `Running ${breakEven} or more events in 12 months? Yearly (${formatEuro(year)}) costs less. An event pack bought in the last 90 days counts toward it in full.`;
  }
  if (rec.period === 'year') {
    return `Yearly pays off from your ${ordinal(breakEven)} event in 12 months. Fewer events than that? One-event packs are cheaper, at ${formatEuro(event)} each.`;
  }
  const years = Math.round((founder / year) * 10) / 10;
  return `Costs the same as ${years} years of yearly. After that, updates keep coming at no extra cost.`;
}

function ordinal(n: number): string {
  const suffix = n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th';
  return `${n}${suffix}`;
}
