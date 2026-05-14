/**
 * Operator console hostname detection (admin sidebar, /admin/* default routes).
 *
 * **Reliable path (recommended on Render):** set build-time env so the client
 * bundle does not depend on HTML meta or server injection:
 *   `VITE_SITE_APEX=chessgm.co`
 *   (optional) `VITE_OPERATOR_SUBDOMAIN_PREFIXES=goadmingo,admin` — defaults to
 *   `goadmingo,admin` when apex is set.
 *
 * Then any host like `goadmingo.chessgm.co` or `admin.chessgm.co` matches; the
 * bare apex and `www.<apex>` stay on the main app.
 *
 * **Alternative:** mirror public URL for the same rule:
 *   `VITE_APP_PUBLIC_ORIGIN=https://chessgm.co` (same value you use for
 *   `APP_PUBLIC_ORIGIN` on the server).
 *
 * **Fallbacks:** `hostname` starts with `admin.`, `<meta name="cfp-operator-hostnames">`
 * from the server, or `VITE_ADMIN_PORTAL_HOSTNAME` exact match.
 */

function operatorHostnamesFromMeta(): Set<string> {
  const out = new Set<string>();
  if (typeof document === "undefined") return out;
  const el = document.querySelector('meta[name="cfp-operator-hostnames"]');
  const raw = el?.getAttribute("content")?.trim() ?? "";
  if (!raw || raw.includes("%CFP_OPERATOR")) return out;
  for (const part of raw.split(",")) {
    const p = part.trim().toLowerCase();
    if (p) out.add(p);
  }
  return out;
}

function normalizeBareHost(raw: string): string | undefined {
  const t = raw.trim().toLowerCase();
  if (!t) return undefined;
  try {
    if (t.includes("://")) {
      return new URL(t.startsWith("http") ? t : `https://${t}`).hostname.toLowerCase();
    }
  } catch {
    /* fall through */
  }
  const bare = t.replace(/^https?:\/\//, "").split("/")[0]?.split(":")[0]?.trim().toLowerCase() ?? "";
  if (!bare || !/^[a-z0-9.-]+$/.test(bare)) return undefined;
  return bare;
}

/** Apex registrable host, e.g. `chessgm.co` (no `www.`). */
function apexFromViteSite(): string | undefined {
  const raw = (import.meta.env.VITE_SITE_APEX as string | undefined)?.trim();
  if (!raw) return undefined;
  const host = normalizeBareHost(raw);
  if (!host) return undefined;
  return host.startsWith("www.") ? host.slice(4) : host;
}

function apexFromVitePublicOrigin(): string | undefined {
  const raw = (import.meta.env.VITE_APP_PUBLIC_ORIGIN as string | undefined)?.trim();
  if (!raw) return undefined;
  const host = normalizeBareHost(raw);
  if (!host) return undefined;
  return host.startsWith("www.") ? host.slice(4) : host;
}

function apexForPrefixRule(): string | undefined {
  return apexFromViteSite() ?? apexFromVitePublicOrigin();
}

function operatorSubdomainPrefixes(): string[] {
  const raw = (import.meta.env.VITE_OPERATOR_SUBDOMAIN_PREFIXES as string | undefined)?.trim();
  if (raw) {
    return raw.split(",").map((p) => p.trim().toLowerCase()).filter(Boolean);
  }
  return ["goadmingo", "admin"];
}

function matchesViteApexPrefixRule(h: string): boolean {
  const apex = apexForPrefixRule();
  if (!apex) return false;
  if (h === apex || h === `www.${apex}`) return false;
  if (!h.endsWith("." + apex)) return false;
  const left = h.slice(0, -(apex.length + 1));
  if (!left) return false;
  const primary = left.split(".")[0];
  return operatorSubdomainPrefixes().includes(primary);
}

export function isAdminHost(hostname?: string): boolean {
  const h = (
    hostname ?? (typeof window !== "undefined" ? window.location.hostname : "")
  ).toLowerCase();

  if (matchesViteApexPrefixRule(h)) return true;

  if (h.startsWith("admin.")) return true;
  if (operatorHostnamesFromMeta().has(h)) return true;
  const configured = (import.meta.env.VITE_ADMIN_PORTAL_HOSTNAME as string | undefined)?.trim();
  if (configured && h === configured.toLowerCase()) return true;
  return false;
}
