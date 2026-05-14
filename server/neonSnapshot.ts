/**
 * When `DATABASE_URL` is set, persist the entire in-memory storage graph as a
 * single JSONB row so restarts keep state without requiring a full relational
 * Drizzle port yet. Uses TCP Postgres via `postgres.js` (Render, Neon, local).
 */
import postgres from "postgres";
import { getPostgresSql } from "./pgClient.js";

export function neonEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export async function ensureNeonSnapshotTable(): Promise<void> {
  const sql = getPostgresSql();
  if (!sql) return;
  await sql`
    CREATE TABLE IF NOT EXISTS app_snapshot (
      id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

export async function loadNeonSnapshot(): Promise<unknown | null> {
  const sql = getPostgresSql();
  if (!sql) return null;
  const rows = (await sql`SELECT payload FROM app_snapshot WHERE id = 1 LIMIT 1`) as {
    payload: unknown;
  }[];
  const row = rows[0];
  return row?.payload ?? null;
}

export async function saveNeonSnapshot(payload: unknown): Promise<void> {
  const sql = getPostgresSql();
  if (!sql) return;
  const json = JSON.parse(JSON.stringify(payload)) as postgres.JSONValue;
  await sql`
    INSERT INTO app_snapshot (id, payload, updated_at)
    VALUES (1, ${sql.json(json)}, NOW())
    ON CONFLICT (id) DO UPDATE SET
      payload = EXCLUDED.payload,
      updated_at = NOW()
  `;
}
