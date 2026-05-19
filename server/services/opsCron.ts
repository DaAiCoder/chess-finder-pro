/**
 * Scheduled ops jobs: trial reminders, trial expired emails, admin digest.
 */
import type { IStorage } from "../storage.js";
import {
  hasPaidSubscription,
  isAnonymousUsername,
  isComplimentaryUser,
  signupTrialEndsAt,
} from "../accessPolicy.js";
import {
  sendEmailSafe,
  sendTrialExpiredEmail,
  sendTrialExpiringEmail,
} from "./transactionalEmail.js";
import { notifyAdminDigest, notifyAdminTrialExpiredNoSubscribe } from "./opsAlerts.js";

const TRIAL_REMINDER_HOURS = Number(process.env.TRIAL_REMINDER_HOURS ?? 24);
const DIGEST_INTERVAL_MS = Number(
  process.env.OPS_DIGEST_INTERVAL_MS ?? 24 * 60 * 60 * 1000,
);
const DIGEST_WEEKLY = (process.env.OPS_DIGEST_SCHEDULE ?? "daily").toLowerCase() === "weekly";
const TRIAL_TICK_MS = Number(process.env.OPS_TRIAL_TICK_MS ?? 60 * 60 * 1000);

const MONTHLY_PRICE = Number(process.env.OPS_MRR_MONTHLY_USD ?? 12.99);
const YEARLY_PRICE = Number(process.env.OPS_MRR_YEARLY_USD ?? 79);

let trialTimer: NodeJS.Timeout | null = null;
let digestTimer: NodeJS.Timeout | null = null;
let digestAnchor = Date.now();

function prefFlag(prefs: unknown, key: string): boolean {
  if (!prefs || typeof prefs !== "object") return false;
  return !!(prefs as Record<string, unknown>)[key];
}

export function startOpsCron(storage: IStorage): void {
  if (process.env.OPS_CRON === "off") {
    console.log("[ops-cron] disabled (OPS_CRON=off)");
    return;
  }
  scheduleTrialTick(storage, 2 * 60 * 1000);
  scheduleDigest(storage, 5 * 60 * 1000);
  console.log("[ops-cron] trial + digest schedulers started");
}

function scheduleTrialTick(storage: IStorage, ms: number): void {
  if (trialTimer) clearTimeout(trialTimer);
  trialTimer = setTimeout(() => {
    void runTrialTick(storage)
      .catch((err) => console.warn(`[ops-cron] trial tick: ${(err as Error).message}`))
      .finally(() => scheduleTrialTick(storage, TRIAL_TICK_MS));
  }, ms);
  trialTimer.unref?.();
}

function scheduleDigest(storage: IStorage, ms: number): void {
  if (digestTimer) clearTimeout(digestTimer);
  digestTimer = setTimeout(() => {
    void maybeRunDigest(storage)
      .catch((err) => console.warn(`[ops-cron] digest: ${(err as Error).message}`))
      .finally(() => scheduleDigest(storage, 60 * 60 * 1000));
  }, ms);
  digestTimer.unref?.();
}

export async function runTrialTick(storage: IStorage): Promise<number> {
  const now = new Date();
  const reminderMs = TRIAL_REMINDER_HOURS * 60 * 60 * 1000;
  let sent = 0;
  const users = await storage.listMemberUsers();

  for (const u of users) {
    if (isAnonymousUsername(u.username) || isComplimentaryUser(u)) continue;
    if (hasPaidSubscription(u)) continue;

    const trialEnd = signupTrialEndsAt(u);
    const msUntil = trialEnd.getTime() - now.getTime();
    const prefs = u.preferences;

    if (msUntil > 0 && msUntil <= reminderMs && !prefFlag(prefs, "trialExpiringEmailSent")) {
      if (u.email) {
        sendEmailSafe("trial-expiring", () =>
          sendTrialExpiringEmail({
            to: u.email!,
            username: u.username,
            hoursLeft: Math.max(1, Math.round(msUntil / (60 * 60 * 1000))),
          }),
        );
      }
      await storage.updateUserPreferences(u.id, { trialExpiringEmailSent: true });
      sent += 1;
    }

    if (msUntil <= 0 && !prefFlag(prefs, "trialExpiredEmailSent")) {
      if (u.email) {
        sendEmailSafe("trial-expired", () =>
          sendTrialExpiredEmail({ to: u.email!, username: u.username }),
        );
      }
      notifyAdminTrialExpiredNoSubscribe({
        userId: u.id,
        username: u.username,
        email: u.email ?? null,
      });
      await storage.updateUserPreferences(u.id, { trialExpiredEmailSent: true });
      sent += 1;
    }
  }
  return sent;
}

async function maybeRunDigest(storage: IStorage): Promise<void> {
  const interval = DIGEST_WEEKLY ? 7 * DIGEST_INTERVAL_MS : DIGEST_INTERVAL_MS;
  if (Date.now() - digestAnchor < interval) return;
  digestAnchor = Date.now();
  await runDigest(storage, DIGEST_WEEKLY ? "Weekly" : "Daily");
}

export async function runDigest(storage: IStorage, periodLabel = "Daily"): Promise<void> {
  const now = Date.now();
  const users = await storage.listMemberUsers();
  const periodStart = now - (DIGEST_WEEKLY ? 7 : 1) * 24 * 60 * 60 * 1000;
  const reminderMs = TRIAL_REMINDER_HOURS * 60 * 60 * 1000;

  let newSignups = 0;
  let activeMonthly = 0;
  let activeYearly = 0;
  let trialing = 0;
  let pastDue = 0;
  let canceledRecently = 0;
  let trialsExpiring24h = 0;
  let trialsExpiredRecent = 0;

  for (const u of users) {
    if (isAnonymousUsername(u.username)) continue;
    const created =
      u.createdAt instanceof Date ? u.createdAt.getTime() : new Date(u.createdAt).getTime();
    if (created >= periodStart) newSignups += 1;

    const status = (u.subscriptionStatus ?? "").toLowerCase();
    if (status === "active") {
      if (u.subscriptionPlan === "yearly") activeYearly += 1;
      else activeMonthly += 1;
    } else if (status === "trialing") {
      trialing += 1;
    } else if (status === "past_due") {
      pastDue += 1;
    } else if (status === "canceled") {
      canceledRecently += 1;
    }

    if (isComplimentaryUser(u) || hasPaidSubscription(u)) continue;
    const trialEnd = signupTrialEndsAt(u);
    const msUntil = trialEnd.getTime() - now;
    if (msUntil > 0 && msUntil <= reminderMs) trialsExpiring24h += 1;
    if (msUntil <= 0 && trialEnd.getTime() >= periodStart) trialsExpiredRecent += 1;
  }

  const mrr = activeMonthly * MONTHLY_PRICE + activeYearly * (YEARLY_PRICE / 12);
  const estimatedMrr = `$${mrr.toFixed(2)} USD (est.)`;

  await notifyAdminDigest({
    periodLabel,
    newSignups,
    activeMonthly,
    activeYearly,
    estimatedMrr,
    trialing,
    pastDue,
    canceledRecently,
    trialsExpiring24h,
    trialsExpiredRecent,
  });
}
