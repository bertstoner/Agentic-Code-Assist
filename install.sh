#!/usr/bin/env bash
set -euo pipefail

BOLD='\033[1m'
GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
YELLOW='\033[0;33m'
RESET='\033[0m'

echo -e "${CYAN}${BOLD}=== Agentic Code Assist — Install ===${RESET}"
echo ""

# ── Prerequisites ─────────────────────────────────────────────────────────────

need() {
  if ! command -v "$1" &>/dev/null; then
    echo -e "${RED}Error: '$1' is required but not installed.${RESET}"
    echo "  $2"
    exit 1
  fi
}

need node "Install Node.js 18+ from https://nodejs.org"
need npm  "Comes with Node.js"

NODE_MAJOR=$(node --version | sed 's/v\([0-9]*\).*/\1/')
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo -e "${RED}Error: Node.js 18+ is required (found $(node --version))${RESET}"
  exit 1
fi

# ── Database — prefer local PostgreSQL, fall back to Docker ───────────────────

DB_MODE=""

if command -v psql &>/dev/null && command -v pg_isready &>/dev/null; then
  DB_MODE="local"
  echo -e "${GREEN}Found local PostgreSQL${RESET}"
elif command -v docker &>/dev/null && docker info &>/dev/null 2>&1; then
  DB_MODE="docker"
  echo -e "${GREEN}Found Docker — will use containerised PostgreSQL${RESET}"
else
  echo -e "${YELLOW}PostgreSQL and Docker not found — attempting to install PostgreSQL...${RESET}"
  if command -v apt-get &>/dev/null; then
    sudo apt-get update -qq && sudo apt-get install -y postgresql postgresql-client
  elif command -v brew &>/dev/null; then
    brew install postgresql@17 && brew services start postgresql@17
    export PATH="/opt/homebrew/opt/postgresql@17/bin:/usr/local/opt/postgresql@17/bin:$PATH"
  else
    echo -e "${RED}Error: Cannot auto-install PostgreSQL. Please install it manually:${RESET}"
    echo "  https://www.postgresql.org/download/"
    exit 1
  fi
  if command -v psql &>/dev/null; then
    DB_MODE="local"
    echo -e "${GREEN}PostgreSQL installed.${RESET}"
  else
    echo -e "${RED}PostgreSQL installed but psql not in PATH. Open a new terminal and re-run.${RESET}"
    exit 1
  fi
fi

# ── .env setup ────────────────────────────────────────────────────────────────

if [ ! -f .env ]; then
  echo ""
  read -rp "Enter your Cerebras API key (from https://console.cerebras.ai): " API_KEY
  if [ -z "$API_KEY" ]; then
    echo -e "${RED}Error: API key is required.${RESET}"
    exit 1
  fi

  if [ "$DB_MODE" = "local" ]; then
    DB_URL="postgresql://postgres:postgres@localhost:5432/agentcodeassist"
    echo ""
    echo -e "${YELLOW}Using local PostgreSQL.${RESET}"
    echo "Default DATABASE_URL: $DB_URL"
    read -rp "Press Enter to accept or type a custom DATABASE_URL: " CUSTOM_URL
    [ -n "$CUSTOM_URL" ] && DB_URL="$CUSTOM_URL"
  else
    DB_URL="postgresql://postgres:postgres@localhost:5432/agentcodeassist"
  fi

  sed "s|your-api-key-here|${API_KEY}|g" .env.example \
    | sed "s|postgresql://.*|${DB_URL}|g" > .env

  echo -e "${GREEN}Created .env${RESET}"
else
  echo ".env already exists — skipping."
fi

# Load env
set -a; source .env; set +a

# ── Start database ─────────────────────────────────────────────────────────────

if [ "$DB_MODE" = "docker" ]; then
  DC="docker compose"
  command -v "docker-compose" &>/dev/null && ! docker compose version &>/dev/null 2>&1 && DC="docker-compose"

  echo ""
  echo "Starting PostgreSQL container..."
  $DC up -d db

  echo -n "Waiting for PostgreSQL"
  for i in $(seq 1 30); do
    $DC exec -T db pg_isready -U postgres &>/dev/null 2>&1 && echo -e " ${GREEN}ready${RESET}" && break
    echo -n "."; sleep 2
    [ "$i" -eq 30 ] && echo "" && echo -e "${RED}Timed out waiting for PostgreSQL.${RESET}" && exit 1
  done

elif [ "$DB_MODE" = "local" ]; then
  echo ""
  # Try to create the database if it doesn't exist
  if ! psql "$DATABASE_URL" -c '\q' &>/dev/null 2>&1; then
    echo "Creating database..."
    createdb agentcodeassist 2>/dev/null || true
  fi
  echo -e "${GREEN}Local PostgreSQL ready${RESET}"
fi

# ── Node dependencies ─────────────────────────────────────────────────────────

echo ""
echo "Installing Node.js dependencies..."
npm install

# ── Schema ────────────────────────────────────────────────────────────────────

echo ""
echo "Applying database schema..."
npm run db:push

# ── Build ─────────────────────────────────────────────────────────────────────

echo ""
echo "Building application..."
npm run build

# ── Done ──────────────────────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}${BOLD}Done! Run with: npm start${RESET}"
echo "Then open http://localhost:${PORT:-5000}"
echo ""
