/**
 * Public subscription prices + admin overrides.
 *
 * Defaults: $12.99/mo, $79/yr. Persisted in `data/site-pricing.json` so an
 * operator can change them without redeploying. Admin updates require
 * `ADMIN_API_KEY` (Bearer or `X-Admin-Key` header).
 */
import fs from "node:fs/promises";
import path from "node:path";
import type { Express, Request, Response } from "express";

const DEFAULT_MONTHLY = 12.99;
const DEFAULT_YEARLY = 79;
const DEFAULT_CURRENCY = "USD";

export interface SitePricing {
  monthlyUsd: number;
  yearlyUsd: number;
  currency: string;
  updatedAt: string | null;
}

const pricingPath = () =>
  path.join(process.cwd(), "data", "site-pricing.json");

let cache: SitePricing | null = null;

export function defaultPricing(): SitePricing {
  return {
    monthlyUsd: DEFAULT_MONTHLY,
    yearlyUsd: DEFAULT_YEARLY,
    currency: DEFAULT_CURRENCY,
    updatedAt: null,
  };
}

export async function getSitePricing(): Promise<SitePricing> {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(pricingPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<SitePricing>;
    cache = {
      monthlyUsd: Number(parsed.monthlyUsd) || DEFAULT_MONTHLY,
      yearlyUsd: Number(parsed.yearlyUsd) || DEFAULT_YEARLY,
      currency: typeof parsed.currency === "string" ? parsed.currency : DEFAULT_CURRENCY,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
    };
    return cache;
  } catch {
    cache = defaultPricing();
    return cache;
  }
}

/** Invalidate in-memory cache (call after admin write). */
export function invalidatePricingCache(): void {
  cache = null;
}

export async function setSitePricing(patch: {
  monthlyUsd?: number;
  yearlyUsd?: number;
  currency?: string;
}): Promise<SitePricing> {
  const cur = await getSitePricing();
  const next: SitePricing = {
    monthlyUsd:
      patch.monthlyUsd != null && Number.isFinite(patch.monthlyUsd)
        ? Math.round(patch.monthlyUsd * 100) / 100
        : cur.monthlyUsd,
    yearlyUsd:
      patch.yearlyUsd != null && Number.isFinite(patch.yearlyUsd)
        ? Math.round(patch.yearlyUsd * 100) / 100
        : cur.yearlyUsd,
    currency: patch.currency?.trim() || cur.currency,
    updatedAt: new Date().toISOString(),
  };
  await fs.mkdir(path.dirname(pricingPath()), { recursive: true });
  await fs.writeFile(pricingPath(), JSON.stringify(next, null, 2), "utf8");
  invalidatePricingCache();
  return getSitePricing();
}

export function adminKeyOk(req: Request): boolean {
  const key = process.env.ADMIN_API_KEY?.trim();
  if (!key) return false;
  const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, "").trim();
  const header = req.headers["x-admin-key"] as string | undefined;
  return bearer === key || header === key;
}

export function registerSitePricingRoutes(app: Express): void {
  app.get("/api/pricing", async (_req: Request, res: Response) => {
    try {
      const p = await getSitePricing();
      res.json(p);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.put("/api/admin/pricing", async (req: Request, res: Response) => {
    if (!adminKeyOk(req)) {
      return res.status(401).json({
        error: "admin_unauthorized",
        message:
          "Set ADMIN_API_KEY in the server environment and send it as Authorization: Bearer <key> or X-Admin-Key.",
      });
    }
    try {
      const body = req.body as Record<string, unknown>;
      const next = await setSitePricing({
        monthlyUsd: body.monthlyUsd != null ? Number(body.monthlyUsd) : undefined,
        yearlyUsd: body.yearlyUsd != null ? Number(body.yearlyUsd) : undefined,
        currency: typeof body.currency === "string" ? body.currency : undefined,
      });
      res.json({ ok: true, pricing: next });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });
}
