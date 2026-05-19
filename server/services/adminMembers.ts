/**
 * Admin members directory + subscription snapshot (reads `app_snapshot`).
 */
import type { Express, Request, Response } from "express";
import { getPostgresSql } from "../pgClient.js";
import { adminOrOperatorPortalOk } from "./sitePricing.js";
import { getSitePricing } from "./sitePricing.js";
import { snapshotMembersFrom, snapshotMembersWhere } from "./snapshotQuery.js";

export function registerAdminMembersRoutes(app: Express): void {
  app.get("/api/admin/members", async (req: Request, res: Response) => {
    if (!adminOrOperatorPortalOk(req)) {
      return res.status(401).json({ error: "admin_unauthorized" });
    }
    const sql = getPostgresSql();
    if (!sql) return res.status(503).json({ error: "database_unavailable" });

    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 200));

    try {
      const membersFrom = snapshotMembersFrom(sql);
      const membersWhere = snapshotMembersWhere(sql, q);

      const rows = await sql`
        SELECT
          (elem->>'id')::int AS user_id,
          elem->>'username' AS username,
          elem->>'email' AS email,
          COALESCE(NULLIF(TRIM(elem->>'subscriptionStatus'), ''), 'none') AS subscription_status,
          COALESCE(NULLIF(TRIM(elem->>'subscriptionPlan'), ''), 'none') AS subscription_plan,
          (elem->>'subscriptionCurrentPeriodEnd')::timestamptz AS period_end,
          COALESCE((elem->>'subscriptionCancelAtPeriodEnd')::boolean, false) AS cancel_at_period_end,
          (elem->>'createdAt')::timestamptz AS created_at,
          signup.method AS signup_method,
          last_sess.last_seen_at AS last_seen_at,
          COALESCE(attempts.n, 0) AS training_attempts
        ${membersFrom}
        LEFT JOIN LATERAL (
          SELECT method
          FROM analytics_signups
          WHERE user_id = (elem->>'id')::int
          ORDER BY occurred_at ASC
          LIMIT 1
        ) signup ON true
        LEFT JOIN LATERAL (
          SELECT MAX(last_seen_at) AS last_seen_at
          FROM analytics_sessions
          WHERE user_id = (elem->>'id')::int
        ) last_sess ON true
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int AS n
          FROM training_attempts
          WHERE user_id = (elem->>'id')::int
        ) attempts ON true
        ${membersWhere}
        ORDER BY created_at DESC NULLS LAST
        LIMIT ${limit}
      `;

      const items = (rows as unknown as MemberRow[]).map(normalizeMemberRow);
      return res.json({ items, count: items.length, source: "app_snapshot" });
    } catch (err) {
      return res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get("/api/admin/members/subscriptions", async (req: Request, res: Response) => {
    if (!adminOrOperatorPortalOk(req)) {
      return res.status(401).json({ error: "admin_unauthorized" });
    }
    const sql = getPostgresSql();
    if (!sql) return res.status(503).json({ error: "database_unavailable" });

    try {
      const pricing = await getSitePricing();
      const membersFrom = snapshotMembersFrom(sql);
      const membersWhere = snapshotMembersWhere(sql);

      const [agg, byStatus, byPlan, snapshotMeta, payingRows] = await Promise.all([
        sql`
          SELECT
            COUNT(*)::text AS total_members,
            COUNT(*) FILTER (
              WHERE COALESCE(elem->>'subscriptionStatus', '') IN ('active', 'trialing')
            )::text AS active_or_trialing,
            COUNT(*) FILTER (
              WHERE COALESCE(elem->>'subscriptionStatus', '') = 'trialing'
            )::text AS trialing,
            COUNT(*) FILTER (
              WHERE COALESCE(elem->>'subscriptionStatus', '') = 'active'
            )::text AS active,
            COUNT(*) FILTER (
              WHERE COALESCE(elem->>'subscriptionStatus', '') = 'canceled'
            )::text AS canceled,
            COUNT(*) FILTER (
              WHERE COALESCE(elem->>'subscriptionStatus', '') = 'past_due'
            )::text AS past_due,
            COUNT(*) FILTER (
              WHERE COALESCE(elem->>'subscriptionStatus', '') IN ('', 'none')
               OR elem->>'subscriptionStatus' IS NULL
            )::text AS free,
            COUNT(*) FILTER (
              WHERE COALESCE(elem->>'subscriptionStatus', '') = 'trialing'
                AND (elem->>'subscriptionCurrentPeriodEnd')::timestamptz IS NOT NULL
                AND (elem->>'subscriptionCurrentPeriodEnd')::timestamptz <= NOW() + INTERVAL '7 days'
            )::text AS trials_ending_7d,
            COUNT(*) FILTER (
              WHERE COALESCE((elem->>'subscriptionCancelAtPeriodEnd')::boolean, false)
            )::text AS cancel_scheduled
          ${membersFrom}
          ${membersWhere}
        `,
        sql`
          SELECT
            COALESCE(NULLIF(TRIM(elem->>'subscriptionStatus'), ''), 'none') AS status,
            COUNT(*)::text AS c
          ${membersFrom}
          ${membersWhere}
          GROUP BY 1
          ORDER BY COUNT(*) DESC
        `,
        sql`
          SELECT
            COALESCE(NULLIF(TRIM(elem->>'subscriptionPlan'), ''), 'none') AS plan,
            COUNT(*)::text AS c
          ${membersFrom}
          ${membersWhere}
          GROUP BY 1
          ORDER BY COUNT(*) DESC
        `,
        sql`
          SELECT updated_at::text AS updated_at
          FROM app_snapshot
          WHERE id = 1
          LIMIT 1
        `,
        sql`
          SELECT
            COALESCE(NULLIF(TRIM(elem->>'subscriptionPlan'), ''), 'none') AS plan,
            COUNT(*)::text AS c
          ${membersFrom}
          ${membersWhere}
            AND COALESCE(elem->>'subscriptionStatus', '') IN ('active', 'trialing')
          GROUP BY 1
        `,
      ]);

      const a = agg[0] as unknown as Record<string, string> | undefined;
      const monthlyPaying = Number(
        (payingRows as unknown as { plan: string; c: string }[]).find((r) => r.plan === "monthly")
          ?.c ?? 0,
      );
      const yearlyPaying = Number(
        (payingRows as unknown as { plan: string; c: string }[]).find((r) => r.plan === "yearly")
          ?.c ?? 0,
      );
      const mrrUsd =
        Math.round(
          (monthlyPaying * pricing.monthlyUsd + yearlyPaying * (pricing.yearlyUsd / 12)) * 100,
        ) / 100;

      const meta = snapshotMeta[0] as unknown as { updated_at: string | null } | undefined;

      return res.json({
        source: "app_snapshot",
        snapshotUpdatedAt: meta?.updated_at ?? null,
        pricing: {
          monthlyUsd: pricing.monthlyUsd,
          yearlyUsd: pricing.yearlyUsd,
          currency: pricing.currency,
        },
        totals: {
          totalMembers: Number(a?.total_members ?? 0),
          activeOrTrialing: Number(a?.active_or_trialing ?? 0),
          trialing: Number(a?.trialing ?? 0),
          active: Number(a?.active ?? 0),
          canceled: Number(a?.canceled ?? 0),
          pastDue: Number(a?.past_due ?? 0),
          free: Number(a?.free ?? 0),
          trialsEndingWithin7Days: Number(a?.trials_ending_7d ?? 0),
          cancelScheduledAtPeriodEnd: Number(a?.cancel_scheduled ?? 0),
        },
        revenue: {
          mrrUsdEstimate: mrrUsd,
          arrUsdEstimate: Math.round(mrrUsd * 12 * 100) / 100,
          note: "Estimate from snapshot plan counts × admin pricing; not Stripe ledger.",
        },
        byStatus: (byStatus as unknown as { status: string; c: string }[]).map((r) => ({
          status: r.status,
          count: Number(r.c),
        })),
        byPlan: (byPlan as unknown as { plan: string; c: string }[]).map((r) => ({
          plan: r.plan,
          count: Number(r.c),
        })),
      });
    } catch (err) {
      return res.status(500).json({ error: (err as Error).message });
    }
  });
}

interface MemberRow {
  user_id: number;
  username: string;
  email: string | null;
  subscription_status: string;
  subscription_plan: string;
  period_end: string | null;
  cancel_at_period_end: boolean;
  created_at: string | null;
  signup_method: string | null;
  last_seen_at: string | null;
  training_attempts: number;
}

function normalizeMemberRow(r: MemberRow) {
  return {
    userId: r.user_id,
    username: r.username,
    email: r.email,
    subscriptionStatus: r.subscription_status,
    subscriptionPlan: r.subscription_plan,
    periodEnd: r.period_end,
    cancelAtPeriodEnd: r.cancel_at_period_end,
    createdAt: r.created_at,
    signupMethod: r.signup_method,
    lastSeenAt: r.last_seen_at,
    trainingAttempts: r.training_attempts,
  };
}
