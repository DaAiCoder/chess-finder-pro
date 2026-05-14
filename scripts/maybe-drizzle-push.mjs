/**
 * On Render only: run `drizzle-kit push` during the build so the production DB
 * gets schema without your laptop (fixes home-network ECONNRESET to Postgres).
 *
 * Skips when RENDER is unset (local builds) or DATABASE_URL is missing.
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

console.log("[render] drizzle-kit push…");
const result = spawnSync("npx", ["drizzle-kit", "push"], {
  stdio: "inherit",
  env: process.env,
  shell: true,
});

process.exit(result.status === 0 ? 0 : result.status ?? 1);
