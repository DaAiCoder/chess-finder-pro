/**
 * When `DATABASE_URL` is set (Neon / Postgres), persist the entire
 * in-memory storage graph as a single JSONB row so restarts keep state
 * without requiring a full relational Drizzle port yet.
 */
import { neon } from "@neondatabase/serverless";

let sql: ReturnType<typeof neon> | null = null;

export function neonEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

function getSql() {
  if (!process.env.DATABASE_URL) return null;
  if (!sql) sql = neon(process.env.DATABASE_URL);
  return sql;
}

export async function ensureNeonSnapshotTable(): Promise<void> {
  const s = getSql();
  if (!s) return;
  await s`
    CREATE TABLE IF NOT EXISTS app_snapshot (
      id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

export async function loadNeonSnapshot(): Promise<unknown | null> {
  const s = getSql();
  if (!s) return null;
  const rows = (await s`SELECT payload FROM app_snapshot WHERE id = 1 LIMIT 1`) as {
    payload: unknown;
  }[];
  const row = rows[0];
  return row?.payload ?? null;
}

export async function saveNeonSnapshot(payload: unknown): Promise<void> {
  const s = getSql();
  if (!s) return;
  await s`
    INSERT INTO app_snapshot (id, payload, updated_at)
    VALUES (1, ${JSON.stringify(payload)}::jsonb, NOW())
    ON CONFLICT (id) DO UPDATE SET
      payload = EXCLUDED.payload,
      updated_at = NOW()
  `;
}
