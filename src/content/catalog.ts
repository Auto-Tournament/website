/**
 * What the product pages say: the platform, the games it supports, and each
 * game's plugins and tools. Pure data (no React), so pages, the nav, the
 * sitemap and the tests all read the same thing.
 *
 * Adding a game: add it to `games` with `tools` (it gets /games/<slug> and
 * /games/<slug>/<tool>), or without tools to list it on /games only.
 *
 * Wording rules (the README standard): plain words, no hype, only what is
 * merged; say when something is not released yet. Commercial use: "if you earn
 * money from it, you need a license". Never "full price".
 */

import { installCommands } from './install';

export type Tone = 'stable' | 'beta' | 'soon' | 'free';

/** A small label: "Stable", "Beta", "Coming in 3.0", "MIT". */
export type Badge = { label: string; tone: Tone };

export type LinkOut = { label: string; href: string };

export type Block = {
  /** Anchor id on the page. */
  id: string;
  title: string;
  badge?: Badge;
  /** Paragraphs. */
  body: string[];
  points?: string[];
  code?: { code: string; comment?: string; what?: string };
  /** A muted line under the block. */
  note?: string;
  links?: LinkOut[];
};

export type Fact = { label: string; value: string; /** Makes the value a link. */ href?: string };

export type IconKey = 'platform' | 'readyUp' | 'csm' | 'skins' | 'midas' | 'plugin';

export type Product = {
  slug: string;
  name: string;
  /** "Server plugin suite", "Command-line tool". */
  kind: string;
  icon: IconKey;
  badges: Badge[];
  /** The h1's second line, and the card line on the game page. */
  tagline: string;
  /** The paragraph under the h1. */
  summary: string;
  /** Meta description. */
  description: string;
  facts: Fact[];
  primary: LinkOut;
  secondary?: LinkOut;
  sections: Block[];
  /** Links at the bottom of the page. */
  more: LinkOut[];
  /** Which license text to show: PolyForm Noncommercial products need one for commercial use. */
  license: 'polyform' | 'mit';
  /** The product's own rule for what the license counts, under the general commercial-use text. */
  licenseExtra?: string[];
};

export type Game = {
  slug: string;
  name: string;
  /** Square app icon in public/games. */
  image: string;
  badge: Badge;
  /** One line for the games list. */
  line: string;
  /** Games with a page: the intro on /games/<slug>. */
  summary?: string;
  description?: string;
  tools?: Product[];
  /** Plugins that are not ours to sell and have no page here: listed with a link out. */
  others?: { name: string; line: string; href: string; badge: Badge }[];
};

export const repo = {
  platform: 'https://github.com/Auto-Tournament/auto-tournament',
  readyUp: 'https://github.com/Auto-Tournament/ready-up',
  csm: 'https://github.com/Auto-Tournament/cs2-server-manager',
  cs2Plugin: 'https://github.com/Auto-Tournament/cs2-plugin',
  packs: 'https://github.com/Auto-Tournament/packs',
};

const docs = 'https://docs.autotournament.gg';

/** Each product's changelog in the docs, generated from its GitHub releases. */
export const changelog = {
  platform: `${docs}/reference/changelog/platform`,
  readyUp: `${docs}/reference/changelog/ready-up`,
  csm: `${docs}/reference/changelog/csm`,
  cs2Plugin: `${docs}/reference/changelog/cs2-plugin`,
};

const readyUpInstall = `# from the server root (the folder that contains game/)
curl -fsSL https://raw.githubusercontent.com/Auto-Tournament/ready-up/master/install.sh | bash -s -- --channel beta`;

const csmInstall = `arch=$(uname -m); \\
case "$arch" in \\
  x86_64)  asset="csm-linux-amd64" ;; \\
  aarch64|arm64) asset="csm-linux-arm64" ;; \\
  *) echo "Unsupported architecture: $arch" && exit 1 ;; \\
esac; \\
tmp=$(mktemp); \\
curl -L "https://github.com/Auto-Tournament/cs2-server-manager/releases/latest/download/$asset" -o "$tmp" && \\
sudo install -m 0755 "$tmp" /usr/local/bin/csm && \\
rm "$tmp" && \\
sudo csm`;

/* ------------------------------------------------------------------------ */
/* Releases: flip these when a release is published, and every label follows */
/* ------------------------------------------------------------------------ */

export const releases = {
  /** Newest Ready Up release (a pre-release counts), without the v. null while there is none. */
  readyUp: '0.1.0-beta.2' as string | null,
  /** Newest stable csm release line, as it shows in labels. */
  csm: '1.13',
  /** Whether that csm release has csm link, instance mode, versioned CS2 updates and the Ready Up stack. */
  csmHasFleet: true,
  /** Newest platform 3.0 beta number (v3.0.0-beta.N). */
  platformBeta: 22,
  /** Whether that beta has failover, auto-scaling, and webhooks with the teams API. */
  platformHasFleet: true,
};

/** The licensing words on every product page. Not "personal use", never "full price". */
export const licensing = {
  headline: 'Free for non-commercial use',
  who: 'For players, clubs, schools and non-profit events.',
  earning: 'Earning money from your event? You need a license — every server running Ready Up counts.',
};

/** On a section: in the 3.0 beta if it shipped there, otherwise not released yet. */
const in30: Badge = releases.platformHasFleet ? { label: '3.0 beta', tone: 'beta' } : { label: 'Coming in 3.0', tone: 'soon' };
/** On a csm section that is merged after the current release. Undefined once it shipped. */
const csmNext: Badge | undefined = releases.csmHasFleet ? undefined : { label: 'Next csm release', tone: 'soon' };
/** Ready Up's (and its plugins') release label. */
const readyUpRelease: Badge = releases.readyUp ? { label: `Beta: ${releases.readyUp}`, tone: 'beta' } : { label: 'No release yet', tone: 'beta' };
const readyUpStatus = releases.readyUp ? `Beta, ${releases.readyUp}` : 'Early development, no release yet';

/* ------------------------------------------------------------------------ */
/* The platform                                                              */
/* ------------------------------------------------------------------------ */

export const platform: Product = {
  slug: 'platform',
  name: 'Auto Tournament',
  kind: 'Tournament platform',
  icon: 'platform',
  badges: [
    { label: '2.4 stable', tone: 'stable' },
    { label: `3.0 beta ${releases.platformBeta}`, tone: 'beta' },
  ],
  tagline: 'The tournament website that runs the matches too.',
  summary:
    'Create the tournament and add your servers. Auto Tournament builds the bracket, runs the map veto in the browser, puts every match on a free server and moves the bracket on when a match ends. Self-hosted on one Docker host.',
  description:
    'Auto Tournament is a self-hosted tournament platform: brackets, map veto in the browser, automatic match flow, failover and auto-scaling for CS2 servers, and webhooks and a teams API for event websites.',
  facts: [
    { label: 'Formats', value: 'Single and double elimination, Swiss, round robin, shuffle' },
    { label: 'Map veto', value: 'Bo1, Bo3 and Bo5, in the browser' },
    { label: 'Runs on', value: 'One Docker host' },
    { label: 'Games', value: 'CS2 module included, more games as modules' },
  ],
  primary: { label: 'Install Auto Tournament', href: `${docs}/getting-started/install` },
  secondary: { label: 'View on GitHub', href: repo.platform },
  sections: [
    {
      id: 'brackets',
      title: 'Brackets and formats',
      body: [
        'Single and double elimination, Swiss, round robin, and shuffle tournaments where the teams are balanced for you. When a match ends, the bracket moves on and the next match goes to a server.',
      ],
      points: [
        'Player ratings (OpenSkill) and leaderboards that carry over from one event to the next',
        'Public team pages with connect info, no login needed',
        'A simulation mode to test a whole tournament without players',
      ],
      links: [{ label: 'Tournament formats', href: `${docs}/guides/tournament-formats` }],
    },
    {
      id: 'veto',
      title: 'Map veto in the browser',
      body: ['Team captains ban and pick maps from their phone. When the veto is done, the server loads the right maps and sides.'],
      points: ['Bo1, Bo3 and Bo5', 'Knife round or side pick', 'Your own veto order per tournament'],
    },
    {
      id: 'match-flow',
      title: 'Matches run by themselves',
      body: [
        'Auto Tournament picks a free server, loads the match, follows the score round by round and records the result and the demo. Nobody types a console command. When every server is busy, the match waits for the next free one.',
      ],
      points: ['Live scores and server status in the browser', 'Demos kept after every map, ready to download', 'You see when a server goes offline or needs an update'],
    },
    {
      id: 'failover',
      title: 'Failover',
      badge: in30,
      body: [
        'When a Ready Up server dies or hangs in the middle of a match, the platform restarts the match from the last round backup. If the server comes back, the match resumes there. If not, it moves to a free server, and the players get the new address and password on the match page.',
        'Once two servers are online, one idle server is kept free for this. On machines linked with CS2 Server Manager, the platform first restarts the server that died, and creates a new one when none is free.',
      ],
      points: ['On by default, with a switch on the Servers page', 'Admins can pick another server or round, or leave it', 'Every move is written to the audit log'],
    },
    {
      id: 'scaling',
      title: 'Auto-scaling',
      badge: in30,
      body: [
        'On machines linked with CS2 Server Manager, the platform starts stopped servers when matches are waiting or about to start, creates one when it runs short, and stops servers that have been idle for a while. It never stops a busy server and never deletes one.',
      ],
      points: [
        'Settings: on or off, lead time (2 minutes), cool-down (10 minutes), servers per machine (4)',
        'Every start, stop and create is logged with the reason',
      ],
    },
    {
      id: 'integrations',
      title: 'Webhooks and a teams API for event sites',
      badge: in30,
      body: [
        'Your LAN’s own website can push its teams (name, tag and the players’ Steam IDs) under its own IDs. Auto Tournament creates or updates its teams to match.',
        'The site then gets a signed webhook when a match changes: ready, with the server address, password and a steam://connect link, then live, map started, score, map ended, finished, cancelled or reset. That is enough for a “connect now” banner for every player.',
      ],
      points: [
        'Signed with HMAC-SHA256, retried for about 16 hours',
        'Test events that look exactly like real ones',
        'Also: an HTTP API with tokens and an OpenAPI spec, and an example Discord bot',
      ],
      links: [{ label: 'Webhooks and teams API', href: `${docs}/reference/webhooks` }],
    },
    {
      id: 'games',
      title: 'Games as modules',
      body: [
        'The CS2 module ships with the platform: the match plugin on your game servers reports every round back. In 3.0, any other game runs on manual reporting: a captain reports the score, the other captain agrees, and an admin settles a dispute. Each of those games is a small file called a game pack.',
      ],
      links: [
        { label: 'Games we support', href: '/games' },
        { label: 'What modules are', href: `${docs}/modules` },
      ],
    },
    {
      id: 'install',
      title: 'Install',
      body: ['One Docker Compose file runs the web app, the API and the database. Add your Steam API key to .env, open http://localhost:3069 and create a tournament.'],
      code: { code: installCommands, comment: '# no clone needed: download the compose file and start' },
      note: 'The first time an admin signs in, they pick non-commercial or commercial use once.',
    },
  ],
  more: [
    { label: 'Docs', href: docs },
    { label: 'GitHub', href: repo.platform },
    { label: 'Changelog', href: changelog.platform },
    { label: 'Licensing', href: `${docs}/reference/licensing` },
  ],
  license: 'polyform',
  licenseExtra: ["A Platform license covers the platform, CS2 Server Manager, Ready Up and the game packs used with it. It is sized by how many game servers you run."],
};

/* ------------------------------------------------------------------------ */
/* Counter-Strike 2                                                          */
/* ------------------------------------------------------------------------ */

const readyUp: Product = {
  slug: 'ready-up',
  name: 'Ready Up',
  kind: 'CS2 server plugin suite',
  icon: 'readyUp',
  badges: [readyUpRelease],
  tagline: 'The match plugin for CS2. No Metamod, no CounterStrikeSharp.',
  summary:
    'Ready Up runs the match on your CS2 server: players ready up, the match goes live, and the result goes back to whatever runs the event. A small core loads straight into CS2 and every feature is its own plugin, so a CS2 update only ever means fixing the core.',
  description:
    'Ready Up is a native CS2 match plugin suite: no Metamod or CounterStrikeSharp. Ready-up, knife, pauses, demos, round backups, practice mode and a link to Auto Tournament. Works with or without the platform.',
  facts: [
    { label: 'Needs', value: 'A Linux CS2 dedicated server. Nothing else.' },
    { label: 'Works with', value: 'Auto Tournament, or on its own' },
    { label: 'CS2 updates', value: 'See the live compatibility status', href: '/compatibility' },
    { label: 'Status', value: readyUpStatus },
  ],
  primary: { label: 'Ready Up on GitHub', href: repo.readyUp },
  secondary: { label: 'CS2 compatibility', href: '/compatibility' },
  sections: [
    {
      id: 'updates',
      title: 'Keeps working after CS2 updates',
      body: [
        'Ready Up touches the engine in as few places as it can, and every one of them is listed with a signature and checks that must pass. If one breaks after an update, only that feature turns itself off. The rest of the server keeps running.',
        'CI checks the list against every new CS2 build, usually within minutes, so we see what broke before your servers do. On a running server, ru selftest shows every hook and ends with PASS or FAIL.',
      ],
      links: [{ label: 'Live compatibility status', href: '/compatibility' }],
    },
    {
      id: 'parity',
      title: 'Replaces the Auto Tournament CS2 plugin',
      body: [
        'Ready Up does the job of the older Auto Tournament CS2 plugin, with the same chat commands, so players don’t have to learn anything new. Every row of the parity list is done: 101 of 101. Most are covered by tests; playing it at real events is what is left.',
      ],
      points: [
        'Ready-up (.r / .ur) with a countdown, knife round and side pick',
        'Pauses, captain forfeit and .admin to call an admin',
        'GOTV demos and stats for every map',
        'Admins, settings and crash recovery in small JSON files, no database',
      ],
    },
    {
      id: 'platform',
      title: 'With or without the platform',
      body: [
        'On its own, Ready Up runs scrims and pickups: players type .r, a countdown runs, and the match goes live.',
        'Linked to Auto Tournament, its fleet plugin keeps one outbound connection to the platform. Matches, settings and admins come in over it, and the live state goes back. No RCON and no inbound port. Without a platform address the fleet plugin stays idle.',
      ],
      points: [
        'Demos stream to the platform while they record, so there is no upload wait at the end of a map',
        'Round backups: an admin replays a round with .restore <round>, and the platform uses the same backups to move a live match to another server',
      ],
    },
    {
      id: 'practice',
      title: 'Practice mode',
      body: [
        '.prac switches a server to practice: cheats, a full set of grenades and infinite ammo. Set it to always on for a dedicated practice server.',
        'Scenarios put you where a pro stood in a recorded round, while bots replay the other nine players.',
      ],
      points: [
        'A lineup library: save, load and list your grenade lineups',
        'Rethrow your last grenade, or pick one from your history',
        'Saved positions, spawn points, bots, no flash and god mode',
      ],
    },
    {
      id: 'plugins',
      title: 'Pick the plugins you want',
      body: [
        'Ready Up is a core plus plugins. Each plugin is its own file: install one, reload it without restarting the server, or turn it off. They only use Ready Up’s public plugin API, so they also work as examples for your own.',
      ],
      points: [
        'Essentials bundle: core, essentials (admins and map commands), match, practice and fleet',
        'Full bundle adds: skins, Midas, whitelist, deathmatch (FFA and team), Steam Workshop addons and an example plugin',
        'Runs next to Metamod. Never run a second match plugin next to it.',
      ],
    },
    {
      id: 'install',
      title: 'Install',
      badge: { label: 'Beta channel', tone: 'beta' },
      body: [
        'The installer first asks whether you use it non-commercially or commercially, then you type I AGREE. It shows the plugins with a checkbox each, checks every download against its checksum and adds Ready Up to gameinfo.gi. It never uses sudo, never stops the server and never overwrites your config.',
        releases.readyUp
          ? `Ready Up is in beta: the current release, ${releases.readyUp}, is a pre-release, which only the beta channel installs. Run the same command again to update, or let CS2 Server Manager do it between matches.`
          : 'There is no release yet. The first builds come out as pre-releases, which only the beta channel installs. Run the same command again to update, or let CS2 Server Manager do it between matches.',
      ],
      code: { code: readyUpInstall },
      links: [
        { label: 'Install guide', href: `${repo.readyUp}/blob/master/docs/INSTALL.md` },
        { label: 'CS2 Server Manager', href: '/games/cs2/csm' },
      ],
    },
  ],
  more: [
    { label: 'GitHub', href: repo.readyUp },
    { label: 'Changelog', href: changelog.readyUp },
    { label: 'Compatibility', href: '/compatibility' },
    { label: 'Admin commands', href: `${repo.readyUp}/blob/master/docs/ADMINS.md` },
  ],
  license: 'polyform',
  licenseExtra: ["Spares count too. The license is sized by how many servers you run."],
};

const csm: Product = {
  slug: 'csm',
  name: 'CS2 Server Manager',
  kind: 'Command-line tool (csm)',
  icon: 'csm',
  badges: [{ label: `v${releases.csm}`, tone: 'stable' }],
  tagline: 'Many CS2 servers on one Linux machine, installed and kept up to date.',
  summary:
    'csm installs CS2 with SteamCMD, puts the match plugin on every server, runs each server in its own tmux session and keeps game and plugin updates going. It has a terminal UI and a command line.',
  description:
    'CS2 Server Manager (csm) runs many CS2 servers on one Linux machine: one-command onboarding to Auto Tournament, instance mode, versioned CS2 updates and Ready Up updates between matches.',
  facts: [
    { label: 'Runs on', value: 'Linux, amd64 and arm64' },
    { label: 'Plugin', value: 'Ready Up, or the older Auto Tournament CS2 stack' },
    { label: 'Updates', value: 'Never in the middle of a match' },
    { label: 'Interface', value: 'Terminal UI and command line' },
  ],
  primary: { label: 'Install guide', href: `${docs}/cs2/server-manager/install` },
  secondary: { label: 'View on GitHub', href: repo.csm },
  sections: [
    {
      id: 'link',
      title: 'Add a machine with one command',
      badge: csmNext,
      body: [
        'In Auto Tournament, open Settings → Hosts → Add host and copy the one-time code. Run csm link with it on the machine. From then on, admins start, stop, create and update that machine’s servers from the web UI.',
        'No SSH and no inbound port: csm keeps one outbound connection to the platform. The platform drives it for failover and auto-scaling.',
      ],
      code: { code: 'csm link https://your-platform.example <code>\ncsm agent install   # run the host agent as a service', what: 'commands' },
      points: [
        'The token is stored readable by csm only, and never printed or logged',
        'Commands for a server with a live match are refused unless a root admin forces them',
        'Reports servers that exit or hang to the platform',
      ],
    },
    {
      id: 'instances',
      title: 'Instance mode: one CS2 install, many servers',
      badge: csmNext,
      body: [
        'Normally every server is a full copy of CS2. In instance mode, every server runs the one install read-only and only stores the files it writes itself: logs, demos, backups and its own settings. Ten servers cost about as much disk as one.',
      ],
      points: [
        '1 server ≈ 69 GB, 10 servers ≈ 69 GB (instance mode), against ≈ 760 GB as full copies',
        'Each server starts in about 5 seconds',
        'RAM is not shared: each server still uses 1–2 GB of RAM',
        'No root and no sudo (Linux 5.11 or newer)',
        'A server that crashes is started again after 10 seconds',
        'Ready Up is installed once, into a layer every server shares',
      ],
      note: 'Measured on one CS2 host in September 2026 (CS2 1.41.8.5). CS2’s size changes with updates.',
      links: [{ label: 'How much disk? (csm README)', href: `${repo.csm}/blob/master/README.md#how-much-disk` }],
    },
    {
      id: 'cs2-updates',
      title: 'Safe CS2 updates',
      badge: csmNext,
      body: [
        'In instance mode, a CS2 update is made once, as a new version next to the old one. Files the update didn’t change are shared, so a version costs only what changed: a few GB, not 70.',
        'Running servers keep the version they started on. Each one restarts onto the new version once it is idle: Ready Up says it is safe and nobody is connected. An older version is removed when nothing uses it any more.',
      ],
    },
    {
      id: 'ready-up',
      title: 'Ready Up updates between matches',
      badge: csmNext,
      body: [
        'csm installs Ready Up on every server and keeps it on the channel you pick: stable, or beta for pre-releases. You can also pin a version.',
        'A server is only updated when it is stopped, or when Ready Up says it is safe and nobody has been connected for the grace period. Never in the middle of a match.',
      ],
      code: { code: 'csm plugins stack readyup\ncsm plugins channel beta\ncsm update-plugins', what: 'commands' },
    },
    {
      id: 'status',
      title: 'Holds updates while a tournament runs',
      body: [
        'Point csm at Auto Tournament and it asks before every restart. Updates wait while a tournament is in progress or any match is loaded. If the platform can’t be reached, updates stay on hold.',
        'On Ready Up servers, csm status shows the map, phase, score and players for every server, live. Stop, restart and update refuse to run while a match is live, unless you add --force.',
      ],
    },
    {
      id: 'install',
      title: 'Install',
      body: ['On a Linux server, this downloads the latest release to /usr/local/bin/csm and starts the installer. It sets up 3 servers by default.'],
      code: { code: csmInstall, what: 'install commands' },
      note: releases.csmHasFleet ? undefined : `Features marked “Next csm release” are merged and come out with the next release after v${releases.csm}.`,
    },
  ],
  more: [
    { label: 'Docs', href: `${docs}/cs2/server-manager` },
    { label: 'GitHub', href: repo.csm },
    { label: 'Changelog', href: changelog.csm },
    { label: 'Releases', href: `${repo.csm}/releases` },
  ],
  license: 'polyform',
  licenseExtra: ["csm counts every server it set up, spares and test servers included. A Servers or a Platform license covers it."],
};

const skins: Product = {
  slug: 'skins',
  name: 'Skins',
  kind: 'Ready Up plugin',
  icon: 'skins',
  badges: [readyUpRelease, { label: 'Full bundle only', tone: 'soon' }],
  tagline: 'Weapon paints, knives, gloves and agents on Ready Up servers.',
  summary:
    'The skins plugin gives each player their loadout: weapon paints, knives, gloves and agents. On its own it reads them from a JSON file. On a server linked to Auto Tournament, the loadouts come from the platform.',
  description: 'The Ready Up skins plugin: weapon paints, knives, gloves and agents on CS2 servers, from a JSON file or from Auto Tournament.',
  facts: [
    { label: 'Part of', value: 'Ready Up, Full bundle' },
    { label: 'Loadouts from', value: 'A JSON file, or the platform' },
    { label: 'Valve ruleset', value: 'Off: players keep their own inventory' },
    { label: 'Status', value: readyUpStatus },
  ],
  primary: { label: 'Skins plugin on GitHub', href: `${repo.readyUp}/tree/master/plugins/skins` },
  secondary: { label: 'About Ready Up', href: '/games/cs2/ready-up' },
  sections: [
    {
      id: 'ban-risk',
      title: 'Added on purpose',
      body: [
        'Skin changers can get a server banned. That is why this plugin isn’t in the default bundle: it only comes with the Full bundle, or when you tick it in the installer. The rest of Ready Up runs without it.',
      ],
    },
    {
      id: 'valve',
      title: 'Off for esports matches',
      body: ['Under the Valve ruleset the plugin applies nothing, so players keep their own Steam inventory.'],
    },
    {
      id: 'install',
      title: 'Install',
      body: ['Tick Skins in the Ready Up installer, or install the Full bundle. With CS2 Server Manager, pick the full bundle.'],
      code: { code: 'csm plugins bundle full\ncsm update-plugins', what: 'commands' },
    },
  ],
  more: [
    { label: 'Ready Up', href: '/games/cs2/ready-up' },
    { label: 'GitHub', href: repo.readyUp },
  ],
  license: 'polyform',
  licenseExtra: ["Skins is part of Ready Up and covered by the same license. Spares count too."],
};

const midas: Product = {
  slug: 'midas',
  name: 'Midas',
  kind: 'Ready Up plugin',
  icon: 'midas',
  badges: [readyUpRelease, { label: 'Full bundle only', tone: 'soon' }],
  tagline: 'Everything a Midas player touches turns gold.',
  summary:
    'A fun plugin for scrims. Weapons picked up by a Midas player turn gold, and stay gold when someone else picks them up. Off until you turn it on.',
  description: 'Midas, a fun Ready Up plugin for CS2 scrims: weapons a Midas player picks up turn gold.',
  facts: [
    { label: 'Part of', value: 'Ready Up, Full bundle' },
    { label: 'Default', value: 'Off until enabled' },
    { label: 'Valve ruleset', value: 'Never active' },
    { label: 'Status', value: readyUpStatus },
  ],
  primary: { label: 'Midas on GitHub', href: `${repo.readyUp}/tree/master/plugins/midas` },
  secondary: { label: 'About Ready Up', href: '/games/cs2/ready-up' },
  sections: [
    {
      id: 'who',
      title: 'Who is Midas',
      body: ['Players you list in the config, players an admin gives it to, or the best player of the map.'],
      points: [
        '.ru midas give <player> and .ru midas take <player>',
        'Best player by ADR or kills, picked after a few rounds or at every half',
        'Scrims only, unless you turn it on for matches',
        'A card on screen for the player who becomes Midas, a chat line for everyone else',
      ],
    },
    {
      id: 'gold',
      title: 'How gold looks',
      body: [
        'With the skins plugin loaded, guns get a gold paint (Gold Brick by default; any paint works). Knives, grenades, the C4 and every gun without the skins plugin get a gold tint instead.',
        'Gold models from a Steam Workshop addon are on the way.',
      ],
    },
    {
      id: 'install',
      title: 'Install',
      body: ['Tick Midas in the Ready Up installer, or install the Full bundle. Then set enabled=1 in cfg/ReadyUp/midas.cfg and reload it with ru plugin reload midas.'],
    },
  ],
  more: [
    { label: 'Ready Up', href: '/games/cs2/ready-up' },
    { label: 'Skins', href: '/games/cs2/skins' },
    { label: 'GitHub', href: repo.readyUp },
  ],
  license: 'polyform',
  licenseExtra: ["Midas is part of Ready Up and covered by the same license. Spares count too."],
};

/* ------------------------------------------------------------------------ */
/* Ready Up features: what it lets people do, grouped for organizers and     */
/* players. Under the hood each one is its own Ready Up plugin (secondary).  */
/* ------------------------------------------------------------------------ */

export type FeatureItem = {
  /** Short, unique title. */
  title: string;
  /** One plain sentence: what it lets people do. */
  text: string;
  /** Only set when the feature isn't in the default, stable bundle. */
  status?: Badge;
  /** The plugin behind it, shown small and secondary, e.g. "match". */
  plugin: string;
};

export type FeatureGroup = {
  id: string;
  title: string;
  icon: 'match' | 'admins' | 'after' | 'practice';
  items: FeatureItem[];
};

const fullBundleOnly: Badge = { label: 'Full bundle only', tone: 'soon' };

export const readyUpFeaturesIntro =
  'Everything Ready Up does in a match. Each feature is its own small plugin on top of a tiny core, so you run only what you need and CS2 updates only touch the core.';

export const readyUpFeatures: FeatureGroup[] = [
  {
    id: 'running-the-match',
    title: 'Running the match',
    icon: 'match',
    items: [
      {
        title: 'Ready up and go live',
        text: 'Players type .r to ready up; once enough of each team is ready, a countdown runs and the match goes live on its own.',
        plugin: 'match',
      },
      {
        title: 'Knife round and side pick',
        text: 'The knife round winner picks a side, or chooses to stay, switch or swap, before the match starts.',
        plugin: 'match',
      },
      {
        title: 'Tactical and tech pauses',
        text: '.pause and .unpause for a tactical break; a tech pause covers a broken PC or connection instead.',
        plugin: 'match',
      },
      {
        title: 'Forfeit on a no-show',
        text: 'If a team does not come back within a set time, the match ends in a forfeit.',
        plugin: 'match',
      },
      {
        title: 'Call an admin',
        text: '.admin [message] pings the admins on duty and tells them what happened.',
        plugin: 'match',
      },
    ],
  },
  {
    id: 'admins-and-fairness',
    title: 'Admins and fairness',
    icon: 'admins',
    items: [
      {
        title: 'Admin commands',
        text: 'Admins get their own command set, from adding admins to running a raw console command, kept in a small file with no database.',
        plugin: 'essentials',
      },
      {
        title: 'Round backups and restore',
        text: 'Every round is backed up; an admin can restore any of them with .restore <round> if something goes wrong.',
        plugin: 'match',
      },
      {
        title: 'Crash and restart recovery',
        text: 'If the server crashes or restarts mid-match, the live match, score and stats carry on from where they left off.',
        plugin: 'match',
      },
      {
        title: 'Only listed players join',
        text: 'A whitelist keeps a practice or scrim server to the players on the list; a loaded match roster decides once a match starts.',
        status: fullBundleOnly,
        plugin: 'whitelist',
      },
      {
        title: 'Map and server commands',
        text: 'Admins change, reload or restart the map from chat; it refuses to during a live map unless forced.',
        plugin: 'essentials',
      },
    ],
  },
  {
    id: 'after-the-match',
    title: 'After the match',
    icon: 'after',
    items: [
      {
        title: 'Demos, recorded automatically',
        text: 'GOTV demos record for every map and stream to the platform as they record, so there is no upload wait at the end.',
        plugin: 'match + fleet',
      },
      {
        title: 'Full player stats',
        text: 'Kills, deaths, damage, KAST, clutches and entries, worked out for every round and map.',
        plugin: 'match',
      },
      {
        title: 'Results go back to the platform',
        text: 'Match state, round results and the final score stream live to whatever is running the event, over one outbound connection.',
        plugin: 'fleet',
      },
    ],
  },
  {
    id: 'practice-and-fun',
    title: 'Practice and fun',
    icon: 'practice',
    items: [
      {
        title: 'Practice mode',
        text: '.prac switches on cheats, a full grenade set and infinite ammo, with tools like .savepos, .rethrow and .bot; set it to always on for a dedicated practice server.',
        plugin: 'practice',
      },
      {
        title: 'Scenarios',
        text: 'Replay a recorded pro round: you stand where they stood while bots replay the other nine players.',
        plugin: 'practice',
      },
      {
        title: 'Grenade lineups',
        text: 'Save, load and list your own grenade lineups per map, kept in a shared library on the server.',
        plugin: 'practice',
      },
      {
        title: 'Deathmatch',
        text: 'Free-for-all or team deathmatch with a kill or time limit and a live leaderboard, on the same server.',
        status: fullBundleOnly,
        plugin: 'deathmatch',
      },
      {
        title: 'Loadouts and skins',
        text: 'Weapon paints, knives, gloves and agents, from a JSON file or set by the platform; switched off for esports matches.',
        status: fullBundleOnly,
        plugin: 'skins',
      },
      {
        title: 'Midas',
        text: "Turn a player, or the map's best player, into Midas: everything they pick up turns gold.",
        status: fullBundleOnly,
        plugin: 'midas',
      },
      {
        title: 'Steam Workshop addons',
        text: 'The server downloads and mounts the Workshop addons you list, on every map change.',
        status: fullBundleOnly,
        plugin: 'addons',
      },
    ],
  },
];

/* ------------------------------------------------------------------------ */
/* Games                                                                     */
/* ------------------------------------------------------------------------ */

const manual = (slug: string, name: string): Game => ({
  slug,
  name,
  image: `/games/${slug}.webp`,
  badge: { label: 'Manual reporting · 3.0', tone: 'soon' },
  line: 'Captains report the score, the other captain agrees.',
});

export const games: Game[] = [
  {
    slug: 'cs2',
    name: 'Counter-Strike 2',
    image: '/games/counter-strike-2.webp',
    badge: { label: 'Included', tone: 'stable' },
    line: 'Your own servers. Veto, live scores, demos and stats.',
    summary:
      'With the CS2 module, Auto Tournament loads each match on your CS2 servers, and the match plugin reports every round, the result and the demo back. These are the plugins and tools that run on the servers.',
    description:
      'Counter-Strike 2 with Auto Tournament: the Ready Up match plugin, CS2 Server Manager, skins and Midas, and what commercial use needs.',
    tools: [readyUp, csm, skins, midas],
    others: [
      {
        name: 'Auto Tournament CS2',
        line: 'The older CS2 plugin, on Metamod and CounterStrikeSharp. What Auto Tournament 2.x talks to; 3.0 moves to Ready Up.',
        href: repo.cs2Plugin,
        badge: { label: 'MIT, free for any use', tone: 'free' },
      },
    ],
  },
  manual('rocket-league', 'Rocket League'),
  manual('valorant', 'Valorant'),
  manual('league-of-legends', 'League of Legends'),
  manual('dota-2', 'Dota 2'),
  manual('deadlock', 'Deadlock'),
  manual('overwatch-2', 'Overwatch 2'),
  manual('rainbow-six-siege', 'Rainbow Six Siege'),
  manual('battlefield-6', 'Battlefield 6'),
  manual('call-of-duty', 'Call of Duty'),
  manual('team-fortress-2', 'Team Fortress 2'),
  manual('trackmania', 'Trackmania'),
  manual('chess', 'Chess'),
  manual('minecraft', 'Minecraft'),
  manual('ea-sports-fc-25', 'EA Sports FC'),
  manual('super-smash-bros-ultimate', 'Super Smash Bros. Ultimate'),
  manual('street-fighter-6', 'Street Fighter 6'),
  manual('tekken-8', 'Tekken 8'),
  manual('osu', 'osu!'),
  manual('age-of-empires-ii', 'Age of Empires II'),
];

/** Games with their own page (they have tools). */
export const gamesWithPages = games.filter((g): g is Game & { tools: Product[] } => Boolean(g.tools?.length));

export function findGame(slug: string) {
  return gamesWithPages.find((g) => g.slug === slug);
}

export function findTool(gameSlug: string, toolSlug: string) {
  const game = findGame(gameSlug);
  const tool = game?.tools.find((t) => t.slug === toolSlug);
  return game && tool ? { game, tool } : undefined;
}

export const gamePath = (game: Pick<Game, 'slug'>) => `/games/${game.slug}`;
export const toolPath = (game: Pick<Game, 'slug'>, tool: Pick<Product, 'slug'>) => `/games/${game.slug}/${tool.slug}`;

/** Every product page path, for the sitemap. */
export function productPaths(): string[] {
  return ['/platform', '/games', ...gamesWithPages.flatMap((g) => [gamePath(g), ...g.tools.map((t) => toolPath(g, t))])];
}
