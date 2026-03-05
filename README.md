# Agentic Code Assist

An AI chat application powered by Cerebras AI, with conversation history stored in PostgreSQL.

## Prerequisites

- [Node.js 18+](https://nodejs.org)
- [Docker Desktop](https://www.docker.com/products/docker-desktop) (for the bundled PostgreSQL database)
- A [Cerebras API key](https://console.cerebras.ai)

## Install

**macOS / Linux:**

```bash
chmod +x install.sh
./install.sh
```

**Windows (PowerShell):**

```powershell
.\install.ps1
```

The script will:
1. Prompt for your Anthropic API key and create a `.env` file
2. Start a PostgreSQL container via Docker
3. Install Node.js dependencies
4. Create the database schema
5. Build the application

## Run

```bash
npm start        # production (requires npm run build first)
npm run dev      # development with hot reload
```

The app is available at `http://localhost:5000`.

## Database

```bash
npm run db:start   # start the PostgreSQL container
npm run db:stop    # stop it
npm run db:push    # apply schema changes after editing shared/schema.ts
```

## Configuration

All configuration lives in `.env` (created during install). See `.env.example` for available options.

To use an existing PostgreSQL instance instead of the bundled Docker one, set `DATABASE_URL` in `.env` to point to your database and skip `npm run db:start`.
