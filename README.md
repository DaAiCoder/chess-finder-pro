# ChessFinderPro

Full-stack chess training app: import games from Chess.com / Lichess, get per-move
Stockfish analysis, then drill weaknesses across 6 training modules
(Tactics, Blunder Prevention, Openings, Advantage Capitalization, Visualization, Endgame).

## Stack

- **Frontend:** React 18 + TypeScript + Vite, Wouter, TanStack Query v5, Tailwind v3,
  Shadcn/Radix UI primitives, Chessground v9, Chess.js v1, Recharts, Framer Motion.
- **Backend:** Express.js + TypeScript (run via `tsx`), Drizzle ORM (Postgres dialect),
  Stockfish via `child_process` UCI, optional OpenAI.
- **Shared:** `shared/schema.ts` is the single source of truth for tables, Zod schemas,
  and TypeScript types. Imported by both client (`@shared/...`) and server.

## Quick Start

```bash
# 1. Install
npm install

# 2. Configure env (optional — app boots in in-memory mode without it)
cp .env.example .env

# 3. Dev — single command
npm run dev          # boots Express on :5000, mounts Vite as middleware
                     # open http://localhost:5000
```

The server will:

- Boot Express on `PORT` (default `5000`).
- Serve the Vite-built client (or mount the dev middleware) at `/`.
- Run `seed-training.ts` on first boot, populating ~50+ training problems.
- Spawn Stockfish on demand for analysis (`stockfish` npm package). If the
  binary cannot be spawned (e.g. on Windows where the optional dep ships
  without a usable launcher), the engine wrapper transparently falls back to
  a deterministic mock — UI keeps working, evaluations are heuristic. Install
  a system Stockfish on `$PATH` to get real engine analysis everywhere.

## Engine strength (Play vs Computer)

The server talks to Stockfish over **UCI** (`server/services/stockfish.ts`). Strength comes from two places:

1. **Real Stockfish** — Download the official binary from [stockfishchess.org](https://stockfishchess.org/download/), then either:
   - Add the folder to your `PATH`, or
   - Set `STOCKFISH_PATH` in `.env` to the full path of the `.exe` (Windows) or binary (macOS/Linux).

   Without this, Node often cannot spawn the optional `stockfish` npm package on Windows, and the app uses a **fallback** engine instead of random first moves.

2. **Fallback “material” engine** — If no UCI binary starts, the server runs a **shallow alpha-beta search on material only** (not the old “pick `moves()[0]`” behaviour). It blunders far less than before but is still nowhere near Stockfish.

In Play mode, **Level** maps to higher search depth and a longer UCI timeout so deep searches are less likely to fall back mid-move.

The Drizzle schema targets PostgreSQL. If `DATABASE_URL` is unset the app falls
back to an **in-memory** storage layer that implements the same interface — fine
for local play. To use a real DB:

```bash
# Provision a Neon serverless Postgres database, then:
DATABASE_URL="postgresql://..." npm run db:push
```

## Project Layout

```
client/src/
  pages/        # 13 top-level route components
  components/   # layout shell + chess-specific widgets + ui primitives
  lib/          # query client, helpers
server/
  index.ts      # entry
  routes.ts     # all REST endpoints
  storage.ts    # Drizzle layer (DB or in-memory)
  seed-training.ts
  services/     # stockfish, gameAnalyzer, analyticsComputer, motifDetector,
                # tacticsGenerator, blunderPreventerGenerator, …
shared/
  schema.ts     # all tables + Zod + TS types
```

## Routes

| Route                          | Page                       |
| ------------------------------ | -------------------------- |
| `/`                            | Analysis (chess-trainer)   |
| `/play`                        | Play vs Computer (full screen) |
| `/import`                      | Import Games               |
| `/game-analysis/:id`           | Per-move Game Review       |
| `/analytics`                   | Analytics Dashboard        |
| `/opponent-prep`               | Opponent Scouting          |
| `/training`                    | Training Hub               |
| `/training/tactics`            | Tactics Trainer            |
| `/training/blunder-preventer`  | Blunder Prevention quiz    |
| `/training/opening-improver`   | Opening drills             |
| `/training/advantage`          | Advantage Capitalization   |
| `/training/visualization`      | Visualization (4 modes)    |
| `/training/endgame`            | Endgame Trainer            |
