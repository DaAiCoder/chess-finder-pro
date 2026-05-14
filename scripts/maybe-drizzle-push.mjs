/**
 * On Render only: run `drizzle-kit push` during the build so the production DB
 * gets schema without your laptop (fixes home-network ECONNRESET to Postgres).
 *
 * Skips when RENDER is unset (local builds) or DATABASE_URL is missing.
 *
 * Runs `ensure-analytics-tables.mjs` first (idempotent) so analytics tables exist
 * even when drizzle-kit push fails on unrelated diffs.
 */
import { spawnSync } from "node:child_process";

const onRender = process.env.RENDER === "true";
const db = process.env.DATABASE_URL?.trim();

if (!onRender) {
  console.log(
    "[build] skip drizzle-kit push (local). To push from your PC: npm.cmd run db:push:production",
  );
  process.exit(0);
}

if (!db) {
  console.warn("[render] skip drizzle-kit push: DATABASE_URL not set");
  process.exit(0);
}

console.log("[render] ensure analytics DDL (idempotent)…");
const ensure = spawnSync("node", ["scripts/ensure-analytics-tables.mjs"], {
  stdio: "inherit",
  env: process.env,
  shell: true,
});
if (ensure.status !== 0) {
  process.exit(ensure.status ?? 1);
}

if (process.env.SKIP_DRIZZLE_KIT_PUSH === "1") {
  console.log(
    "[render] skip drizzle-kit push (SKIP_DRIZZLE_KIT_PUSH=1); analytics DDL completed.",
  );
  process.exit(0);
}

console.log("[render] drizzle-kit push…");
const result = spawnSync("npx", ["drizzle-kit", "push"], {
  stdio: "inherit",
  env: { ...process.env, CI: "true" },
  shell: true,
});

if (result.status !== 0) {
  console.warn(
    "[render] drizzle-kit push failed (exit " +
      String(result.status) +
      "). Postgres 42P16 / PK errors often mean drift drizzle-kit cannot auto-fix; " +
      "set DRIZZLE_PUSH_LENIENT=1 to ship the build anyway (analytics DDL already ran), " +
      "or SKIP_DRIZZLE_KIT_PUSH=1 to skip push entirely on Render.",
  );
  if (process.env.DRIZZLE_PUSH_LENIENT === "1") {
    console.warn("[render] DRIZZLE_PUSH_LENIENT=1 — continuing build despite push failure.");
    process.exit(0);
  }
  process.exit(result.status ?? 1);
}

process.exit(0);
