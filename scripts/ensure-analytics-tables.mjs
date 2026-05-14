/**
 * Idempotent DDL for first-party analytics tables. Used on Render when
 * `drizzle-kit push` hits Postgres edge cases (e.g. PK migration errors) so
 * `analytics_*` still exist for collect + admin APIs.
 *
 * Safe to run on every deploy: CREATE TABLE / INDEX IF NOT EXISTS only.
 */
import postgres from "postgres";

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.log("[analytics-ddl] skip (no DATABASE_URL)");
  process.exit(0);
}

const sql = postgres(url, { max: 1 });

const stmts = [
  `CREATE TABLE IF NOT EXISTS analytics_sessions (
    id varchar(36) PRIMARY KEY,
    started_at timestamptz NOT NULL,
    last_seen_at timestamptz NOT NULL,
    anonymous_id varchar(64) NOT NULL,
    user_id integer,
    country varchar(2),
    referrer varchar(2048),
    user_agent varchar(512),
    client_locale varchar(32),
    client_timezone varchar(64)
  )`,
  `CREATE TABLE IF NOT EXISTS analytics_page_views (
    id serial PRIMARY KEY,
    session_id varchar(36) NOT NULL REFERENCES analytics_sessions(id) ON DELETE CASCADE,
    path text NOT NULL,
    query varchar(512),
    title varchar(512),
    occurred_at timestamptz NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS analytics_sessions_started_idx ON analytics_sessions (started_at)`,
  `CREATE INDEX IF NOT EXISTS analytics_sessions_country_idx ON analytics_sessions (country)`,
  `CREATE INDEX IF NOT EXISTS analytics_sessions_user_idx ON analytics_sessions (user_id)`,
  `CREATE INDEX IF NOT EXISTS analytics_pv_session_idx ON analytics_page_views (session_id)`,
  `CREATE INDEX IF NOT EXISTS analytics_pv_occurred_idx ON analytics_page_views (occurred_at)`,
  `CREATE INDEX IF NOT EXISTS analytics_pv_path_idx ON analytics_page_views (path)`,
];

try {
  for (const q of stmts) {
    await sql.unsafe(q);
  }
  console.log("[analytics-ddl] analytics_sessions + analytics_page_views OK");
} catch (e) {
  console.error("[analytics-ddl] failed:", e instanceof Error ? e.message : String(e));
  process.exit(1);
} finally {
  await sql.end({ timeout: 5 });
}
