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
  Prices read and Products read (and optionally Invoices read, see License keys). Unset means card checkout is off: the route
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

`yarn test` runs the checkout, Stripe price, license key, license email, account and CS2 compatibility tests.

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

## License keys

Every paid card checkout gets an Ed25519-signed license key. Ready Up and the
platform check it offline with an embedded public key. **Nothing ever
blocks**: a problem is a warning in the product, never a lockout.

### Flow

1. `POST /api/checkout` puts the pack, period and `max_servers` in the
   session metadata.
2. Stripe calls `POST /api/stripe/webhook` (`checkout.session.completed`,
   `checkout.session.async_payment_succeeded`). The route checks the Stripe
   signature, then issues one key per Checkout Session (`src/lib/license`).
3. `/pricing/thanks?session_id=cs_…` shows the key. If the webhook hasn't
   arrived yet, the page asks Stripe whether the session is paid and issues
   the key itself (same one-per-session store, so never two keys).
4. The key is emailed to the address paid with, once (see "License email"
   below; off until Postmark is set up).
5. `/license` gets a key again with the order reference (`cs_…`, shown on the
   thanks page) or the invoice number from Stripe's receipt, plus the email
   paid with. "Email it to me again" there sends it to that address, only when
   it is the one the license was bought with.

Issued keys live in `licenses.json` in `LICENSE_DATA_DIR` (default
`./data/licenses`, `/app/data/licenses` on the same `compat-data` volume),
written atomically, mode 600, with a SHA-256 of the buyer's email instead of
the email.

### Setup (once)

1. On your own machine: `node scripts/license-keygen.mjs`. It prints the
   private key and the public key; nothing is written to disk.
2. In `.env` next to `docker-compose.yml` on the server:
   - `LICENSE_SIGNING_KEY`: the private key it printed (base64 PKCS#8). Also
     keep it in your password manager. Never commit it.
   - `STRIPE_WEBHOOK_SECRET`: the endpoint's signing secret (`whsec_…`) from
     step 4. Unset, the webhook answers 404.
   - optional `LICENSE_DATA_DIR`.
3. Add the printed `{"<kid>": {…}}` entry under `keys` in
   `src/lib/license/public-keys.json` and commit it (public keys are not
   secret). Give the same `kid` and `x` to Ready Up and the platform.
4. Stripe Dashboard → Developers → Webhooks → Add endpoint:
   `https://autotournament.gg/api/stripe/webhook`, events
   `checkout.session.completed` and `checkout.session.async_payment_succeeded`.
   Copy its signing secret into `STRIPE_WEBHOOK_SECRET`.
5. Optional: give the site's restricted Stripe key **Invoices: Read**, so the
   invoice number can be used on `/license`. Without it, only the order
   reference works.
6. `docker compose up -d`.

Without `LICENSE_SIGNING_KEY`, no keys are issued: the webhook answers 503 so
Stripe retries for up to 3 days, and the thanks page shows the old "we'll
email your confirmation" text. Look for `[license]` in the container log.

### License email

When a key is issued (webhook or thanks page), the site emails it to the
Checkout Session's email through Postmark's HTTP API: the key, pack, period,
what it covers, order reference and invoice number, and the seller footer.
Replies go to sivert@autotournament.gg. Open and click tracking are off.

Exactly once per license: the send is claimed in the store and `emailed_at` is
written to the license's record in `licenses.json` when it works. A failed send
never fails the webhook or the key; it logs `[license] email failed` with the
license id and the error (never the address) and keeps it in `email_error`. It
is tried again when Stripe delivers the event again (Stripe Dashboard →
Webhooks → the event → Resend), or the buyer uses "Email it to me again" on
`/license` (rate-limited: 5 per IP per 10 minutes, 3 per license per hour).

Env, in `.env` on the server (all optional; unset `POSTMARK_SERVER_TOKEN` means
no email is sent and the site works as before):

- `POSTMARK_SERVER_TOKEN`: the Server API token (Postmark → the server → API
  Tokens). Secret.
- `EMAIL_FROM`: default `Auto Tournament <licenses@autotournament.gg>`.
- `POSTMARK_MESSAGE_STREAM`: default `outbound` (the transactional stream).

Postmark setup (once), in this order:

1. Postmark → Sender Signatures → Add Domain: `autotournament.gg`.
2. Postmark shows a DKIM TXT record and a Return-Path CNAME (for example
   `pm-bounces`). Add both in Cloudflare → autotournament.gg → DNS, as shown
   there, with the proxy off (DNS only). Keep the Email Routing MX and SPF
   records as they are: Postmark doesn't need the root SPF, the Return-Path
   covers it.
3. Wait for Postmark to verify both, then send a test from Postmark to
   yourself.
4. A new Postmark account can only send to its own domain until Postmark
   approves it: request approval in the account if it isn't yet.
5. Put the token in `.env` and `docker compose up -d`.
6. Optional: a DMARC record (`_dmarc` TXT) once DKIM passes.

### Your licenses (/account)

Buyers sign in with an emailed link (no password) and see every license bought
with that email, newest first: licensee, pack, kind, period, status, license
id, order reference, the key, the public check link, and the versions covered.

- `POST /api/account/link { email }` emails a single-use link valid 15 minutes,
  only when a license has that email's hash. Same answer either way; sent
  after the response. Limits: 5 per IP per 10 minutes, 3 per email per hour.
- The link opens `/account/signin?token=…`, which only shows a button (mail
  scanners that open links don't use it up). The button posts to
  `/api/account/signin`, which sets the session cookie (`__Host-at-account`:
  HttpOnly, Secure, SameSite=Lax, 30 days, HMAC-signed) and goes to `/account`.
  `/api/account/signout` ends the session.
- Tokens and sessions are kept in `account.json` next to `licenses.json`, as
  SHA-256 hashes with the email hash (never the email), mode 600, expired
  entries dropped on every write. Deleting the file signs everyone out.
- Versions covered come from the GitHub releases of Ready Up and CS2 Server
  Manager (plus the platform for Platform packs), public API, cached an hour.
  When GitHub can't be read, the section is hidden.

Env, in `.env` on the server:

- `ACCOUNT_SESSION_SECRET`: at least 32 characters, for signing the session
  cookie. Make one with `openssl rand -base64 48`. Changing it signs everyone
  out.

/account is on only when both `ACCOUNT_SESSION_SECRET` and
`POSTMARK_SERVER_TOKEN` are set; otherwise it says sign-in isn't available and
the routes answer 404.

### Public license check (/verify)

`/verify/<license id>` shows the licensee, pack and server limit, kind,
period, updates until, and a status: valid, upcoming, expired, test, or not
found (the same for every unknown id). Never the key, email, customer id or
order reference. 30 checks per IP per minute, not indexed. `/license` has a
"Check a license" form; the thanks page and /account show each license's check
link. Always on.

**Rotating:** run the keygen again, add the new public key to
`public-keys.json` (keep the old one, so old keys still verify), ship the new
public key in the products, then swap `LICENSE_SIGNING_KEY`.

### Token format (v1)

```
ATL1.<payload>.<signature>
```

- `payload`: base64url (no padding) of the UTF-8 JSON below.
- `signature`: base64url (no padding) of the 64-byte Ed25519 signature over
  the ASCII bytes of `ATL1.<payload>`.
- The payload's `kid` picks the public key. `kid` is the first 16 base64url
  characters of SHA-256 of the raw 32-byte public key.

```json
{
  "v": 1,
  "kid": "LsbOKx91J9fIxM0s",
  "id": "L-3kq8Zx0bQ1aR",
  "customer": "cus_…",
  "licensee": "Example LAN AS",
  "product": "servers",
  "pack": "M",
  "max_servers": 15,
  "kind": "event",
  "issued_at": "2026-09-28T10:11:12Z",
  "updates_until": "2026-10-05",
  "valid_from": "2026-10-03",
  "valid_to": "2026-10-05"
}
```

- `customer`: Stripe customer id, or the email when Stripe has none.
  `licensee` (the business name) is optional.
- `product`: `servers` | `platform`; `pack`: `S` | `M` | `L`; `kind`:
  `event` | `year` | `founder`.
- Coverage is by **version line**. Each release carries `line_date`, the
  release date of its `major.minor.0`. A release is covered when
  `line_date <= updates_until` (dates are `YYYY-MM-DD`, inclusive), so later
  patches of a covered line stay covered.
  - `event`: `valid_from`..`valid_to` is the event window (the dates from the
    checkout form, at most 5 days; 5 days from the purchase if they can't be
    read). `updates_until` = `valid_to`.
  - `year`: `updates_until` = purchase + 12 months. No `valid_*`: commercial
    use of covered lines goes on after that.
  - `founder`: `updates_until` = `9999-12-31`.
- Ignore unknown fields. Treat any other `v` as "needs a newer release".

`GET /api/license/public-keys` returns
`{ "alg": "Ed25519", "format": "ATL1", "keys": { "<kid>": { "kty": "OKP", "crv": "Ed25519", "x": "<base64url>" } } }`.

### Reference verifier

`scripts/license-verify.mjs` is the logic the products port. Offline; it
uses `src/lib/license/public-keys.json` unless given `--keys`:

```bash
node scripts/license-verify.mjs <token> [--line-date YYYY-MM-DD] [--servers N] [--product servers|platform] [--now YYYY-MM-DD] [--keys file.json]
```

It returns `{ valid, status: "ok" | "warning" | "invalid", warnings: [{ code, message }], license }`
and never "blocked". Warning codes: `updates_expired` (line date after
`updates_until`), `too_many_servers`, `period_ended` / `period_not_started`
(event window), `wrong_product` (a Servers key in the platform). Invalid
codes: `malformed`, `unknown_kid`, `bad_signature`, `unsupported_version`.
Tests: `src/lib/license/license.test.ts` (throwaway keys made at runtime).

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
