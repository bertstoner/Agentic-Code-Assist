#!/usr/bin/env bash
set -euo pipefail

BOLD='\033[1m'
GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
RESET='\033[0m'

echo -e "${CYAN}${BOLD}=== Agentic Code Assist — Install ===${RESET}"
echo ""

# ── Prerequisites ─────────────────────────────────────────────────────────────

check() {
  if ! command -v "$1" &>/dev/null; then
    echo -e "${RED}Error: '$1' is required but not installed.${RESET}"
    echo "  $2"
    exit 1
  fi
}

check node  "Install Node.js 18+ from https://nodejs.org"
check npm   "Comes with Node.js"
check docker "Install Docker Desktop from https://www.docker.com/products/docker-desktop"

NODE_MAJOR=$(node --version | sed 's/v\([0-9]*\).*/\1/')
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo -e "${RED}Error: Node.js 18+ is required (found $(node --version))${RESET}"
  exit 1
fi

# ── .env setup ────────────────────────────────────────────────────────────────

if [ ! -f .env ]; then
  echo "Setting up environment configuration..."
  echo ""
  read -rp "Enter your Cerebras API key (from https://console.cerebras.ai): " API_KEY
  if [ -z "$API_KEY" ]; then
    echo -e "${RED}Error: API key is required.${RESET}"
    exit 1
  fi

  sed "s|your-api-key-here|${API_KEY}|g" .env.example > .env
  echo -e "${GREEN}Created .env${RESET}"
else
  echo ".env already exists — skipping."
fi

echo ""

# ── Database ──────────────────────────────────────────────────────────────────

echo "Starting PostgreSQL..."

# Support both docker compose (v2) and docker-compose (v1)
DC="docker compose"
if ! docker compose version &>/dev/null 2>&1; then
  DC="docker-compose"
fi

$DC up -d db

echo -n "Waiting for PostgreSQL to be ready"
for i in $(seq 1 30); do
  if $DC exec -T db pg_isready -U postgres &>/dev/null 2>&1; then
    echo -e " ${GREEN}ready${RESET}"
    break
  fi
  echo -n "."
  sleep 2
  if [ "$i" -eq 30 ]; then
    echo ""
    echo -e "${RED}Error: PostgreSQL did not become ready in time.${RESET}"
    exit 1
  fi
done

echo ""

# ── Node dependencies ─────────────────────────────────────────────────────────

echo "Installing Node.js dependencies..."
npm install
echo ""

# ── Database schema ───────────────────────────────────────────────────────────

echo "Applying database schema..."
set -a
# shellcheck disable=SC1091
source .env
set +a
npm run db:push
echo ""

# ── Build ─────────────────────────────────────────────────────────────────────

echo "Building application..."
npm run build
echo ""

# ── Done ──────────────────────────────────────────────────────────────────────

echo -e "${GREEN}${BOLD}Installation complete!${RESET}"
echo ""
echo "  Start (production):  npm start"
echo "  Start (development): npm run dev"
echo "  Stop database:       docker compose down"
echo ""
