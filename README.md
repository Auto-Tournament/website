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
  Prices read and Products read (optionally Invoices read, see License keys,
  Customer portal write, see Console, and Refunds write, see Refunds). Unset means card checkout is off: the route
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

`yarn test` runs the checkout, Stripe price, license key, license email, console (on an in-memory Postgres, PGlite) and CS2 compatibility tests.

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
5. The license goes into an organization in the console
   (console.autotournament.gg), made from the checkout details (see
   "Organizations from checkout" under Console). The buyer signs in with the
   email they paid with and lands on their licenses. That is the one place
   to see a license or its key again; the site itself no longer has a "get
   it again" page.

Issued keys live in Postgres (the `licenses` table, see Console), with a
SHA-256 of the buyer's email instead of the email. Until the console they
lived in `licenses.json` in `LICENSE_DATA_DIR` (default `./data/licenses`,
`/app/data/licenses` on the `compat-data` volume). At every start the site
imports the licenses from that file that aren't in the database yet (log:
`[license] licenses.json import { inFile, imported }`) and never changes the
file, so it stays as a backup of the keys issued before the move.

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
   `checkout.session.completed` and `checkout.session.async_payment_succeeded`
   (issuing), plus `charge.refunded`, `refund.updated` and `refund.failed`
   (refunds, see the admin CRM's Refund below).
   Copy its signing secret into `STRIPE_WEBHOOK_SECRET`.
5. Optional: give the site's restricted Stripe key **Invoices: Read**, so the
   invoice number is available too. Without it, only the order reference
   shows up.
6. `docker compose up -d`.

Without `LICENSE_SIGNING_KEY`, no keys are issued: the webhook answers 503 so
Stripe retries for up to 3 days, and the thanks page shows the old "we'll
email your confirmation" text. Look for `[license]` in the container log.

### License email

When a key is issued (webhook or thanks page), the site emails it to the
Checkout Session's email through Postmark's HTTP API: the key, pack, period,
what it covers, order reference and invoice number, and the seller footer.
Replies go to sivert@autotournament.gg. Open and click tracking are off.

Exactly once per license: the send is claimed in the database and `emailed_at` is
written to the license's row when it works. A failed send
never fails the webhook or the key; it logs `[license] email failed` with the
license id and the error (never the address) and keeps it in `email_error`. It
is tried again when Stripe delivers the event again (Stripe Dashboard →
Webhooks → the event → Resend), or from the console's admin resend action.

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

### Public license check (/verify)

`/verify/<license id>` shows the licensee, pack and server limit, kind,
period, updates until, and a status: valid, upcoming, expired, test, or not
found (the same for every unknown id). Never the key, email, customer id or
order reference. 30 checks per IP per minute, not indexed. `/verify` itself
has the "Check a license" form (also linked from the nav); the thanks page
and the console show each license's check link. Always on.

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

## VAT threshold alerts

Sivert's ENK must register for Norwegian VAT (Merverdiavgiftsregisteret) once
rolling 12-month license revenue passes NOK 50,000. `src/lib/vat/threshold.ts`
sums every live-mode paid license's `amount_total` (on the `licenses` row:
card sales in EUR, manual ones in EUR or NOK, see `src/lib/license/sales.ts`)
from the trailing 365 days, leaving out licenses marked refunded, converts it to NOK with Norges Bank's daily
EUR/NOK rate (`src/lib/vat/rate.ts`, no key needed, cached 12h; a conservative
12.0 fallback if Norges Bank can't be reached), and emails the seller
(`seller.email`, `src/components/seller.ts`) through Postmark the first time
the rolling total crosses 70%, 90% and 100% of the threshold. The email lists
the rolling total (NOK and EUR), the rate used, every sale in the window, and
the next step (register via Altinn, then update the "No VAT added" text and
Stripe tax settings). Each threshold is tracked in the `vat_alerts` table and
fires again if the total later drops back below it (old sales leaving the
window) and re-crosses.

The check runs after every issued live-mode paid license (the webhook and the
thanks page both go through `issueForSession`) and once a day at server start
(`src/lib/db/startup.ts`). It never blocks or fails license issuing or
startup: a failure is only logged.

Env, in `.env` (both optional):

- `VAT_THRESHOLD_NOK`: default `50000`.
- `VAT_ALERTS`: default on; set to `off` to disable the check entirely.

Without `POSTMARK_SERVER_TOKEN`, a crossed threshold is only logged (the
percentage, never an amount or the email).

All sales are converted with the latest rate rather than each sale's own
day's rate — the rate moves little day to day, and per-day conversion would
need one Norges Bank request per unique day. The rate used is always shown in
the alert email. A license marked refunded in the admin CRM leaves the total;
a revoked one (money kept) stays in it.

Tests: `src/lib/vat/threshold.test.ts`, `src/lib/vat/rate.test.ts`,
`src/lib/vat/email.test.ts`.

## Console (console.autotournament.gg)

The customer area: sign in, organizations with members, their licenses and
keys, and invoices; and, for Auto Tournament staff, the admin CRM at `/admin`
(below). Same app and
container as the site: `src/proxy.ts` maps the host `console.autotournament.gg`
onto the routes in `src/app/console` (`/licenses` is `src/app/console/(org)/licenses`),
and the main site's `/account` redirects there. When `AUTH_URL` is a
localhost URL (development), the console is at `/console` on the same host
instead.

- **Sign-in** (Auth.js / next-auth v5, `src/lib/console/auth.ts`): an emailed
  link (Postmark, single use, 15 minutes; the link opens a page with a button,
  so mail scanners don't use it up, and carries only the token, not the
  address) or Google. No passwords. Database sessions for 30 days, stored as a
  SHA-256 of the cookie. Cookies are host-only (`__Host-` session cookie), so
  they belong to the console's host alone. Google accounts are accepted only
  when Google says the email is verified, and are then linked to an existing
  user with that email. Without `POSTMARK_SERVER_TOKEN`, email links are off in
  production; in development (`yarn dev`) the link is printed to the log.
- **Organizations**: name, org number, VAT ID, country, billing address.
  Roles owner, admin and member. Members see the licenses; owners and admins
  invite (email link, 7 days, single use, only for the invited address, token
  kept as a hash), change roles, remove members and open billing; only owners
  make owners, and the last owner can't leave. One person can be in several
  organizations (operators working for clients): the switcher at the top.
- **Organizations from checkout** (`src/lib/console/checkoutOrg.ts`): when a
  card license is issued (webhook or thanks page, same code path), it goes
  into (1) the organization chosen on the console's Buy page
  (`metadata.org_id`), else (2) the organization whose Stripe customer paid,
  else (3) an organization with the same VAT id / org number (normalized)
  that the buyer already belongs to or is the pending owner of (a VAT id is
  public, so a match alone never gives access), else (4) a new one from the
  checkout's business name (never the event/client field), tax id, country,
  billing address and Stripe customer. The buyer of a new one is its owner:
  at once when a user with that verified email exists, else a pending owner
  kept only as the email's SHA-256 (`org_pending_owners`) until they sign in
  with that address, verified (Auth.js `events.signIn`, and `/` as a
  fallback). Once per license (`licenses.org_resolved_at`, row lock), so a
  redelivered webhook changes nothing. Older card licenses without an
  organization are run through it once in the background at startup (one
  Stripe read each; a buyer who already has an organization keeps "Licenses
  bought with your email" instead). The admin org page's History shows
  "Created from checkout cs_…".
- **Licenses**: each organization's licenses, with the key, the public check
  link, status and the versions covered. "Licenses bought with your email"
  lists licenses whose email hash matches the signed-in user's verified email
  and that aren't in an organization yet, with "Add to <org>". Checkout stays
  guest-friendly: no account needed to buy.
- **Billing**: "Invoices and payment details" opens a Stripe customer portal
  session for the organization's Stripe customer (taken from the first
  license with a Stripe customer added to it, in the same mode as the key).
  Needs the key permission below; without it the page says it isn't
  available yet.
- **Buy**: the pack cards, with checkout through the same `/api/checkout`. On
  the console's host the route sees the session, so checkout gets the
  organization's Stripe customer (owners and admins; otherwise the user's
  verified email) and
  `metadata.org_id`, and the webhook issues the license straight into the
  organization. From the main site, checkout is as before, and the
  organization comes from the checkout details (above).
- **Audit log**: every write (and sign-in) goes into `audit_log`: actor, action,
  organization, target, time, details. Never tokens.
- `users.is_admin` marks Auto Tournament staff (the admin CRM). It follows
  `ADMIN_EMAILS` (below); don't set it by hand.

Retention (also in the privacy policy): expired sessions and sign-in links are
deleted at startup and daily, invites 30 days after they are used, withdrawn or
expired, audit log entries after 2 years, and contact form leads 24 months
after their last activity.

### Admin CRM (/admin)

`console.autotournament.gg/admin` (`src/app/console/admin`, logic in
`src/lib/admin`), for the addresses in `ADMIN_EMAILS` only. A user whose
verified email is in the list gets `is_admin` at sign-in and at startup, and
loses it when the address leaves the list; every admin page, action and route
also checks the list again, so a removal counts at once. Everyone else gets a
404, as if the pages weren't there. Without `ADMIN_EMAILS` nobody is admin. The
console's header shows "Admin" to admins only. Every admin write goes into the
audit log with the admin as the actor; signing and email actions are
rate-limited (20 per 10 minutes).

- **Overview**: sales and revenue for the last 30 days and 12 months (EUR and
  NOK), the VAT threshold bar (the same sales and rate as the VAT alert),
  founder packs sold of 25 and days to 31 March 2027, licenses ending in the
  next 30 days, recent and unpaid orders, open leads, and the bookkeeping CSV.
- **Licenses**: search and filter; the detail page has the key, the public
  check link, organization, Stripe Dashboard links (built from the ids),
  email status, notes and history. Actions:
  - *Reissue*: signs a new key with the current `LICENSE_SIGNING_KEY` (new id,
    same email hash, organization and customer) and sets the old row's
    `superseded_by`. The old key keeps working offline; `/verify` shows it as
    "Replaced by <new id>", and the console shows the newest key for that
    organization. An amount entered is the difference paid (it counts
    as a sale), never the original again.
  - *Refund*: gives the money back and records it. A card license: refunds
    the Checkout Session's PaymentIntent through Stripe (the whole amount
    left, or the amount typed, in the license's currency; reason
    requested_by_customer, duplicate or fraudulent; a note), after the
    browser's own dialog shows the amount and the license. **Every refund is
    confirmed by email first**: the button only creates a pending request
    (`refund_requests`) and emails the signed-in admin's own verified address
    ("Confirm refund of €X for <license id>": licensee, pack, amount, reason,
    who asked and when, plus a cancel link). The link opens
    `/refunds/confirm`, which changes nothing by itself (mail scanners open
    links); its Confirm button (a POST) needs the same admin signed in, and the
    token valid, unused and under 15 minutes old (single use, stored as a
    SHA-256 only). Only then does the refund below run. One pending request per
    license (a new one cancels the old), 5 requests per admin per hour; the
    license page lists pending ones with a Cancel button. The email's cancel
    link can also sign that admin out of every session. Without Postmark
    (`POSTMARK_SERVER_TOKEN`) refunds are refused: there is no path without
    the confirmation. Expired requests are pruned daily, finished ones after
    30 days (the activity log keeps what happened). A bank-transfer
    license: nothing is sent anywhere, it records the refund (amount, date,
    bank reference). A full refund marks the license (and its reissue chain)
    refunded, as below; a partial one keeps it valid and records
    `refunded_amount`, which revenue and the VAT total take off. Optionally
    emails the buyer a short "your license was refunded" note (Postmark, to the
    address it was bought with only). Never twice: the payment's refunds are
    read from Stripe first, the Stripe call has an idempotency key
    (`refund:<license id>:<amount>:<refunded before>`), and a request confirms
    once. 10 confirmed refunds per admin per hour. Needs **Refunds:
    Write** on the site's key (and Checkout Sessions: Read, part of the write
    permission it already has); without it the page says which permission to
    add. The webhook keeps it in step with Stripe: `charge.refunded` (a refund
    from here or from the Stripe Dashboard) records the charge's refunded
    total and, when it is all of it, marks the license refunded; a redelivered
    or late event changes nothing. `refund.updated`/`refund.failed` for a
    failed or canceled refund puts the amount back into revenue once and turns
    a "refunded" license into "revoked" (the key stays off; reissue it if the
    buyer keeps it). The license is found by the PaymentIntent stored at
    issuing, or for older licenses through Stripe's Checkout Session list.
    These audit entries have the actor `stripe`.
  - *Mark refunded or revoke*: sets `revoked_at` and the reason without moving
    money; never deletes.
    `/verify` says "Revoked", the console stops showing the key,
    and a refunded license leaves revenue, the VAT total and the founder count.
  - *Resend license email*: to the address it was bought with only (checked
    against the stored hash); for a card purchase it can read the address from
    the Checkout Session.
  - *Notes* (`admin_notes`), on licenses and organizations.
- **New license** (bank transfer / invoice): `manual_orders`. Paid: the key is
  issued at once into `licenses` (`source = 'manual'`, with amount, currency
  EUR or NOK, and payment reference) and optionally emailed. Not paid yet: no
  key; "Mark paid" issues it. The buyer email is kept as a hash, like card
  purchases. Unpaid founder orders hold a place under the founder cap, which
  checkout and the pricing page count too.
- **Organizations** and **Users**: members, licenses, Stripe customer, notes,
  the organization's history (its audit log);
  users with organizations and last sign-in (from the audit log).
- **Leads**: every `/contact` message is stored in `leads` as well as emailed
  (status new/replied/won/lost and a note; "Reply" opens your mail app).
  Deleted 24 months after the last activity (`src/lib/db/prune.ts`).
- **Free LANs**: the register of free LAN confirmations, from a lead or by hand.
- **Audit log**: filter by actor (email, user id or `system`) and action prefix.
- **Bookkeeping export**: the Export button on the overview (a same-origin
  `POST /admin/export/sales` with `from`, `to` and a passkey approval), paid
  sales as CSV (date, license id, licensee, country, amount, currency,
  NOK amount, payment reference, rate). NOK amounts use Norges Bank's EUR/NOK
  rate of each sale's day (the business day before on weekends), fetched in
  one request; the latest rate if that fails.
- **Passkeys**: see below.

#### Admin passkeys

On top of the console sign-in, the admin CRM needs a passkey (Touch ID, Face
ID, Windows Hello or a security key; WebAuthn through SimpleWebAuthn, logic in
`src/lib/admin/passkeys.ts`). The relying party is the console's origin
(`AUTH_URL`): RP ID `console.autotournament.gg`, `localhost` in development.
Only the public key is stored (`admin_passkeys`).

- **First passkey**: an admin without one sees only "Set up a passkey" on
  /admin, and every admin action and the export are refused. Adding a passkey
  always goes through a link emailed to the admin's own verified address
  (`/passkeys/add`, single use, 15 minutes, token stored as SHA-256), opened
  while signed in as that admin, so a stolen console session alone can't add
  one. With a passkey already, adding another also needs this session to have
  passed the passkey check. An email goes out whenever a passkey is added.
  Several passkeys are allowed; rename them on /admin/passkeys; removing one
  needs a passkey approval, and the last working one can't be removed.
- **Once per session**: /admin asks for the passkey once per console session;
  the check holds 12 hours (`admin_session_checks`, tied to the session row,
  so signing out ends it).
- **Approvals**: right before confirming a refund (on the email-link page,
  on top of the link), reissuing, marking refunded/revoked, creating a manual
  license, marking an order paid, the sales export and removing a passkey,
  the browser asks for a fresh passkey check. The server's challenge is bound
  to the admin, the action and its target (license, order, refund request,
  passkey), lasts 2 minutes and works once; user verification is required and
  the signature counter must move forward.
- **Recovery** (every passkey lost): "Recover by email" on the passkey check
  sends the same kind of link (the address must still be in `ADMIN_EMAILS`).
  The passkey it adds starts to work **24 hours later**, and a warning email
  goes out at once. A hijacked inbox plus a console session gives no instant
  access; the real admin has a day to remove the recovery passkey with a
  passkey they still have, and to sign out everywhere (/admin/passkeys). If an
  admin is locked out for good, removing their address from `ADMIN_EMAILS`
  and adding it back doesn't skip this; delete their `admin_passkeys` rows in
  the database only after checking with them by another channel.
- Without Postmark in production no passkey link can be sent, so admins can't
  set up passkeys (in development the link goes to the server log, like the
  sign-in link).
- Audit log: `admin.passkey_link`, `admin.passkey_register`,
  `admin.passkey_recover`, `admin.passkey_rename`, `admin.passkey_remove`,
  `admin.passkey_approve` (action and target), `admin.passkey_counter_refused`,
  `auth.signout_everywhere`. Never credential data.

### Database

Postgres 17 runs as the `db` service in `docker-compose.yml` (volume
`db-data`, not published on the host, health-checked; the website waits for
it). The website gets `DATABASE_URL` from compose. Schema:
`src/lib/db/schema.ts` (Drizzle ORM). After a schema change, run
`yarn db:generate` and commit the new file in `drizzle/`; the app applies
pending migrations itself at startup (`src/instrumentation.ts`), so a deploy
needs nothing else. Look for `[db]` in the container log.

A backup, from your Mac:

```bash
ssh <host> 'docker exec autotournament-db pg_dump -U autotournament -Fc autotournament' > autotournament-$(date +%F).dump
```

### Env

In `.env` next to `docker-compose.yml` on the server:

- `POSTGRES_PASSWORD`: the database password. `openssl rand -hex 32` (hex, so
  it is safe inside `DATABASE_URL`). Required: without it `docker compose`
  refuses to build or start, so the running container stays as it is.
- `AUTH_SECRET`: at least 32 characters; signs Auth.js's cookies and hashes
  the email-link tokens. `openssl rand -base64 48`. Changing it signs
  everyone out and voids open sign-in links. Unset: the console says sign-in
  isn't available and `/api/auth` answers 404.
- `AUTH_URL`: `https://console.autotournament.gg`.
- `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`: the Google OAuth client (below).
  Unset: only the email link.
- `POSTMARK_SERVER_TOKEN`: as for the license email; the console sends the
  sign-in links and invites through it (tags `console-signin`, `console-invite`).
- `ADMIN_EMAILS`: comma-separated addresses that get the admin CRM, for
  example `sivertgullberg@gmail.com`. They must sign in with that address
  (email link or Google). Unset: nobody is admin.

`ACCOUNT_SESSION_SECRET` (the old `/account` page) is no longer used: remove it
from `.env`. The old `account.json` next to `licenses.json` can be deleted.

For local development, a throwaway Postgres and `.env.local`:

```bash
docker run -d --name at-console-pg -e POSTGRES_USER=at -e POSTGRES_PASSWORD=localtest -e POSTGRES_DB=at -p 127.0.0.1:55432:5432 postgres:17-alpine
printf 'DATABASE_URL=postgres://at:localtest@127.0.0.1:55432/at\nAUTH_SECRET=%s\nAUTH_URL=http://localhost:4611\nSITE_URL=http://localhost:4611\nADMIN_EMAILS=you@example.com\n' "$(openssl rand -base64 48)" > .env.local
yarn dev   # the console is at http://localhost:4611/console; sign-in links are printed in the log
```

### Setup (once)

1. **Cloudflare tunnel**: in the astro tunnel (Zero Trust → Networks →
   Tunnels → astro → Public hostnames), add `console.autotournament.gg` →
   `http://dev.lan:31236`, the same service as `autotournament.gg`. Cloudflare
   creates the DNS record.
2. **Google OAuth client**: Google Cloud Console → APIs & Services → OAuth
   consent screen: External, app name "Auto Tournament", support email,
   authorized domain `autotournament.gg`, scopes `openid`, `email`,
   `profile` only; publish it. Then Credentials → Create credentials → OAuth
   client ID → Web application: authorized JavaScript origin
   `https://console.autotournament.gg`, authorized redirect URI
   `https://console.autotournament.gg/api/auth/callback/google`. Put the
   client id and secret in `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`.
3. **Stripe**: give the site's restricted key **Customer portal: Write**
   (Developers → API keys → the key → Edit), and set up the portal once
   (Settings → Billing → Customer portal: turn on invoice history and
   updating billing details and payment methods; save). Until then the
   billing page says invoices aren't available yet.
4. Add the env vars above to `.env` and `docker compose up -d`. The first
   start creates the tables and imports `licenses.json`.

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
