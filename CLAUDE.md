# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Install (first-time setup)

```bash
# macOS / Linux
chmod +x install.sh && ./install.sh

# Windows PowerShell
.\install.ps1
```

The install scripts handle: creating `.env`, starting PostgreSQL via Docker, `npm install`, `npm run db:push`, and `npm run build`.

## Commands

```bash
npm run dev        # Start development server (port 5000)
npm run build      # Build for production (runs script/build.ts)
npm start          # Start production server from dist/
npm run check      # TypeScript type checking
npm run db:push    # Push Drizzle schema changes to PostgreSQL
npm run db:start   # Start PostgreSQL container (docker compose up -d db)
npm run db:stop    # Stop PostgreSQL container
```

## Environment Variables

Stored in `.env` (copy from `.env.example`):

- `DATABASE_URL` - PostgreSQL connection string (required)
- `CEREBRAS_API_KEY` - Cerebras API key (required)
- `PORT` - Server port (defaults to 5000)

## Architecture

This is a full-stack TypeScript application: a React SPA served by an Express server, with a PostgreSQL database. The server handles both API routes and client static file serving on the same port.

### Directory Structure

- `client/src/` - React frontend (Vite bundled)
  - `pages/` - Route-level components (ChatPage, not-found)
  - `components/` - Feature components (ChatPanel, Sidebar, MarkdownRenderer, EmptyState)
  - `components/ui/` - shadcn/ui component library (do not modify manually)
  - `hooks/use-chat.ts` - All TanStack Query hooks for conversations/messages API
  - `lib/queryClient.ts` - TanStack Query client setup
- `server/` - Express backend
  - `index.ts` - App entrypoint, middleware setup, port binding
  - `routes.ts` - All API route handlers + Anthropic streaming integration
  - `storage.ts` - `DatabaseStorage` class implementing `IStorage` interface
  - `db.ts` - Drizzle ORM + PostgreSQL connection
- `shared/` - Code shared between client and server
  - `schema.ts` - Drizzle table definitions and Zod insert schemas
  - `routes.ts` - Typed API route definitions (`api` object) used on both client and server
- `script/build.ts` - Custom esbuild script that bundles server to `dist/index.cjs` and runs Vite for the client

### Key Patterns

**Shared route typing**: `shared/routes.ts` exports an `api` object with typed paths, methods, input schemas, and response schemas. Both server route handlers and client fetch calls reference this same object, keeping the contract in sync.

**Path aliases**: `@/` resolves to `client/src/`, `@shared/` resolves to `shared/`.

**Streaming AI responses**: The `POST /api/conversations/:id/messages` endpoint streams Anthropic responses via SSE. The client (`use-chat.ts`) reads the stream with `ReadableStream` and progressively updates the TanStack Query cache to show tokens as they arrive.

**Storage interface**: `server/storage.ts` exports a singleton `storage` of type `DatabaseStorage implements IStorage`. If you need to swap storage (e.g., for testing), implement `IStorage`.

**Database schema changes**: Edit `shared/schema.ts`, then run `npm run db:push` to apply changes. No migration files are generated — Drizzle pushes directly.
