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
- `STRIPE_COMMUNITY_COUPON`: ID of a 50% off coupon for the community
  discount. Unset means community orders go by email.
- `SITE_URL`: base URL for Stripe's return links. Defaults to
  `https://autotournament.gg`.

The route checks each Stripe price against `src/components/pricing.ts` before
using it (product name, active, EUR, one-time, per unit, amount), so change
prices in both places. After editing `.env`, run `docker compose up -d` to
restart the container with the new values.

`yarn test` runs the checkout validation tests.

## Still to do

- Record the product preview video and put it in `public/preview.mp4`
  (the hero shows a labelled placeholder until then).
- An Open Graph image.

## Sponsors

Your logo here — [sponsor Auto Tournament](https://discord.gg/n7gHYau7aW) to be listed.
