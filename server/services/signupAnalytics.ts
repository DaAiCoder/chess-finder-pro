/**
 * First-party signup events in Postgres (independent of GA consent).
 */
import { getPostgresSql } from "../pgClient.js";

export type SignupMethod = "email" | "magic_link" | "lichess";

export interface SignupEventRow {
  userId: number;
  username: string;
  email: string | null;
  method: SignupMethod;
  ip: string | null;
  occurredAt: string;
}

let tableReady = false;

export async function ensureSignupAnalyticsTable(): Promise<void> {
  const sql = getPostgresSql();
  if (!sql || tableReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS analytics_signups (
      id serial PRIMARY KEY,
      user_id integer NOT NULL,
      username varchar(64) NOT NULL,
      email varchar(255),
      method varchar(16) NOT NULL,
      ip varchar(64),
      occurred_at timestamptz NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS analytics_signups_occurred_idx ON analytics_signups (occurred_at)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS analytics_signups_user_idx ON analytics_signups (user_id)
  `;
  tableReady = true;
}

export async function recordSignupEvent(args: {
  userId: number;
  username: string;
  email: string | null;
  method: SignupMethod;
  ip?: string | null;
}): Promise<void> {
  const sql = getPostgresSql();
  if (!sql) return;
  try {
    await ensureSignupAnalyticsTable();
    const ip = args.ip?.trim().slice(0, 64) || null;
    await sql`
      INSERT INTO analytics_signups (user_id, username, email, method, ip, occurred_at)
      VALUES (
        ${args.userId},
        ${args.username.slice(0, 64)},
        ${args.email ? args.email.slice(0, 255) : null},
        ${args.method},
        ${ip},
        ${new Date().toISOString()}
      )
    `;
  } catch (err) {
    console.warn("[signup-analytics] record failed:", (err as Error).message);
  }
}

export async function countSignupsInRange(from: Date, to: Date): Promise<number> {
  const sql = getPostgresSql();
  if (!sql) return 0;
  try {
    await ensureSignupAnalyticsTable();
    const rows = await sql`
      SELECT COUNT(*)::text AS n
      FROM analytics_signups
      WHERE occurred_at >= ${from.toISOString()}::timestamptz
        AND occurred_at <= ${to.toISOString()}::timestamptz
    `;
    return Number((rows[0] as { n: string } | undefined)?.n ?? 0);
  } catch {
    return 0;
  }
}

export async function listRecentSignups(args: {
  limit: number;
  from?: Date;
  to?: Date;
}): Promise<SignupEventRow[]> {
  const sql = getPostgresSql();
  if (!sql) return [];
  try {
    await ensureSignupAnalyticsTable();
    const limit = Math.min(100, Math.max(1, args.limit));
    const fromIso = args.from?.toISOString();
    const toIso = args.to?.toISOString();

    const rows =
      fromIso && toIso
        ? await sql`
            SELECT user_id, username, email, method, ip, occurred_at
            FROM analytics_signups
            WHERE occurred_at >= ${fromIso}::timestamptz
              AND occurred_at <= ${toIso}::timestamptz
            ORDER BY occurred_at DESC
            LIMIT ${limit}
          `
        : await sql`
            SELECT user_id, username, email, method, ip, occurred_at
            FROM analytics_signups
            ORDER BY occurred_at DESC
            LIMIT ${limit}
          `;

    return (rows as unknown as {
      user_id: number;
      username: string;
      email: string | null;
      method: string;
      ip: string | null;
      occurred_at: Date;
    }[]).map((r) => ({
      userId: r.user_id,
      username: r.username,
      email: r.email,
      method: r.method as SignupMethod,
      ip: r.ip,
      occurredAt:
        r.occurred_at instanceof Date ? r.occurred_at.toISOString() : String(r.occurred_at),
    }));
  } catch {
    return [];
  }
}
