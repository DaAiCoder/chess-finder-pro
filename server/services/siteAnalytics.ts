/**
 * First-party site analytics: ingest (public, consent-gated client) + admin
 * JSON APIs (ADMIN_API_KEY). Persists to Postgres when DATABASE_URL is set.
 */
import type { Express, Request, Response } from "express";
import { z } from "zod";
import geoip from "geoip-lite";
import { getPostgresSql } from "../pgClient.js";
import { adminOrOperatorPortalOk } from "./sitePricing.js";
import { adminPortalHostSet, operatorSubdomainMatchesPublicOrigin } from "../spaHtmlInject.js";
import { countSignupsInRange, listRecentSignups } from "./signupAnalytics.js";
import { storage } from "../storage.js";
import {
  snapshotMemberSubscriptionStats,
  snapshotSignupsInRange,
} from "./snapshotQuery.js";

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 120;
const rateBuckets = new Map<string, { n: number; resetAt: number }>();

function rateLimitOk(ip: string): boolean {
  const now = Date.now();
  const b = rateBuckets.get(ip);
  if (!b || now > b.resetAt) {
    rateBuckets.set(ip, { n: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (b.n >= RATE_MAX) return false;
  b.n += 1;
  return true;
}

function clientIp(req: Request): string {
  if (typeof req.ip === "string" && req.ip.length > 0) {
    return req.ip.startsWith("::ffff:") ? req.ip.slice(7) : req.ip;
  }
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length > 0) {
    return xf.split(",")[0]?.trim() || "";
  }
  return req.socket.remoteAddress || "";
}

function countryFromRequest(req: Request, ip: string): string | null {
  const cf = req.headers["cf-ipcountry"];
  if (typeof cf === "string" && cf.length === 2 && cf !== "XX") {
    return cf.toUpperCase();
  }
  if (!ip || ip === "::1" || ip.startsWith("127.") || ip === "::ffff:127.0.0.1") {
    return null;
  }
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  try {
    const hit = geoip.lookup(v4);
    return hit?.country ?? null;
  } catch {
    return null;
  }
}

function allowedOriginHosts(): Set<string> {
  const hosts = new Set<string>();
  for (const h of adminPortalHostSet()) {
    hosts.add(h);
  }
  const pub = process.env.APP_PUBLIC_ORIGIN?.trim();
  if (pub) {
    try {
      const h = new URL(pub).host.toLowerCase();
      hosts.add(h);
      const apex = h.startsWith("www.") ? h.slice(4) : h;
      hosts.add(`admin.${apex}`);
    } catch {
      /* ignore */
    }
  }
  const extra = process.env.APP_ANALYTICS_ALLOWED_HOSTS?.trim();
  if (extra) {
    for (const part of extra.split(",")) {
      const p = part.trim();
      if (!p) continue;
      try {
        hosts.add(p.includes("://") ? new URL(p).host.toLowerCase() : p.toLowerCase());
      } catch {
        /* ignore */
      }
    }
  }
  hosts.add("localhost:5000");
  hosts.add("127.0.0.1:5000");
  hosts.add("localhost:5173");
  return hosts;
}

function originAllowed(req: Request): boolean {
  const hosts = allowedOriginHosts();
  const origin = req.headers.origin;
  if (origin) {
    try {
      const oh = new URL(origin).host.toLowerCase();
      if (hosts.has(oh)) return true;
      if (operatorSubdomainMatchesPublicOrigin(oh)) return true;
      return false;
    } catch {
      return false;
    }
  }
  const ref = req.headers.referer;
  if (ref) {
    try {
      const rh = new URL(ref).host.toLowerCase();
      if (hosts.has(rh)) return true;
      if (operatorSubdomainMatchesPublicOrigin(rh)) return true;
      return false;
    } catch {
      return false;
    }
  }
  return process.env.NODE_ENV !== "production";
}

const collectBodySchema = z.object({
  sessionId: z.string().min(8).max(36),
  anonymousId: z.string().min(8).max(64),
  referrer: z.string().max(2048).optional(),
  clientLocale: z.string().max(32).optional(),
  clientTimezone: z.string().max(64).optional(),
  events: z
    .array(
      z.object({
        type: z.literal("page_view"),
        path: z.string().min(1).max(4096),
        query: z.string().max(512).optional(),
        title: z.string().max(512).optional(),
        ts: z.number().int(),
      }),
    )
    .min(1)
    .max(50),
});

function trunc(s: string | undefined, max: number): string | null {
  if (s == null || s === "") return null;
  return s.length <= max ? s : s.slice(0, max);
}

function parseQueryDate(q: unknown, fallback: Date): Date {
  if (typeof q !== "string" || !q.trim()) return fallback;
  const d = new Date(q);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

export function registerSiteAnalyticsRoutes(app: Express): void {
  app.post("/api/analytics/collect", async (req: Request, res: Response) => {
    const sql = getPostgresSql();
    if (!sql) {
      return res.status(204).end();
    }
    if (!originAllowed(req)) {
      return res.status(403).json({ error: "origin_not_allowed" });
    }
    const ip = clientIp(req);
    if (!rateLimitOk(ip || "unknown")) {
      return res.status(429).json({ error: "rate_limited" });
    }

    const parsed = collectBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
    }
    const body = parsed.data;
    const ua = trunc(typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : "", 512);
    const country = countryFromRequest(req, ip);
    const userId = req.session.userId ?? null;
    const ref = trunc(body.referrer, 2048);
    const loc = trunc(body.clientLocale, 32);
    const tz = trunc(body.clientTimezone, 64);

    const tsList = body.events.map((e) => e.ts);
    const tMin = Math.min(...tsList);
    const tMax = Math.max(...tsList);
    const startedAt = new Date(tMin);
    const lastSeenAt = new Date(tMax);
    const startedIso = startedAt.toISOString();
    const lastSeenIso = lastSeenAt.toISOString();

    try {
      await sql.begin(async (tx) => {
        await tx`
          INSERT INTO analytics_sessions (
            id, started_at, last_seen_at, anonymous_id, user_id, country,
            referrer, user_agent, client_locale, client_timezone
          )
          VALUES (
            ${body.sessionId},
            ${startedIso},
            ${lastSeenIso},
            ${body.anonymousId},
            ${userId},
            ${country},
            ${ref},
            ${ua},
            ${loc},
            ${tz}
          )
          ON CONFLICT (id) DO UPDATE SET
            started_at = LEAST(analytics_sessions.started_at, EXCLUDED.started_at),
            last_seen_at = GREATEST(analytics_sessions.last_seen_at, EXCLUDED.last_seen_at),
            user_id = COALESCE(EXCLUDED.user_id, analytics_sessions.user_id),
            country = COALESCE(analytics_sessions.country, EXCLUDED.country),
            referrer = COALESCE(EXCLUDED.referrer, analytics_sessions.referrer),
            user_agent = COALESCE(EXCLUDED.user_agent, analytics_sessions.user_agent),
            client_locale = COALESCE(EXCLUDED.client_locale, analytics_sessions.client_locale),
            client_timezone = COALESCE(EXCLUDED.client_timezone, analytics_sessions.client_timezone)
        `;

        for (const ev of body.events) {
          await tx`
            INSERT INTO analytics_page_views (session_id, path, query, title, occurred_at)
            VALUES (
              ${body.sessionId},
              ${ev.path},
              ${trunc(ev.query, 512)},
              ${trunc(ev.title, 512)},
              ${new Date(ev.ts).toISOString()}
            )
          `;
        }
      });
      return res.status(204).end();
    } catch (err) {
      console.warn("[site-analytics] collect failed:", (err as Error).message);
      return res.status(500).json({ error: "persist_failed" });
    }
  });

  app.get("/api/admin/analytics/summary", async (req: Request, res: Response) => {
    if (!adminOrOperatorPortalOk(req)) {
      return res.status(401).json({ error: "admin_unauthorized" });
    }
    const sql = getPostgresSql();
    if (!sql) {
      return res.status(503).json({ error: "database_unavailable" });
    }
    const to = parseQueryDate(req.query.to, new Date());
    const from = parseQueryDate(req.query.from, new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000));
    const fromSql = from.toISOString();
    const toSql = to.toISOString();

    try {
      const series = await sql`
        SELECT
          to_char(date_trunc('day', occurred_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS d,
          COUNT(*)::text AS page_views,
          COUNT(DISTINCT session_id)::text AS sessions
        FROM analytics_page_views
        WHERE occurred_at >= ${fromSql}::timestamptz AND occurred_at <= ${toSql}::timestamptz
        GROUP BY 1
        ORDER BY 1 ASC
      `;

      const totals = await sql`
        SELECT
          COUNT(*)::text AS page_views,
          COUNT(DISTINCT session_id)::text AS sessions
        FROM analytics_page_views
        WHERE occurred_at >= ${fromSql}::timestamptz AND occurred_at <= ${toSql}::timestamptz
      `;
      const t0 = totals[0] as unknown as { page_views: string; sessions: string } | undefined;
      const pageViews = Number(t0?.page_views ?? 0);
      const sessions = Number(t0?.sessions ?? 0);

      const [uniqAnon, uniqSigned, bounceAgg, snapshotSubs, topRefs] = await Promise.all([
          sql`
            SELECT COUNT(DISTINCT s.anonymous_id)::text AS n
            FROM analytics_sessions s
            WHERE EXISTS (
              SELECT 1 FROM analytics_page_views p
              WHERE p.session_id = s.id
                AND p.occurred_at >= ${fromSql}::timestamptz
                AND p.occurred_at <= ${toSql}::timestamptz
            )
          `,
          sql`
            SELECT COUNT(DISTINCT s.user_id)::text AS n
            FROM analytics_sessions s
            WHERE s.user_id IS NOT NULL
              AND EXISTS (
                SELECT 1 FROM analytics_page_views p
                WHERE p.session_id = s.id
                  AND p.occurred_at >= ${fromSql}::timestamptz
                  AND p.occurred_at <= ${toSql}::timestamptz
              )
          `,
          sql`
            WITH pv AS (
              SELECT session_id, COUNT(*)::int AS n
              FROM analytics_page_views
              WHERE occurred_at >= ${fromSql}::timestamptz AND occurred_at <= ${toSql}::timestamptz
              GROUP BY session_id
            )
            SELECT
              COUNT(*)::text AS sessions,
              COUNT(*) FILTER (WHERE n = 1)::text AS bounces
            FROM pv
          `,
          snapshotMemberSubscriptionStats(sql),
          sql`
            SELECT
              COALESCE(NULLIF(TRIM(substring(s.referrer from 1 for 120)), ''), '(direct)') AS ref,
              COUNT(DISTINCT s.id)::text AS c
            FROM analytics_sessions s
            INNER JOIN analytics_page_views p ON p.session_id = s.id
            WHERE p.occurred_at >= ${fromSql}::timestamptz
              AND p.occurred_at <= ${toSql}::timestamptz
              AND s.referrer IS NOT NULL
              AND length(trim(s.referrer)) > 0
            GROUP BY 1
            ORDER BY COUNT(*) DESC
            LIMIT 12
          `,
        ]);

      const signupEvents = await countSignupsInRange(from, to);
      const snapshotSignupsMem = await storage.countMemberSignupsInRange(from, to);
      const snapshotSignupsSql = await snapshotSignupsInRange(sql, fromSql, toSql);
      const newUsersInRange =
        signupEvents > 0
          ? signupEvents
          : snapshotSignupsMem > 0
            ? snapshotSignupsMem
            : snapshotSignupsSql;

      const ua = uniqAnon[0] as unknown as { n: string } | undefined;
      const us = uniqSigned[0] as unknown as { n: string } | undefined;
      const ba = bounceAgg[0] as unknown as { sessions: string; bounces: string } | undefined;
      const bounceSessions = Number(ba?.bounces ?? 0);
      const bounceBase = Number(ba?.sessions ?? 0);
      const bounceRatePct =
        bounceBase > 0 ? Math.round((bounceSessions / bounceBase) * 1000) / 10 : 0;
      const avgPagesPerSession =
        sessions > 0 ? Math.round((pageViews / sessions) * 100) / 100 : 0;

      const snapshotSubsStats = snapshotSubs as Awaited<
        ReturnType<typeof snapshotMemberSubscriptionStats>
      >;

      return res.json({
        from: from.toISOString(),
        to: to.toISOString(),
        series: (series as unknown as { d: string; page_views: string; sessions: string }[]).map((r) => ({
          day: r.d,
          pageViews: Number(r.page_views),
          sessions: Number(r.sessions),
        })),
        totals: {
          pageViews,
          sessions,
          uniqueAnonymous: Number(ua?.n ?? 0),
          signedInVisitors: Number(us?.n ?? 0),
          avgPagesPerSession,
          bounceSessions,
          bounceRatePct,
        },
        subscriptions: {
          totalUsers: snapshotSubsStats.totalUsers,
          activeOrTrialing: snapshotSubsStats.paying,
          newUsersInRange,
          byStatus: snapshotSubsStats.byStatus,
          byPlan: snapshotSubsStats.byPlan,
        },
        topReferrers: (topRefs as unknown as { ref: string; c: string }[]).map((r) => ({
          referrer: r.ref,
          sessions: Number(r.c),
        })),
      });
    } catch (err) {
      return res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get("/api/admin/analytics/top-pages", async (req: Request, res: Response) => {
    if (!adminOrOperatorPortalOk(req)) {
      return res.status(401).json({ error: "admin_unauthorized" });
    }
    const sql = getPostgresSql();
    if (!sql) return res.status(503).json({ error: "database_unavailable" });
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const to = parseQueryDate(req.query.to, new Date());
    const from = parseQueryDate(req.query.from, new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000));
    const fromSql = from.toISOString();
    const toSql = to.toISOString();

    try {
      const rows = await sql`
        SELECT path, COUNT(*)::text AS c
        FROM analytics_page_views
        WHERE occurred_at >= ${fromSql}::timestamptz AND occurred_at <= ${toSql}::timestamptz
        GROUP BY path
        ORDER BY COUNT(*) DESC
        LIMIT ${limit}
      `;
      return res.json({
        items: (rows as unknown as { path: string; c: string }[]).map((r) => ({ path: r.path, views: Number(r.c) })),
      });
    } catch (err) {
      return res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get("/api/admin/analytics/top-countries", async (req: Request, res: Response) => {
    if (!adminOrOperatorPortalOk(req)) {
      return res.status(401).json({ error: "admin_unauthorized" });
    }
    const sql = getPostgresSql();
    if (!sql) return res.status(503).json({ error: "database_unavailable" });
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 30));
    const to = parseQueryDate(req.query.to, new Date());
    const from = parseQueryDate(req.query.from, new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000));
    const fromSql = from.toISOString();
    const toSql = to.toISOString();

    try {
      const rows = await sql`
        SELECT country, COUNT(*)::text AS c
        FROM analytics_sessions
        WHERE country IS NOT NULL
          AND started_at >= ${fromSql}::timestamptz
          AND started_at <= ${toSql}::timestamptz
        GROUP BY country
        ORDER BY COUNT(*) DESC
        LIMIT ${limit}
      `;
      return res.json({
        items: (rows as unknown as { country: string; c: string }[]).map((r) => ({
          country: r.country,
          sessions: Number(r.c),
        })),
      });
    } catch (err) {
      return res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get("/api/admin/analytics/recent-sessions", async (req: Request, res: Response) => {
    if (!adminOrOperatorPortalOk(req)) {
      return res.status(401).json({ error: "admin_unauthorized" });
    }
    const sql = getPostgresSql();
    if (!sql) return res.status(503).json({ error: "database_unavailable" });
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 40));

    try {
      const rows = await sql`
        SELECT
          s.id,
          s.started_at,
          s.last_seen_at,
          s.anonymous_id,
          s.user_id,
          s.country,
          s.referrer,
          COUNT(p.id)::text AS page_views
        FROM analytics_sessions s
        LEFT JOIN analytics_page_views p ON p.session_id = s.id
        GROUP BY s.id, s.started_at, s.last_seen_at, s.anonymous_id, s.user_id, s.country, s.referrer
        ORDER BY s.last_seen_at DESC
        LIMIT ${limit}
      `;
      type RecentRow = {
        id: string;
        started_at: Date;
        last_seen_at: Date;
        anonymous_id: string;
        user_id: number | null;
        country: string | null;
        referrer: string | null;
        page_views: string;
      };
      return res.json({
        items: (rows as unknown as RecentRow[]).map((r) => ({
          id: r.id,
          startedAt:
            r.started_at instanceof Date ? r.started_at.toISOString() : String(r.started_at),
          lastSeenAt:
            r.last_seen_at instanceof Date ? r.last_seen_at.toISOString() : String(r.last_seen_at),
          anonymousId: r.anonymous_id,
          userId: r.user_id,
          country: r.country,
          referrer: r.referrer,
          pageViews: Number(r.page_views),
        })),
      });
    } catch (err) {
      return res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get("/api/admin/analytics/health", async (req: Request, res: Response) => {
    if (!adminOrOperatorPortalOk(req)) {
      return res.status(401).json({ error: "admin_unauthorized" });
    }
    const sql = getPostgresSql();
    return res.json({
      database: !!sql,
      env: {
        adminNotifyEmails: Boolean(process.env.ADMIN_NOTIFY_EMAILS?.trim()),
        adminApiKey: Boolean(process.env.ADMIN_API_KEY?.trim()),
        operatorLogin: Boolean(
          process.env.OPERATOR_DASHBOARD_USER?.trim() &&
            process.env.OPERATOR_DASHBOARD_PASSWORD?.trim(),
        ),
        resend: Boolean(process.env.RESEND_API_KEY?.trim()),
        appPublicOrigin: Boolean(process.env.APP_PUBLIC_ORIGIN?.trim()),
        siteApex: Boolean(process.env.VITE_SITE_APEX?.trim()),
      },
      notes: [
        "VITE_GA4_MEASUREMENT_ID and VITE_GOOGLE_ADS_ID are build-time — set on Render before deploy.",
        "First-party page views require visitor analytics cookie consent.",
        "Sign-ups are recorded server-side in analytics_signups (no consent required).",
      ],
    });
  });

  app.get("/api/admin/analytics/recent-signups", async (req: Request, res: Response) => {
    if (!adminOrOperatorPortalOk(req)) {
      return res.status(401).json({ error: "admin_unauthorized" });
    }
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const to = parseQueryDate(req.query.to, new Date());
    const from = parseQueryDate(req.query.from, new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000));
    const items = await listRecentSignups({ limit, from, to });
    return res.json({ items });
  });

  app.get("/api/admin/analytics/top-trainers", async (req: Request, res: Response) => {
    if (!adminOrOperatorPortalOk(req)) {
      return res.status(401).json({ error: "admin_unauthorized" });
    }
    const to = parseQueryDate(req.query.to, new Date());
    const from = parseQueryDate(req.query.from, new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000));
    try {
      const items = await storage.aggregateAttemptsByModule(from, to);
      return res.json({ items });
    } catch (err) {
      return res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get("/api/admin/analytics/top-trainer-pages", async (req: Request, res: Response) => {
    if (!adminOrOperatorPortalOk(req)) {
      return res.status(401).json({ error: "admin_unauthorized" });
    }
    const sql = getPostgresSql();
    if (!sql) return res.status(503).json({ error: "database_unavailable" });
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const to = parseQueryDate(req.query.to, new Date());
    const from = parseQueryDate(req.query.from, new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000));
    const fromSql = from.toISOString();
    const toSql = to.toISOString();

    try {
      const rows = await sql`
        SELECT path, COUNT(*)::text AS c
        FROM analytics_page_views
        WHERE occurred_at >= ${fromSql}::timestamptz AND occurred_at <= ${toSql}::timestamptz
          AND (
            path LIKE '/training%'
            OR path LIKE '/openings%'
            OR path LIKE '/endgames%'
            OR path LIKE '/champions%'
            OR path LIKE '/coach%'
            OR path LIKE '/analysis%'
          )
        GROUP BY path
        ORDER BY COUNT(*) DESC
        LIMIT ${limit}
      `;
      return res.json({
        items: (rows as unknown as { path: string; c: string }[]).map((r) => ({
          path: r.path,
          views: Number(r.c),
        })),
      });
    } catch (err) {
      return res.status(500).json({ error: (err as Error).message });
    }
  });
}
