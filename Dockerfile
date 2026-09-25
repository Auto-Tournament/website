ARG GIT_COMMIT_SHA=unknown

FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json yarn.lock .yarnrc.yml* ./
RUN yarn install --immutable
COPY . .
RUN yarn build

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ARG GIT_COMMIT_SHA
LABEL org.opencontainers.image.revision=$GIT_COMMIT_SHA
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN echo "$GIT_COMMIT_SHA" > /app/BUILD_COMMIT
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# Ready Up compatibility runs (lib/compat/store.ts). docker-compose.yml mounts
# a volume here; a new named volume copies this directory's owner, so the
# node user can write to it.
RUN mkdir -p /app/data/compat && chown -R node:node /app/data
EXPOSE 3000
USER node
CMD ["node", "server.js"]
