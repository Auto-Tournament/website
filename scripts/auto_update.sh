#!/usr/bin/env bash
set -euo pipefail

# Auto-update autotournament.gg without inbound ports.
# - Fetch origin/<branch>
# - If deployed commit differs from remote: (optional pull) + docker compose up -d --build
# Safe for cron/systemd (uses a lock to prevent overlap).

REPO_DIR="${REPO_DIR:-/home/$USER/autotournament-website}"
BRANCH="${BRANCH:-main}"
COMPOSE_DIR="${COMPOSE_DIR:-$REPO_DIR}"
LOCK_FILE="${LOCK_FILE:-/tmp/autotournament-website-autoupdate.lock}"
# A build that runs longer than this is treated as hung and killed, so the lock
# is released and the next run retries. A normal build takes a few minutes.
BUILD_TIMEOUT="${BUILD_TIMEOUT:-20m}"

log() {
  echo "[$(date -Is)] $*"
}

if [[ ! -d "$REPO_DIR/.git" ]]; then
  log "ERROR: REPO_DIR is not a git repo: $REPO_DIR"
  exit 1
fi

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  log "Another update is running; exiting."
  exit 0
fi

cd "$REPO_DIR"

log "Fetching origin/$BRANCH..."
git fetch origin "$BRANCH" --prune

REMOTE="$(git rev-parse "origin/$BRANCH")"

DEPLOYED="$(docker inspect -f '{{ index .Config.Labels "org.opencontainers.image.revision" }}' autotournament-website 2>/dev/null || true)"
if [[ -z "${DEPLOYED:-}" ]]; then
  DEPLOYED="$(docker exec autotournament-website cat /app/BUILD_COMMIT 2>/dev/null | tr -d '\r\n' || true)"
fi

if [[ -n "${DEPLOYED:-}" && "$DEPLOYED" == "$REMOTE" ]]; then
  log "Up to date (deployed=$DEPLOYED)"
  exit 0
fi

LOCAL="$(git rev-parse HEAD)"
log "Deploying remote commit: $REMOTE (local=$LOCAL deployed=${DEPLOYED:-none})"

# Only pull if we're not already at the remote commit.
if [[ "$LOCAL" != "$REMOTE" ]]; then
  log "Fast-forwarding repo to origin/$BRANCH..."
  git pull --ff-only origin "$BRANCH"
fi

cd "$COMPOSE_DIR"
export GIT_COMMIT_SHA="$REMOTE"

# Build and restart are separate steps so the timeout only covers the build.
# A build once hung inside `apt-get update` for good, and since it held the
# lock, every later run exited without deploying. Killing it leaves the old
# container serving the site; nothing is restarted until a build succeeds.
log "Building image (timeout $BUILD_TIMEOUT)..."
if ! timeout --kill-after=30s "$BUILD_TIMEOUT" docker compose build; then
  log "ERROR: build failed or timed out; the running container is unchanged. Retrying next run."
  exit 1
fi

log "Restarting container..."
docker compose up -d

log "Done."
