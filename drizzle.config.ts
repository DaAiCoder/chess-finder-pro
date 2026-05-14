import { defineConfig } from "drizzle-kit";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

/**
 * drizzle-kit uses `pg`. For cloud Postgres (Render, Neon, etc.) TLS must be
 * explicit; a bare `url` alone often yields ECONNRESET from Windows/home ISP.
 */
function dbCredentials():
  | { url: string }
  | {
      host: string;
      port: number;
      user: string;
      password: string;
      database: string;
      ssl: true | { rejectUnauthorized: boolean };
    } {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) {
    return { url: "postgres://user:pass@localhost:5432/chessfinderpro" };
  }

  let url: URL;
  try {
    url = new URL(raw.replace(/^postgres(?!ql)/i, "postgresql"));
  } catch {
    return { url: raw };
  }

  if (LOCAL_HOSTS.has(url.hostname)) {
    return { url: raw };
  }

  const database = (url.pathname || "/postgres").replace(/^\//, "") || "postgres";
  const port = url.port ? Number(url.port) : 5432;
  const user = decodeURIComponent(url.username || "postgres");
  const password = decodeURIComponent(url.password || "");

  // Render Postgres (internal host is often dpg-…; external uses *.render.com).
  const renderPostgres =
    url.hostname.includes("render.com") ||
    url.hostname.endsWith(".render.com") ||
    url.hostname.startsWith("dpg-");
  const insecureKitSsl = renderPostgres || process.env.DRIZZLE_KIT_SSL_INSECURE === "1";

  return {
    host: url.hostname,
    port,
    user,
    password,
    database,
    ssl: insecureKitSsl ? { rejectUnauthorized: false } : true,
  };
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  /** Non-interactive / CI: fewer prompts during `drizzle-kit push` on Render. */
  strict: false,
  dbCredentials: dbCredentials(),
});
