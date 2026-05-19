/**
 * Ops alert deduplication — prevents admin email floods for recurring events.
 */
import { sendEmailSafe, notifyAdmins } from "./transactionalEmail.js";
import { EventWindow } from "./eventWindow.js";
import { wireEmailFailureAlerts } from "./emailMetrics.js";

const lastSentAt = new Map<string, number>();

export function alertAdminsOnce(args: {
  key: string;
  subject: string;
  text: string;
  tag?: string;
  cooldownMs?: number;
}): void {
  const cooldown = args.cooldownMs ?? 60 * 60 * 1000;
  const prev = lastSentAt.get(args.key) ?? 0;
  if (Date.now() - prev < cooldown) return;
  lastSentAt.set(args.key, Date.now());
  sendEmailSafe(`ops:${args.key}`, () =>
    notifyAdmins({ subject: args.subject, text: args.text, tag: args.tag }),
  );
}

wireEmailFailureAlerts(alertAdminsOnce);

/** Sliding-window counters imported from shared module. */
export { EventWindow } from "./eventWindow.js";
export { recordEmailSendFailure } from "./emailMetrics.js";

export const loginFailureWindow = new EventWindow();
export const signupIpWindow = new EventWindow();
export const server5xxWindow = new EventWindow();

function envInt(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const OPS_LOGIN_SPIKE_THRESHOLD = envInt("OPS_LOGIN_SPIKE_THRESHOLD", 25);
export const OPS_LOGIN_SPIKE_WINDOW_MS = envInt("OPS_LOGIN_SPIKE_WINDOW_MS", 15 * 60 * 1000);
export const OPS_SIGNUP_IP_THRESHOLD = envInt("OPS_SIGNUP_IP_THRESHOLD", 5);
export const OPS_SIGNUP_IP_WINDOW_MS = envInt("OPS_SIGNUP_IP_WINDOW_MS", 60 * 60 * 1000);
export const OPS_5XX_SPIKE_THRESHOLD = envInt("OPS_5XX_SPIKE_THRESHOLD", 10);
export const OPS_5XX_SPIKE_WINDOW_MS = envInt("OPS_5XX_SPIKE_WINDOW_MS", 5 * 60 * 1000);
export const OPS_EMAIL_FAILURE_THRESHOLD = envInt("OPS_EMAIL_FAILURE_THRESHOLD", 5);
export const OPS_EMAIL_FAILURE_WINDOW_MS = envInt("OPS_EMAIL_FAILURE_WINDOW_MS", 60 * 60 * 1000);

export function recordLoginFailure(ip: string): void {
  const n = loginFailureWindow.record("global", OPS_LOGIN_SPIKE_WINDOW_MS);
  loginFailureWindow.record(`ip:${ip}`, OPS_LOGIN_SPIKE_WINDOW_MS);
  if (n >= OPS_LOGIN_SPIKE_THRESHOLD) {
    alertAdminsOnce({
      key: "login-spike",
      subject: "Failed login spike detected",
      text: [
        `${n} failed login attempts in the last ${Math.round(OPS_LOGIN_SPIKE_WINDOW_MS / 60000)} minutes.`,
        `Threshold: ${OPS_LOGIN_SPIKE_THRESHOLD}`,
        `Time: ${new Date().toISOString()}`,
        "Possible credential stuffing — review logs and consider tightening rate limits.",
      ].join("\n"),
      tag: "security_login_spike",
      cooldownMs: 30 * 60 * 1000,
    });
  }
}

export function recordSignupFromIp(ip: string, username: string, userId: number): void {
  const n = signupIpWindow.record(ip, OPS_SIGNUP_IP_WINDOW_MS);
  if (n >= OPS_SIGNUP_IP_THRESHOLD) {
    alertAdminsOnce({
      key: `signup-ip:${ip}`,
      subject: `Many signups from IP ${ip}`,
      text: [
        `${n} signups from the same IP in ${Math.round(OPS_SIGNUP_IP_WINDOW_MS / 60000)} minutes.`,
        `Latest: @${username} (id ${userId})`,
        `Threshold: ${OPS_SIGNUP_IP_THRESHOLD}`,
        `Time: ${new Date().toISOString()}`,
      ].join("\n"),
      tag: "abuse_signup_ip",
      cooldownMs: 2 * 60 * 60 * 1000,
    });
  }
}

export function recordServer5xx(path: string): void {
  const n = server5xxWindow.record("global", OPS_5XX_SPIKE_WINDOW_MS);
  server5xxWindow.record(`path:${path}`, OPS_5XX_SPIKE_WINDOW_MS);
  if (n >= OPS_5XX_SPIKE_THRESHOLD) {
    alertAdminsOnce({
      key: "5xx-spike",
      subject: "Server 5xx spike",
      text: [
        `${n} server errors (5xx) in ${Math.round(OPS_5XX_SPIKE_WINDOW_MS / 60000)} minutes.`,
        `Latest path: ${path}`,
        `Threshold: ${OPS_5XX_SPIKE_THRESHOLD}`,
        `Time: ${new Date().toISOString()}`,
      ].join("\n"),
      tag: "ops_5xx_spike",
      cooldownMs: 15 * 60 * 1000,
    });
  }
}

export function recordResendBounce(args: {
  email: string;
  type: string;
  reason?: string;
}): void {
  alertAdminsOnce({
    key: `bounce:${args.email}`,
    subject: `Email bounce: ${args.email}`,
    text: [
      `Type: ${args.type}`,
      args.reason ? `Reason: ${args.reason}` : "",
      `Time: ${new Date().toISOString()}`,
    ]
      .filter(Boolean)
      .join("\n"),
    tag: "resend_bounce",
    cooldownMs: 6 * 60 * 60 * 1000,
  });
  import("./emailMetrics.js").then((m) => m.recordEmailSendFailure(args.email, `bounce:${args.type}`));
}

export function notifyWebhookSignatureFailure(source: "stripe" | "resend", detail: string): void {
  alertAdminsOnce({
    key: `webhook-sig:${source}`,
    subject: `${source} webhook signature failed`,
    text: [
      `Billing sync may be broken until this is fixed.`,
      `Detail: ${detail.slice(0, 400)}`,
      `Time: ${new Date().toISOString()}`,
    ].join("\n"),
    tag: "webhook_signature_failed",
    cooldownMs: 15 * 60 * 1000,
  });
}

export function notifyAdminContactSubmission(args: {
  name: string;
  email: string;
  topic: string;
  message: string;
  ip: string;
}): void {
  sendEmailSafe("contact-form", () =>
    notifyAdmins({
      subject: `Contact: ${args.topic} — ${args.name}`,
      text: [
        `From: ${args.name} <${args.email}>`,
        `Topic: ${args.topic}`,
        `IP: ${args.ip}`,
        "",
        args.message,
        "",
        `Time: ${new Date().toISOString()}`,
      ].join("\n"),
      tag: "contact_form",
    }),
  );
}

export function notifyAdminComplimentaryGranted(args: {
  userId: number;
  username: string;
  email: string | null;
}): void {
  sendEmailSafe("complimentary", () =>
    notifyAdmins({
      subject: `Complimentary Pro: @${args.username}`,
      text: [
        `User ID: ${args.userId}`,
        `Username: ${args.username}`,
        `Email: ${args.email ?? "(none)"}`,
        `Granted via COMPLIMENTARY_USER_IDS / COMPLIMENTARY_USERNAMES`,
        `Time: ${new Date().toISOString()}`,
      ].join("\n"),
      tag: "complimentary_pro",
    }),
  );
}

export function notifyAdminTrialExpiredNoSubscribe(args: {
  userId: number;
  username: string;
  email: string | null;
}): void {
  alertAdminsOnce({
    key: `trial-expired:${args.userId}`,
    subject: `Trial expired (no sub): @${args.username}`,
    text: [
      `User ID: ${args.userId}`,
      `Username: ${args.username}`,
      `Email: ${args.email ?? "(none)"}`,
      `Trial ended without an active subscription.`,
      `Time: ${new Date().toISOString()}`,
    ].join("\n"),
    tag: "trial_expired",
    cooldownMs: 7 * 24 * 60 * 60 * 1000,
  });
}

export function notifyAdminDispute(args: {
  event: string;
  disputeId: string;
  amount: string;
  currency: string;
  customerEmail?: string | null;
  userId?: number;
  username?: string;
}): void {
  alertAdminsOnce({
    key: `dispute:${args.disputeId}:${args.event}`,
    subject: `Stripe dispute: ${args.disputeId}`,
    text: [
      `Event: ${args.event}`,
      `Dispute: ${args.disputeId}`,
      `Amount: ${args.amount} ${args.currency}`,
      args.userId ? `User ID: ${args.userId}` : "",
      args.username ? `Username: @${args.username}` : "",
      args.customerEmail ? `Email: ${args.customerEmail}` : "",
      `Time: ${new Date().toISOString()}`,
    ]
      .filter(Boolean)
      .join("\n"),
    tag: "stripe_dispute",
    cooldownMs: 60 * 60 * 1000,
  });
}

export function notifyAdminRefund(args: {
  refundId: string;
  amount: string;
  currency: string;
  customerEmail?: string | null;
  userId?: number;
  username?: string;
}): void {
  alertAdminsOnce({
    key: `refund:${args.refundId}`,
    subject: `Stripe refund: ${args.refundId}`,
    text: [
      `Refund: ${args.refundId}`,
      `Amount: ${args.amount} ${args.currency}`,
      args.userId ? `User ID: ${args.userId}` : "",
      args.username ? `Username: @${args.username}` : "",
      args.customerEmail ? `Email: ${args.customerEmail}` : "",
      `Time: ${new Date().toISOString()}`,
    ]
      .filter(Boolean)
      .join("\n"),
    tag: "stripe_refund",
    cooldownMs: 24 * 60 * 60 * 1000,
  });
}

export async function notifyAdminDigest(stats: {
  periodLabel: string;
  newSignups: number;
  activeMonthly: number;
  activeYearly: number;
  estimatedMrr: string;
  trialing: number;
  pastDue: number;
  canceledRecently: number;
  trialsExpiring24h: number;
  trialsExpiredRecent: number;
}): Promise<void> {
  await notifyAdmins({
    subject: `${stats.periodLabel} digest`,
    text: [
      `Period: ${stats.periodLabel}`,
      "",
      `New signups: ${stats.newSignups}`,
      `Active monthly subs: ${stats.activeMonthly}`,
      `Active yearly subs: ${stats.activeYearly}`,
      `Estimated MRR: ${stats.estimatedMrr}`,
      `Trialing (Stripe): ${stats.trialing}`,
      `Past due: ${stats.pastDue}`,
      `Canceled (recent): ${stats.canceledRecently}`,
      "",
      `Trials expiring in 24h: ${stats.trialsExpiring24h}`,
      `Trials expired (no sub, recent): ${stats.trialsExpiredRecent}`,
      "",
      `Generated: ${new Date().toISOString()}`,
    ].join("\n"),
    tag: "ops_digest",
  });
}
