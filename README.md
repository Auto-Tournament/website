# autotournament.gg

The Auto Tournament homepage. Next.js (app router), React, TypeScript and MUI.

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

## Still to do

- Record the product preview video and put it in `public/preview.mp4`
  (the hero shows a labelled placeholder until then).
- An Open Graph image.
