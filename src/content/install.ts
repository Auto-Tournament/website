/** The platform's install commands: the home page and /platform show the same ones. */
export const installCommands = `mkdir autotournament && cd autotournament
curl -fsSLO https://autotournament.gg/docker-compose.yml
cat > .env <<EOF
SESSION_SECRET=$(openssl rand -base64 32)
SERVER_TOKEN=$(openssl rand -base64 24 | tr -d '=+/')
FRONTEND_BASE_URL=http://localhost:3069
STEAM_API_KEY=
AUTH_STEAM_ENABLED=true
EOF
docker compose up -d`;
