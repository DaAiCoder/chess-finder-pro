/**
 * Aggregated admin portal APIs (overview, product, engagement, ops).
 */
import type { Express, Request, Response } from "express";
import { getPostgresSql } from "../pgClient.js";
import { adminOrOperatorPortalOk } from "./sitePricing.js";
import { getSitePricing } from "./sitePricing.js";
import { countSignupsInRange } from "./signupAnalytics.js";
import { storage } from "../storage.js";
import {
  snapshotMemberSubscriptionStats,
  snapshotMembersWhere,
} from "./snapshotQuery.js";

function parseQueryDate(q: unknown, fallback: Date): Date {
  if (typeof q !== "string" || !q.trim()) return fallback;
  const d = new Date(q);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

export function registerAdminPortalDataRoutes(app: Express): void {
  app.get("/api/admin/overview", async (req: Request, res: Response) => {
    if (!adminOrOperatorPortalOk(req)) {
      return res.status(401).json({ error: "admin_unauthorized" });
    }
    const sql = getPostgresSql();
    if (!sql) return res.status(503).json({ error: "database_unavailable" });

    const to = parseQueryDate(req.query.to, new Date());
    const from = parseQueryDate(req.query.from, new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000));
    const fromSql = from.toISOString();
    const toSql = to.toISOString();

    try {
      const [subs, traffic, signups, product, engagement, meta] = await Promise.all([
        snapshotMemberSubscriptionStats(sql),
        sql`
          SELECT
            COUNT(*)::text AS page_views,
            COUNT(DISTINCT session_id)::text AS sessions
          FROM analytics_page_views
          WHERE occurred_at >= ${fromSql}::timestamptz
            AND occurred_at <= ${toSql}::timestamptz
        `,
        countSignupsInRange(from, to),
        productActivationStats(sql),
        engagementTotals(sql),
        sql`SELECT updated_at::text AS updated_at FROM app_snapshot WHERE id = 1 LIMIT 1`,
      ]);

      const t0 = traffic[0] as unknown as { page_views: string; sessions: string } | undefined;
      const pricing = await getSitePricing();
      const monthlyPaying =
        subs.byPlan.find((p) => p.plan === "monthly")?.count ?? 0;
      const yearlyPaying = subs.byPlan.find((p) => p.plan === "yearly")?.count ?? 0;
      const mrrUsd =
        Math.round(
          (monthlyPaying * pricing.monthlyUsd + yearlyPaying * (pricing.yearlyUsd / 12)) * 100,
        ) / 100;

      return res.json({
        from: from.toISOString(),
        to: to.toISOString(),
        snapshotUpdatedAt: (meta[0] as unknown as { updated_at: string | null })?.updated_at ?? null,
        members: {
          total: subs.totalUsers,
          paying: subs.paying,
          byStatus: subs.byStatus,
        },
        traffic: {
          pageViews: Number(t0?.page_views ?? 0),
          sessions: Number(t0?.sessions ?? 0),
        },
        signupsInRange: signups,
        revenue: { mrrUsdEstimate: mrrUsd, currency: pricing.currency },
        activation: product,
        engagement,
      });
    } catch (err) {
      return res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get("/api/admin/product", async (req: Request, res: Response) => {
    if (!adminOrOperatorPortalOk(req)) {
      return res.status(401).json({ error: "admin_unauthorized" });
    }
    const sql = getPostgresSql();
    if (!sql) return res.status(503).json({ error: "database_unavailable" });
    try {
      const activation = await productActivationStats(sql);
      const onboarding = await snapshotOnboardingStats(sql);
      let signupMethods: { method: string; count: number }[] = [];
      try {
        const rows = await sql`
          SELECT method, COUNT(*)::text AS c
          FROM analytics_signups
          GROUP BY 1
          ORDER BY COUNT(*) DESC
        `;
        signupMethods = (rows as unknown as { method: string; c: string }[]).map((r) => ({
          method: r.method,
          count: Number(r.c),
        }));
      } catch {
        signupMethods = [];
      }
      return res.json({
        activation,
        signupMethods,
        onboarding,
      });
    } catch (err) {
      return res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get("/api/admin/engagement", async (req: Request, res: Response) => {
    if (!adminOrOperatorPortalOk(req)) {
      return res.status(401).json({ error: "admin_unauthorized" });
    }
    const sql = getPostgresSql();
    if (!sql) return res.status(503).json({ error: "database_unavailable" });

    const to = parseQueryDate(req.query.to, new Date());
    const from = parseQueryDate(req.query.from, new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000));
    const fromSql = from.toISOString();
    const toSql = to.toISOString();

    try {
      const [totals, importSources, modules, activeMembers] = await Promise.all([
        engagementTotals(sql),
        sql`
          SELECT COALESCE(NULLIF(TRIM(g->>'source'), ''), 'unknown') AS source, COUNT(*)::text AS c
          FROM app_snapshot s
          CROSS JOIN LATERAL jsonb_array_elements(s.payload->'games') AS g
          WHERE s.id = 1
          GROUP BY 1
          ORDER BY COUNT(*) DESC
        `,
        storage.aggregateAttemptsByModule(from, to),
        sql`
          SELECT COUNT(DISTINCT user_id)::text AS n
          FROM training_attempts
          WHERE attempted_at >= ${fromSql}::timestamptz
            AND attempted_at <= ${toSql}::timestamptz
        `,
      ]);

      return res.json({
        from: from.toISOString(),
        to: to.toISOString(),
        totals,
        importSources: (importSources as unknown as { source: string; c: string }[]).map((r) => ({
          source: r.source,
          count: Number(r.c),
        })),
        trainingModules: modules.map((r) => ({
          module: r.module,
          attempts: r.attempts,
          solved: r.solved,
          uniqueUsers: r.uniqueUsers,
          solveRatePct:
            r.attempts > 0 ? Math.round((r.solved / r.attempts) * 1000) / 10 : 0,
        })),
        activeTrainersInRange: Number((activeMembers[0] as unknown as { n: string })?.n ?? 0),
      });
    } catch (err) {
      return res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get("/api/admin/ops", async (req: Request, res: Response) => {
    if (!adminOrOperatorPortalOk(req)) {
      return res.status(401).json({ error: "admin_unauthorized" });
    }
    const sql = getPostgresSql();
    try {
      const tables = sql
        ? await sql`
            SELECT
              relname AS name,
              n_live_tup::text AS row_estimate
            FROM pg_stat_user_tables
            WHERE schemaname = 'public'
              AND relname IN (
                'app_snapshot',
                'analytics_page_views',
                'analytics_sessions',
                'analytics_signups',
                'training_attempts'
              )
            ORDER BY relname
          `
        : [];

      const snap = sql
        ? await sql`
            SELECT
              updated_at::text AS updated_at,
              pg_column_size(payload)::text AS payload_bytes
            FROM app_snapshot
            WHERE id = 1
            LIMIT 1
          `
        : [];

      const s0 = snap[0] as unknown as { updated_at: string; payload_bytes: string } | undefined;

      return res.json({
        database: !!sql,
        snapshot: {
          updatedAt: s0?.updated_at ?? null,
          payloadBytes: Number(s0?.payload_bytes ?? 0),
        },
        tables: (tables as unknown as { name: string; row_estimate: string }[]).map((t) => ({
          name: t.name,
          rowEstimate: Number(t.row_estimate),
        })),
        env: {
          adminNotifyEmails: Boolean(process.env.ADMIN_NOTIFY_EMAILS?.trim()),
          adminApiKey: Boolean(process.env.ADMIN_API_KEY?.trim()),
          operatorLogin: Boolean(
            process.env.OPERATOR_DASHBOARD_USER?.trim() &&
              process.env.OPERATOR_DASHBOARD_PASSWORD?.trim(),
          ),
          resend: Boolean(process.env.RESEND_API_KEY?.trim()),
          databaseUrl: Boolean(process.env.DATABASE_URL?.trim()),
          appPublicOrigin: Boolean(process.env.APP_PUBLIC_ORIGIN?.trim()),
          siteApex: Boolean(process.env.VITE_SITE_APEX?.trim()),
          ga4: Boolean(process.env.VITE_GA4_MEASUREMENT_ID?.trim()),
          googleAds: Boolean(process.env.VITE_GOOGLE_ADS_ID?.trim()),
        },
        links: {
          ga4: "https://analytics.google.com/",
          googleAds: "https://ads.google.com/",
          render: "https://dashboard.render.com/",
        },
      });
    } catch (err) {
      return res.status(500).json({ error: (err as Error).message });
    }
  });
}

async function productActivationStats(sql: NonNullable<ReturnType<typeof getPostgresSql>>) {
  const membersWhere = snapshotMembersWhere(sql);
  const rows = await sql`
    WITH members AS (
      SELECT (elem->>'id')::int AS user_id
      FROM app_snapshot s
      CROSS JOIN LATERAL jsonb_array_elements(s.payload->'users') AS elem
      ${membersWhere}
    ),
    game_users AS (
      SELECT DISTINCT (g->>'userId')::int AS user_id
      FROM app_snapshot s
      CROSS JOIN LATERAL jsonb_array_elements(s.payload->'games') AS g
      WHERE s.id = 1 AND g->>'userId' IS NOT NULL
    ),
    analyzed_users AS (
      SELECT DISTINCT (g->>'userId')::int AS user_id
      FROM app_snapshot s
      CROSS JOIN LATERAL jsonb_array_elements(s.payload->'games') AS g
      CROSS JOIN LATERAL jsonb_array_elements(s.payload->'analyses') AS a
      WHERE s.id = 1
        AND g->>'userId' IS NOT NULL
        AND (a->>'gameId')::int = (g->>'id')::int
    ),
    attempt_users AS (
      SELECT DISTINCT (a->>'userId')::int AS user_id
      FROM app_snapshot s
      CROSS JOIN LATERAL jsonb_array_elements(s.payload->'attempts') AS a
      WHERE s.id = 1 AND a->>'userId' IS NOT NULL
    ),
    email_members AS (
      SELECT (elem->>'id')::int AS user_id
      FROM app_snapshot s
      CROSS JOIN LATERAL jsonb_array_elements(s.payload->'users') AS elem
      ${membersWhere}
        AND COALESCE(elem->>'email', '') <> ''
    )
    SELECT
      (SELECT COUNT(*)::int FROM members) AS total_members,
      (SELECT COUNT(*)::int FROM email_members) AS with_email,
      (SELECT COUNT(*)::int FROM members m INNER JOIN game_users g ON g.user_id = m.user_id) AS imported_game,
      (SELECT COUNT(*)::int FROM members m INNER JOIN analyzed_users u ON u.user_id = m.user_id) AS analyzed_game,
      (SELECT COUNT(*)::int FROM members m INNER JOIN attempt_users t ON t.user_id = m.user_id) AS training_attempt,
      (SELECT COUNT(*)::int FROM members m
        INNER JOIN game_users g ON g.user_id = m.user_id
        INNER JOIN attempt_users t ON t.user_id = m.user_id) AS game_and_training
  `;
  const r = rows[0] as unknown as {
    total_members: number;
    with_email: number;
    imported_game: number;
    analyzed_game: number;
    training_attempt: number;
    game_and_training: number;
  };
  const total = Number(r?.total_members ?? 0);
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 1000) / 10 : 0);
  return {
    totalMembers: total,
    withEmail: Number(r?.with_email ?? 0),
    importedGame: Number(r?.imported_game ?? 0),
    analyzedGame: Number(r?.analyzed_game ?? 0),
    trainingAttempt: Number(r?.training_attempt ?? 0),
    gameAndTraining: Number(r?.game_and_training ?? 0),
    rates: {
      withEmailPct: pct(Number(r?.with_email ?? 0)),
      importedGamePct: pct(Number(r?.imported_game ?? 0)),
      analyzedGamePct: pct(Number(r?.analyzed_game ?? 0)),
      trainingAttemptPct: pct(Number(r?.training_attempt ?? 0)),
      gameAndTrainingPct: pct(Number(r?.game_and_training ?? 0)),
    },
  };
}

async function engagementTotals(sql: NonNullable<ReturnType<typeof getPostgresSql>>) {
  const rows = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM jsonb_array_elements(
        (SELECT payload->'games' FROM app_snapshot WHERE id = 1)
      )) AS total_games,
      (SELECT COUNT(*)::int FROM jsonb_array_elements(
        (SELECT payload->'analyses' FROM app_snapshot WHERE id = 1)
      )) AS total_analyses,
      (SELECT COUNT(*)::int FROM jsonb_array_elements(
        (SELECT payload->'attempts' FROM app_snapshot WHERE id = 1)
      )) AS total_attempts,
      (SELECT COUNT(*)::int FROM jsonb_array_elements(
        (SELECT payload->'coachThreads' FROM app_snapshot WHERE id = 1)
      )) AS coach_threads
  `;
  const r = rows[0] as unknown as {
    total_games: number;
    total_analyses: number;
    total_attempts: number;
    coach_threads: number;
  };
  return {
    totalGames: Number(r?.total_games ?? 0),
    totalAnalyses: Number(r?.total_analyses ?? 0),
    totalAttempts: Number(r?.total_attempts ?? 0),
    coachThreads: Number(r?.coach_threads ?? 0),
  };
}

async function snapshotOnboardingStats(sql: NonNullable<ReturnType<typeof getPostgresSql>>) {
  const membersWhere = snapshotMembersWhere(sql);
  const rows = await sql`
    SELECT
      COUNT(*)::text AS members,
      COUNT(*) FILTER (
        WHERE COALESCE(elem->>'preferences', '{}')::jsonb ? 'onboardingComplete'
      )::text AS prefs_flag
    FROM app_snapshot s
    CROSS JOIN LATERAL jsonb_array_elements(s.payload->'users') AS elem
    ${membersWhere}
  `;
  const r = rows[0] as unknown as { members: string; prefs_flag: string };
  return {
    members: Number(r?.members ?? 0),
    onboardingFlagInPrefs: Number(r?.prefs_flag ?? 0),
    note: "Onboarding completion is inferred from preferences.onboardingComplete when present.",
  };
}
