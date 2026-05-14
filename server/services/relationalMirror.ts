/**
 * Relational write-through mirror.
 *
 * The primary persistence layer in `server/storage.ts` is an in-memory
 * graph that is snapshotted as a single JSONB row (`app_snapshot`) when
 * `DATABASE_URL` is set. That snapshot is the source of truth — but it
 * cannot be queried with SQL, which is awkward for analytics dashboards
 * and external BI tools.
 *
 * This module write-mirrors the high-volume "event" tables (training
 * attempts, motif skills, streaks) into their proper Drizzle pgTable
 * definitions every time the in-memory storage commits one. Reads still
 * come from the in-memory map — so the mirror is fire-and-forget and
 * never blocks a request.
 *
 * It's intentionally a thin shim: when we cut over to a full
 * `DrizzleStorage` implementation, these mirror calls can be removed
 * because the relational tables will be the primary source of truth.
 * Until then this gives:
 *   - SQL-queryable training_attempts / user_streaks / motif skills for
 *     ad-hoc analytics.
 *   - A backed-up second copy of all training events independent of the
 *     snapshot blob (helpful for incident recovery).
 *
 * Failures are logged once and silenced after that so a flaky Postgres
 * connection doesn't spam the dev console.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import { getPostgresSql } from "../pgClient.js";
import type {
  InsertTrainingAttempt,
  InsertUserMotifSkill,
  InsertUserStreak,
} from "../../shared/schema.js";

type DrizzlePg = ReturnType<typeof drizzle>;

let db: DrizzlePg | null = null;
let warned = false;

function getDb(): DrizzlePg | null {
  const client = getPostgresSql();
  if (!client) return null;
  if (!db) {
    try {
      db = drizzle(client);
    } catch (err) {
      if (!warned) {
        warned = true;
        console.warn(
          "[relational-mirror] could not initialize drizzle:",
          (err as Error).message,
        );
      }
      return null;
    }
  }
  return db;
}

/**
 * Ensure mirrored tables exist. Idempotent. The Drizzle migration story
 * (`npm run db:push`) is the canonical schema migration tool; this is a
 * pragmatic fallback so the mirror works on a fresh Neon database
 * without separately running drizzle-kit.
 */
export async function ensureRelationalTables(): Promise<void> {
  const handle = getDb();
  if (!handle) return;
  try {
    await handle.execute(sql`
      CREATE TABLE IF NOT EXISTS training_attempts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        problem_id INTEGER NOT NULL,
        solved BOOLEAN NOT NULL,
        time_spent INTEGER NOT NULL,
        moves_played JSONB,
        attempted_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    await handle.execute(sql`
      CREATE TABLE IF NOT EXISTS user_streaks (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL UNIQUE,
        current_streak INTEGER NOT NULL DEFAULT 0,
        longest_streak INTEGER NOT NULL DEFAULT 0,
        last_activity_date DATE,
        xp INTEGER NOT NULL DEFAULT 0,
        level INTEGER NOT NULL DEFAULT 1,
        weekly_xp INTEGER NOT NULL DEFAULT 0
      )
    `);
    await handle.execute(sql`
      CREATE TABLE IF NOT EXISTS user_motif_skills (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        motif_key VARCHAR(48) NOT NULL,
        rating REAL NOT NULL,
        rd REAL NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        correct INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
        UNIQUE (user_id, motif_key)
      )
    `);
  } catch (err) {
    if (!warned) {
      warned = true;
      console.warn(
        "[relational-mirror] ensure-tables failed:",
        (err as Error).message,
      );
    }
  }
}

export async function mirrorTrainingAttempt(input: InsertTrainingAttempt): Promise<void> {
  const handle = getDb();
  if (!handle) return;
  try {
    const moves = input.movesPlayed == null ? null : JSON.stringify(input.movesPlayed);
    await handle.execute(sql`
      INSERT INTO training_attempts (user_id, problem_id, solved, time_spent, moves_played)
      VALUES (${input.userId}, ${input.problemId}, ${input.solved}, ${input.timeSpent}, ${moves}::jsonb)
    `);
  } catch (err) {
    logOnce("attempt", err);
  }
}

export async function mirrorUserStreak(input: InsertUserStreak): Promise<void> {
  const handle = getDb();
  if (!handle) return;
  try {
    await handle.execute(sql`
      INSERT INTO user_streaks (user_id, current_streak, longest_streak, last_activity_date, xp, level, weekly_xp)
      VALUES (${input.userId}, ${input.currentStreak}, ${input.longestStreak}, ${
        input.lastActivityDate as string | Date | null
      }, ${input.xp ?? 0}, ${input.level ?? 1}, ${input.weeklyXp ?? 0})
      ON CONFLICT (user_id) DO UPDATE SET
        current_streak = EXCLUDED.current_streak,
        longest_streak = EXCLUDED.longest_streak,
        last_activity_date = EXCLUDED.last_activity_date,
        xp = EXCLUDED.xp,
        level = EXCLUDED.level,
        weekly_xp = EXCLUDED.weekly_xp
    `);
  } catch (err) {
    logOnce("streak", err);
  }
}

export async function mirrorMotifSkill(input: InsertUserMotifSkill): Promise<void> {
  const handle = getDb();
  if (!handle) return;
  try {
    await handle.execute(sql`
      INSERT INTO user_motif_skills (user_id, motif_key, rating, rd, attempts, correct, updated_at)
      VALUES (${input.userId}, ${input.motifKey}, ${input.rating}, ${input.rd}, ${
        input.attempts ?? 0
      }, ${input.correct ?? 0}, NOW())
      ON CONFLICT (user_id, motif_key) DO UPDATE SET
        rating = EXCLUDED.rating,
        rd = EXCLUDED.rd,
        attempts = EXCLUDED.attempts,
        correct = EXCLUDED.correct,
        updated_at = NOW()
    `);
  } catch (err) {
    logOnce("motif", err);
  }
}

let firstFailure = true;
function logOnce(kind: string, err: unknown): void {
  if (firstFailure) {
    firstFailure = false;
    console.warn(
      `[relational-mirror] ${kind} mirror failed (further errors silenced): ${
        (err as Error).message
      }`,
    );
  }
}
