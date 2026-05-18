/**
 * Per-widget preview quota for the marketing landing page.
 *
 * Replaces the old single-budget `useFeatureTrial` hook. Each headline
 * feature ("coach", "analysis", "blind", "opponent") gets its own
 * 3-try counter, persisted in localStorage and synced across tabs.
 *
 * Signed-in members with Pro access (`hasProAccess`) get unlimited preview
 * counters on /welcome widgets. Guests and signed-in users without Pro use
 * the per-widget cap.
 *
 * The full pages at /coach, /analysis, /opponent-prep are behind
 * `RequireAuth`, so guests can only consume the matching previews
 * embedded on /welcome. The "blind" preview points at the
 * `/training/visualization` trainer, which stays open to guests.
 */
import * as React from "react";
import { useCurrentUser } from "./useCurrentUser";

const STORAGE_KEY = "cfp-preview-quota-v1";

/** Per-widget allowance for anonymous users. Bump down once we monetize. */
export const PREVIEW_BUDGET = 3;

export type PreviewWidget = "coach" | "analysis" | "blind" | "opponent";

type Counts = Partial<Record<PreviewWidget, number>>;

function readCounts(): Counts {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Counts;
  } catch {
    return {};
  }
}

function writeCounts(c: Counts): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
  } catch {
    /* quota / private-mode — non-fatal */
  }
}

function broadcast(): void {
  try {
    window.dispatchEvent(new Event("cfp-preview-quota-changed"));
  } catch {
    /* ignore */
  }
}

/** Wipe every per-widget counter. Call after successful login/signup. */
export function resetPreviewQuotaAll(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  broadcast();
}

export interface UsePreviewQuotaResult {
  /** True when the user has Pro access (trial, subscription, or complimentary). */
  unlimited: boolean;
  /** How many tries the guest has spent on this widget. */
  used: number;
  /** Per-widget cap. */
  budget: number;
  /** Tries remaining (Infinity for signed-in). */
  remaining: number;
  /** Convenience: used >= budget for guests. */
  exceeded: boolean;
  /**
   * Try to spend one action. Returns true if the caller should proceed,
   * false if the widget is out of tries. Idempotent across re-renders.
   */
  spend: (n?: number) => boolean;
  /** Reset just this widget (rarely needed; mostly for tests). */
  reset: () => void;
}

export function usePreviewQuota(widget: PreviewWidget): UsePreviewQuotaResult {
  const { user } = useCurrentUser();
  const unlimited = !!user && !user.anonymous && user.hasProAccess === true;

  const [counts, setCounts] = React.useState<Counts>(() => readCounts());

  // Sync across tabs and across hook instances in the same tab.
  React.useEffect(() => {
    const onChange = () => setCounts(readCounts());
    window.addEventListener("storage", onChange);
    window.addEventListener("cfp-preview-quota-changed", onChange);
    return () => {
      window.removeEventListener("storage", onChange);
      window.removeEventListener("cfp-preview-quota-changed", onChange);
    };
  }, []);

  const used = counts[widget] ?? 0;
  const remaining = unlimited
    ? Number.POSITIVE_INFINITY
    : Math.max(0, PREVIEW_BUDGET - used);
  const exceeded = !unlimited && used >= PREVIEW_BUDGET;

  const spend = React.useCallback(
    (n: number = 1): boolean => {
      if (unlimited) return true;
      const cur = readCounts();
      const curUsed = cur[widget] ?? 0;
      if (curUsed >= PREVIEW_BUDGET) return false;
      const next: Counts = {
        ...cur,
        [widget]: Math.min(PREVIEW_BUDGET, curUsed + n),
      };
      writeCounts(next);
      broadcast();
      return true;
    },
    [unlimited, widget],
  );

  const reset = React.useCallback(() => {
    const cur = readCounts();
    if (cur[widget] == null) return;
    const next: Counts = { ...cur };
    delete next[widget];
    writeCounts(next);
    broadcast();
  }, [widget]);

  return {
    unlimited,
    used,
    budget: PREVIEW_BUDGET,
    remaining: unlimited ? PREVIEW_BUDGET : remaining,
    exceeded,
    spend,
    reset,
  };
}
