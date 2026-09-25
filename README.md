# autotournament.gg

The Auto Tournament homepage. Next.js (app router), React, TypeScript and MUI.

<div align="center">

### Sponsor Auto Tournament

Running tournaments or LANs with Auto Tournament? Your organisation can keep it growing.
Auto Tournament is built and maintained by one person — sponsorships pay for development, test servers and infrastructure.

[![Sponsor on GitHub](https://img.shields.io/badge/Sponsor-GitHub-ea4aaa?logo=githubsponsors&logoColor=white)](https://github.com/sponsors/sivert-io)
[![Support on Ko-fi](https://img.shields.io/badge/Support-Ko--fi-ff5e5b?logo=kofi&logoColor=white)](https://ko-fi.com/sivert)
[![Become a sponsor](https://img.shields.io/badge/Become%20a%20sponsor-Discord-5865F2?logo=discord&logoColor=white)](https://discord.gg/n7gHYau7aW)

Using it for a business, paid events or hosting? That needs a commercial licence → [Licensing](https://docs.autotournament.gg/reference/licensing)

</div>

`src/theme/tokens.ts` and `src/theme/theme.ts` are the Auto Tournament design
system: colours, type, radii and motion. The app will move onto the same theme.

```bash
yarn install
yarn dev        # http://localhost:4611
yarn build
```

`drafts/` holds the static HTML design drafts the site was built from.

## Deploy

Runs as a Docker container on the docs host. A cron job runs
`scripts/auto_update.sh` every five minutes and rebuilds when `main` has a new
commit. The container listens on port 31236, and the astro Cloudflare tunnel
routes `autotournament.gg` to `http://dev.lan:31236`.

## Payments

The price calculator's "Buy with card" button starts a Stripe Checkout
Session through `POST /api/checkout`. Set these in a `.env` file next to
`docker-compose.yml` on the server (git- and docker-ignored, read at runtime;
`env_file` with `required: false` needs Docker Compose 2.24 or newer):

- `STRIPE_SECRET_KEY`: a Stripe restricted key with Checkout Sessions write,
  Prices read and Products read. Unset means card checkout is off: the route
  answers 503 and the calculator offers the email request instead.
- `SITE_URL`: base URL for Stripe's return links. Defaults to
  `https://autotournament.gg`.

After editing `.env`, run `docker compose up -d` to restart the container
with the new values.

Checkout asks the buyer to accept the Commercial License Terms and Terms of
Sale (`consent_collection.terms_of_service`). Stripe needs a Terms of service
URL in Dashboard → Settings → Public details first
(`https://autotournament.gg/terms`); without it, creating a Checkout Session
fails and the calculator falls back to the email request.

`yarn test` runs the checkout, Stripe price and CS2 compatibility tests.

## Prices live in Stripe

Stripe is the single source of truth for the pack prices and server limits.
There is one Product per pack (`Servers S` … `Platform L`) and three one-time
EUR Prices on each, found by lookup key `<pack>_<period>`, for example
`servers_l_event`, `servers_l_year`, `servers_l_founder`. The pack's server
limit is the Product's `max_servers` metadata.

The pricing page, the terms page and `/api/checkout` read them through
`src/lib/stripePrices.ts` (cached for 5 minutes) and check them before use:
all 18 prices present and active, EUR, one-time, tax exclusive, and server
limits that grow S < M < L. If Stripe can't be read, or the list fails the
check, the site keeps the last good prices; with none yet (for example right
after a restart), it shows `FALLBACK_PACKS` from `src/components/pricing.ts`
and card checkout answers 503, so nobody pays a price that didn't come from
Stripe. Look for `[prices]` in the container log to see why.

`scripts/stripe-seed-packs.mjs` creates and updates the products and prices.
It needs its own restricted key (not the website's), with **Products: Write**
and **Prices: Write** and nothing else. Create it in the Stripe Dashboard →
Developers → API keys → Create restricted key. Run the script from this
folder on your Mac after `yarn install`. The key is typed at a hidden prompt,
so it never lands in your shell history.

Dry run first. It prints what would change and changes nothing:

```bash
cd ~/dev/autotournament/website && (printf 'Stripe admin key: '; read -rs STRIPE_ADMIN_KEY; echo; STRIPE_ADMIN_KEY="$STRIPE_ADMIN_KEY" node scripts/stripe-seed-packs.mjs --dry-run)
```

Then the same command without `--dry-run` to apply it. Add `--archive-v1` to
also archive the four old per-seat v1 products ("Servers license: per event",
"Servers license: yearly", "Platform license: per event", "Platform license:
yearly"). Running it again changes nothing when Stripe already matches.

### Changing prices

Preferred: edit the `PACKS` table at the top of
`scripts/stripe-seed-packs.mjs` (and `FALLBACK_PACKS` in
`src/components/pricing.ts` to match), commit, then run the script (dry run
first). A new amount creates a new price, moves the lookup key to it and
deactivates the old one, so the old price stays in Stripe as history. A new
server limit updates the product's name and `max_servers`. The site picks it
up within 5 minutes; no deploy needed.

In the Dashboard instead: Product catalog → the pack's product → Add another
price. One-off, EUR, the new amount, tax behavior *exclusive* ("Include tax in
price: No"). Under the advanced options, set the lookup key (for example
`servers_l_event`) and transfer it from the old price. Then archive the old
price. Update the `PACKS` table to the same amount afterwards, or the next
script run puts the table's amount back.

## CS2 compatibility

`/compatibility` shows whether Ready Up works on the latest CS2 build: the
verdict, each plugin's checks, the CS2 patch and build id, and recent runs.
Ready Up's CI (`cs2-update-watch.yml` in the ready-up repo, contract in its
`docs/CS2-COMPAT.md`) posts every run update, from `queued` to the verdict,
to `POST /api/compat/events`. The page follows along live over server-sent
events (`GET /api/compat/stream`) and polls every minute if the stream fails.

Public JSON: `GET /api/compat/latest`, `GET /api/compat/runs?limit=20` and a
shields.io badge at `GET /api/compat/badge.json`
(`https://img.shields.io/endpoint?url=https://autotournament.gg/api/compat/badge.json`).

Set in `.env` next to `docker-compose.yml`:

- `COMPAT_INGEST_TOKEN`: the Bearer token the CI sends, at least 16
  characters (`openssl rand -hex 32`). Unset means the ingest endpoint
  answers 404. In the ready-up repo, set the same value as the secret
  `COMPAT_INGEST_TOKEN`, and the variable `COMPAT_INGEST_URL` to
  `https://autotournament.gg/api/compat/events`.
- `COMPAT_DATA_DIR` (optional): where the runs are kept, default
  `./data/compat` (`/app/data/compat` in the container).
- `COMPAT_FEED_URL` (optional): until the first push arrives, the site reads
  Ready Up's published `compat.json` from its `cs2-build` branch (at most every
  5 minutes, keeping the last good copy). Set a URL to always read that file
  as well, or `off` to never read one.

The newest 200 runs live in one JSON file, rewritten atomically (temporary
file, then rename). `docker-compose.yml` keeps it on the `compat-data` volume,
so it survives rebuilds. Look for `[compat]` in the container log.

## Still to do

- Record the product preview video and put it in `public/preview.mp4`
  (the hero shows a labelled placeholder until then).
- An Open Graph image.

## Sponsors

Your logo here — [sponsor Auto Tournament](https://discord.gg/n7gHYau7aW) to be listed.
