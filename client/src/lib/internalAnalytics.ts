/**
 * First-party page-view collector. Sends only when analytics consent is
 * granted (`analytics_storage`), matching Consent Mode rules in analytics.ts.
 */
import { getConsent } from "@/lib/analytics";

const ANON_KEY = "cfp_ia_anon";
const SESS_KEY = "cfp_ia_session";

function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `s-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function storageGet(session: boolean): string | null {
  try {
    return session ? window.sessionStorage.getItem(SESS_KEY) : window.localStorage.getItem(ANON_KEY);
  } catch {
    return null;
  }
}

function storageSet(session: boolean, value: string): void {
  try {
    if (session) window.sessionStorage.setItem(SESS_KEY, value);
    else window.localStorage.setItem(ANON_KEY, value);
  } catch {
    /* private mode */
  }
}

function getOrCreateIds(): { sessionId: string; anonymousId: string } | null {
  if (typeof window === "undefined") return null;
  let anonymousId = storageGet(false);
  if (!anonymousId || anonymousId.length < 8) {
    anonymousId = uuid();
    storageSet(false, anonymousId);
  }
  let sessionId = storageGet(true);
  if (!sessionId || sessionId.length < 8) {
    sessionId = uuid();
    storageSet(true, sessionId);
  }
  return { sessionId, anonymousId };
}

function analyticsGranted(): boolean {
  const c = getConsent();
  return c !== null && c.analytics_storage === "granted";
}

export type InternalCollectEvent = {
  type: "page_view";
  path: string;
  query?: string;
  title?: string;
  ts: number;
};

function buildPayload(events: InternalCollectEvent[]) {
  const ids = getOrCreateIds();
  if (!ids) return null;
  return {
    sessionId: ids.sessionId,
    anonymousId: ids.anonymousId,
    referrer: typeof document !== "undefined" && document.referrer ? document.referrer : undefined,
    clientLocale: typeof navigator !== "undefined" ? navigator.language : undefined,
    clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    events,
  };
}

function postCollect(body: unknown): void {
  const json = JSON.stringify(body);
  void fetch("/api/analytics/collect", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: json,
    keepalive: true,
  }).catch(() => {
    /* best-effort */
  });
}

let rafCoalesce = 0;

/**
 * Coalesced page view for the current URL (after SPA navigation). No-op
 * without consent.
 */
export function trackInternalPageView(): void {
  if (typeof window === "undefined" || !analyticsGranted()) return;
  if (rafCoalesce) cancelAnimationFrame(rafCoalesce);
  rafCoalesce = requestAnimationFrame(() => {
    rafCoalesce = 0;
    const path = window.location.pathname;
    const search = window.location.search;
    const query = search.length > 1 ? search.slice(1) : undefined;
    const ev: InternalCollectEvent = {
      type: "page_view",
      path,
      query,
      title: typeof document !== "undefined" ? document.title : undefined,
      ts: Date.now(),
    };
    const payload = buildPayload([ev]);
    if (payload) postCollect(payload);
  });
}

/**
 * Immediate flush (e.g. right after the visitor accepts analytics cookies).
 */
export function flushInternalPageView(): void {
  if (typeof window === "undefined" || !analyticsGranted()) return;
  if (rafCoalesce) {
    cancelAnimationFrame(rafCoalesce);
    rafCoalesce = 0;
  }
  const path = window.location.pathname;
  const search = window.location.search;
  const query = search.length > 1 ? search.slice(1) : undefined;
  const ev: InternalCollectEvent = {
    type: "page_view",
    path,
    query,
    title: typeof document !== "undefined" ? document.title : undefined,
    ts: Date.now(),
  };
  const payload = buildPayload([ev]);
  if (payload) postCollect(payload);
}

// `fetch(..., { keepalive: true })` helps when the document is going away; we
// avoid a separate `pagehide` + `sendBeacon` path to prevent double-counting
// the same URL after a normal SPA `trackInternalPageView` send.
