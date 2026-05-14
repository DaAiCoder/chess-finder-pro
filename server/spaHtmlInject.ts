/**
 * Injects runtime values into `client/index.html` when the SPA shell is
 * served (so operator hostnames work without a Vite rebuild).
 */
import type { Request } from "express";

const OPERATOR_HOSTS_PLACEHOLDER = "%CFP_OPERATOR_HOSTNAMES%";

function normalizeHostToken(p: string): string | null {
  const t = p.trim().toLowerCase();
  if (!t) return null;
  try {
    if (t.includes("://")) {
      return new URL(t.startsWith("http") ? t : `https://${t}`).hostname.toLowerCase();
    }
  } catch {
    /* fall through */
  }
  const bare = t.replace(/^https?:\/\//, "").split("/")[0]?.split(":")[0]?.trim().toLowerCase() ?? "";
  if (!bare || !/^[a-z0-9.-]+$/.test(bare) || bare.length >= 253) return null;
  return bare;
}

function sanitizeHostList(raw: string): string {
  const out = new Set<string>();
  for (const part of raw.split(",")) {
    const h = normalizeHostToken(part);
    if (h) out.add(h);
  }
  return [...out].join(",");
}

/** Comma-separated hostnames (e.g. `goadmingo.chessgm.co`) — URLs OK, scheme stripped. */
export function adminPortalHostnameCsv(): string {
  return sanitizeHostList(process.env.ADMIN_PORTAL_HOSTNAMES ?? "");
}

function useRequestHostForOperator(): boolean {
  const v = process.env.ADMIN_PORTAL_USE_REQUEST_HOST?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "off") return false;
  if (v === "1" || v === "true" || v === "on") return true;
  // Production default: any subdomain of APP_PUBLIC_ORIGIN apex (except apex
  // and www) can serve the operator shell — avoids forgetting ADMIN_PORTAL_HOSTNAMES.
  return process.env.NODE_ENV === "production";
}

/**
 * When enabled, treat the current request Host as an
 * operator console if it is a **subdomain** of the apex derived from
 * `APP_PUBLIC_ORIGIN`, excluding the bare apex and `www.<apex>` (main site).
 */
export function requestHostIfOperatorConsole(req: Request): string | null {
  if (!useRequestHostForOperator()) return null;
  const xf = req.headers["x-forwarded-host"];
  const rawHost =
    (typeof xf === "string" ? xf.split(",")[0]?.trim() : undefined) ||
    req.get("host") ||
    "";
  const host = rawHost.split(":")[0]?.trim().toLowerCase() ?? "";
  if (!host || !/^[a-z0-9.-]+$/.test(host)) return null;

  const pub = process.env.APP_PUBLIC_ORIGIN?.trim();
  if (!pub) return null;
  let mainHost: string;
  try {
    mainHost = new URL(pub).hostname.toLowerCase();
  } catch {
    return null;
  }
  const apex = mainHost.startsWith("www.") ? mainHost.slice(4) : mainHost;
  if (host === apex || host === mainHost) return null;
  if (host === `www.${apex}`) return null;
  if (!host.endsWith("." + apex)) return null;
  return host;
}

/** True when Origin/Referer host should be allowed for first-party collect (subdomain rule). */
export function operatorSubdomainMatchesPublicOrigin(hostname: string): boolean {
  if (!useRequestHostForOperator()) return false;
  const host = hostname.toLowerCase();
  const pub = process.env.APP_PUBLIC_ORIGIN?.trim();
  if (!pub) return false;
  let mainHost: string;
  try {
    mainHost = new URL(pub).hostname.toLowerCase();
  } catch {
    return false;
  }
  const apex = mainHost.startsWith("www.") ? mainHost.slice(4) : mainHost;
  if (host === apex || host === mainHost) return false;
  if (host === `www.${apex}`) return false;
  return host.endsWith("." + apex);
}

export function operatorHostCsvForInjection(req?: Request): string {
  const fromEnv = adminPortalHostnameCsv();
  const fromReq = req ? requestHostIfOperatorConsole(req) : null;
  const set = new Set<string>();
  for (const h of fromEnv.split(",")) {
    if (h) set.add(h);
  }
  if (fromReq) set.add(fromReq);
  return [...set].join(",");
}

export function adminPortalHostSet(): Set<string> {
  const set = new Set<string>();
  for (const h of adminPortalHostnameCsv().split(",")) {
    if (h) set.add(h);
  }
  return set;
}

export function injectOperatorPortalMeta(html: string, req?: Request): string {
  if (!html.includes(OPERATOR_HOSTS_PLACEHOLDER)) return html;
  return html.split(OPERATOR_HOSTS_PLACEHOLDER).join(operatorHostCsvForInjection(req));
}
