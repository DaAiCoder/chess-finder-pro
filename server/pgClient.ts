/**
 * Shared `postgres.js` pool for any standard `DATABASE_URL` (Render Postgres,
 * Neon TCP URL, local Postgres). The Neon *HTTP* driver (`@neondatabase/serverless`)
 * does not speak to Render-managed Postgres from Node — use TCP here instead.
 */
import postgres from "postgres";

let instance: ReturnType<typeof postgres> | null = null;

function isLocalHost(url: string): boolean {
  try {
    const normalized = url.replace(/^postgres(?!ql)/i, "postgresql");
    const { hostname } = new URL(normalized);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

export function getPostgresSql(): ReturnType<typeof postgres> | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (!instance) {
    instance = postgres(url, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 20,
      ...(isLocalHost(url) ? {} : { ssl: "require" as const }),
    });
  }
  return instance;
}
