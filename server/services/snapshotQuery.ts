/**
 * Shared SQL fragments for reading member data from `app_snapshot`.
 */
import { getPostgresSql } from "../pgClient.js";

export type PgSql = NonNullable<ReturnType<typeof getPostgresSql>>;

export function snapshotMembersFrom(handle: PgSql) {
  return handle`
    FROM app_snapshot s
    CROSS JOIN LATERAL jsonb_array_elements(s.payload->'users') AS elem
  `;
}

export function snapshotMembersWhere(handle: PgSql, q?: string) {
  if (q?.trim()) {
    const pattern = `%${q.trim()}%`;
    return handle`
      WHERE s.id = 1
        AND elem->>'username' NOT LIKE 'anon-%'
        AND (
          elem->>'username' ILIKE ${pattern}
          OR COALESCE(elem->>'email', '') ILIKE ${pattern}
        )
    `;
  }
  return handle`
    WHERE s.id = 1
      AND elem->>'username' NOT LIKE 'anon-%'
  `;
}

export async function snapshotMemberSubscriptionStats(handle: PgSql): Promise<{
  totalUsers: number;
  paying: number;
  byStatus: { status: string; count: number }[];
  byPlan: { plan: string; count: number }[];
}> {
  const membersFrom = snapshotMembersFrom(handle);
  const membersWhere = snapshotMembersWhere(handle);
  const [totals, byStatus, byPlan] = await Promise.all([
    handle`
      SELECT
        COUNT(*)::text AS total_users,
        COUNT(*) FILTER (
          WHERE COALESCE(elem->>'subscriptionStatus', '') IN ('active', 'trialing')
        )::text AS paying
      ${membersFrom}
      ${membersWhere}
    `,
    handle`
      SELECT
        COALESCE(NULLIF(TRIM(elem->>'subscriptionStatus'), ''), 'none') AS status,
        COUNT(*)::text AS c
      ${membersFrom}
      ${membersWhere}
      GROUP BY 1
      ORDER BY COUNT(*) DESC
    `,
    handle`
      SELECT
        COALESCE(NULLIF(TRIM(elem->>'subscriptionPlan'), ''), 'none') AS plan,
        COUNT(*)::text AS c
      ${membersFrom}
      ${membersWhere}
      GROUP BY 1
      ORDER BY COUNT(*) DESC
    `,
  ]);

  const t0 = totals[0] as unknown as { total_users: string; paying: string } | undefined;
  return {
    totalUsers: Number(t0?.total_users ?? 0),
    paying: Number(t0?.paying ?? 0),
    byStatus: (byStatus as unknown as { status: string; c: string }[]).map((r) => ({
      status: r.status,
      count: Number(r.c),
    })),
    byPlan: (byPlan as unknown as { plan: string; c: string }[]).map((r) => ({
      plan: r.plan,
      count: Number(r.c),
    })),
  };
}

export async function snapshotSignupsInRange(
  handle: PgSql,
  fromSql: string,
  toSql: string,
): Promise<number> {
  const membersFrom = snapshotMembersFrom(handle);
  const membersWhere = snapshotMembersWhere(handle);
  const rows = await handle`
    SELECT COUNT(*)::text AS n
    ${membersFrom}
    ${membersWhere}
      AND (elem->>'createdAt')::timestamptz >= ${fromSql}::timestamptz
      AND (elem->>'createdAt')::timestamptz <= ${toSql}::timestamptz
  `;
  return Number((rows[0] as unknown as { n: string })?.n ?? 0);
}
