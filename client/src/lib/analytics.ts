/**
 * Google Tag (gtag.js) wrapper with **Consent Mode v2** gating.
 *
 *  - The gtag bootstrap is injected from `client/index.html` and sets all
 *    consent signals to `denied` by default (with `wait_for_update`) so
 *    nothing fires before the visitor decides via the cookie banner.
 *  - `setConsent(true)` calls `gtag('consent','update',…)` to grant the
 *    four Consent Mode v2 signals.
 *  - All `track*` helpers are no-ops when the tag IDs aren't configured
 *    (`VITE_GA4_MEASUREMENT_ID`) — so dev / open-source forks still work
 *    without an analytics setup.
 *
 * Env vars (Vite injects at build time):
 *   VITE_GA4_MEASUREMENT_ID            G-XXXXXXXXXX
 *   VITE_GOOGLE_ADS_ID                 AW-XXXXXXXXXX
 *   VITE_GOOGLE_ADS_CONVERSION_LABEL   <conversion label>
 */

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const STORAGE_KEY = "cfp_consent";

export type ConsentChoice = "granted" | "denied";

export interface ConsentSnapshot {
  ad_storage: ConsentChoice;
  analytics_storage: ConsentChoice;
  ad_user_data: ConsentChoice;
  ad_personalization: ConsentChoice;
  ts: number;
}

function ga4Id(): string | undefined {
  return (import.meta.env.VITE_GA4_MEASUREMENT_ID as string | undefined) || undefined;
}
function adsId(): string | undefined {
  return (import.meta.env.VITE_GOOGLE_ADS_ID as string | undefined) || undefined;
}
function conversionLabel(): string | undefined {
  return (
    (import.meta.env.VITE_GOOGLE_ADS_CONVERSION_LABEL as string | undefined) || undefined
  );
}

function safeGtag(...args: unknown[]): void {
  if (typeof window === "undefined") return;
  // Always queue into dataLayer so events pre-load are retained.
  window.dataLayer = window.dataLayer || [];
  if (typeof window.gtag === "function") {
    window.gtag(...args);
  } else {
    window.dataLayer.push(args);
  }
}

/* ---------------------------------------------------------------------- */
/* Consent management                                                      */
/* ---------------------------------------------------------------------- */

export function getConsent(): ConsentSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ConsentSnapshot>;
    if (
      parsed &&
      (parsed.ad_storage === "granted" || parsed.ad_storage === "denied") &&
      (parsed.analytics_storage === "granted" || parsed.analytics_storage === "denied")
    ) {
      return {
        ad_storage: parsed.ad_storage,
        analytics_storage: parsed.analytics_storage,
        ad_user_data: parsed.ad_user_data === "granted" ? "granted" : "denied",
        ad_personalization: parsed.ad_personalization === "granted" ? "granted" : "denied",
        ts: typeof parsed.ts === "number" ? parsed.ts : Date.now(),
      };
    }
  } catch {
    /* corrupt JSON — treat as no decision */
  }
  return null;
}

export function hasConsentDecision(): boolean {
  return getConsent() !== null;
}

export function setConsent(grant: boolean): void {
  if (typeof window === "undefined") return;
  const choice: ConsentChoice = grant ? "granted" : "denied";
  const snapshot: ConsentSnapshot = {
    ad_storage: choice,
    analytics_storage: choice,
    ad_user_data: choice,
    ad_personalization: choice,
    ts: Date.now(),
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    /* private mode or storage full — still tell gtag */
  }
  safeGtag("consent", "update", {
    ad_storage: choice,
    analytics_storage: choice,
    ad_user_data: choice,
    ad_personalization: choice,
  });
  // If the visitor just granted consent post-pageload, fire an explicit
  // page_view so the session shows up in GA4 instead of being lost.
  if (grant) {
    const id = ga4Id();
    if (id) {
      safeGtag("event", "page_view", {
        send_to: id,
        page_location: window.location.href,
        page_path: window.location.pathname + window.location.search,
        page_title: document.title,
      });
    }
  }
}

/** Restore previous decision from localStorage on app boot. */
export function bootstrapConsent(): void {
  const snap = getConsent();
  if (!snap) return; // banner will run, defaults remain "denied"
  safeGtag("consent", "update", {
    ad_storage: snap.ad_storage,
    analytics_storage: snap.analytics_storage,
    ad_user_data: snap.ad_user_data,
    ad_personalization: snap.ad_personalization,
  });
}

/* ---------------------------------------------------------------------- */
/* Event helpers                                                           */
/* ---------------------------------------------------------------------- */

export function trackPageView(pathOverride?: string): void {
  if (typeof window === "undefined") return;
  const id = ga4Id();
  if (!id) return;
  const page_path =
    pathOverride ?? window.location.pathname + window.location.search;
  safeGtag("event", "page_view", {
    send_to: id,
    page_location: window.location.origin + page_path,
    page_path,
    page_title: document.title,
  });
}

export function trackEvent(name: string, params: Record<string, unknown> = {}): void {
  const id = ga4Id();
  if (!id) return;
  safeGtag("event", name, { send_to: id, ...params });
}

export function trackSignUp(method: "email" | "lichess" | "magic_link" = "email"): void {
  trackEvent("sign_up", { method });
}

export function trackBeginCheckout(payload: {
  plan: "monthly" | "yearly";
  value: number;
  currency?: string;
}): void {
  trackEvent("begin_checkout", {
    currency: payload.currency ?? "USD",
    value: payload.value,
    items: [
      {
        item_id: payload.plan === "monthly" ? "pro_monthly" : "pro_yearly",
        item_name: payload.plan === "monthly" ? "Pro Monthly" : "Pro Yearly",
        price: payload.value,
        quantity: 1,
      },
    ],
  });
}

/* ---------------------------------------------------------------------- */
/* Legacy shim                                                             */
/* ---------------------------------------------------------------------- */
/*
 * Earlier feature pages (`onboarding`, `variants-lobby`, `opponent-prep`)
 * import a `track(eventName, params)` helper plus a named `Events`
 * constant. The new gtag wrapper above already covers it via
 * `trackEvent`, so we re-export a thin shim for source-compat.
 */

export const Events = {
  OnboardingStart: "onboarding_start",
  OnboardingComplete: "onboarding_complete",
  VariantStart: "variant_start",
  OpponentReportOpen: "opponent_report_open",
} as const;

export type AnalyticsEvent = (typeof Events)[keyof typeof Events];

export function track(
  name: AnalyticsEvent | string,
  params: Record<string, unknown> = {},
): void {
  trackEvent(name, params);
}

export function trackPurchase(payload: {
  transactionId: string;
  plan: "monthly" | "yearly";
  value: number;
  currency?: string;
}): void {
  const currency = payload.currency ?? "USD";

  trackEvent("purchase", {
    transaction_id: payload.transactionId,
    currency,
    value: payload.value,
    items: [
      {
        item_id: payload.plan === "monthly" ? "pro_monthly" : "pro_yearly",
        item_name: payload.plan === "monthly" ? "Pro Monthly" : "Pro Yearly",
        price: payload.value,
        quantity: 1,
      },
    ],
  });

  // Google Ads conversion (separate `send_to` to fire only the Ads tag).
  const ads = adsId();
  const label = conversionLabel();
  if (ads && label) {
    safeGtag("event", "conversion", {
      send_to: `${ads}/${label}`,
      transaction_id: payload.transactionId,
      value: payload.value,
      currency,
    });
  }
}
