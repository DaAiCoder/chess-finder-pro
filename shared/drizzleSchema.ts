/**
 * Tables exposed to drizzle-kit only (`drizzle.config.ts` → `schema`).
 *
 * `tablesFilter` in drizzle-kit filters **database** introspection, but the
 * kit still diffs against the **full** TypeScript schema loaded from this file.
 * Tables created only via raw SQL (`relationalMirror`, `neonSnapshot`) must
 * therefore be omitted here, or `push` tries `CREATE TABLE …` and hits
 * "relation … already exists" (42P07).
 */
export {
  users,
  chessQueries,
  chessPositions,
  openingLines,
  games,
  gameAnalysis,
  opponentProfiles,
  trainingProblems,
  trainingProgress,
  dailyChallenges,
  motifDefinitions,
  motifInstances,
  motifMetrics,
  motifQueries,
} from "./schema";
