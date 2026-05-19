/** Email delivery metrics (no dependency on transactionalEmail). */
import { EventWindow } from "./eventWindow.js";

export const emailFailureWindow = new EventWindow();

function envInt(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const OPS_EMAIL_FAILURE_THRESHOLD = envInt("OPS_EMAIL_FAILURE_THRESHOLD", 5);
const OPS_EMAIL_FAILURE_WINDOW_MS = envInt("OPS_EMAIL_FAILURE_WINDOW_MS", 60 * 60 * 1000);

type AlertFn = (args: {
  key: string;
  subject: string;
  text: string;
  tag?: string;
  cooldownMs?: number;
}) => void;

let alertOnce: AlertFn | null = null;

/** Wired from opsAlerts at boot to avoid import cycles. */
export function wireEmailFailureAlerts(fn: AlertFn): void {
  alertOnce = fn;
}

export function recordEmailSendFailure(to: string, error: string): void {
  const n = emailFailureWindow.record("global", OPS_EMAIL_FAILURE_WINDOW_MS);
  if (n >= OPS_EMAIL_FAILURE_THRESHOLD && alertOnce) {
    alertOnce({
      key: "email-failure-rate",
      subject: "High transactional email failure rate",
      text: [
        `${n} email send failures in the last hour.`,
        `Latest: to=${to}`,
        `Error: ${error.slice(0, 300)}`,
        `Threshold: ${OPS_EMAIL_FAILURE_THRESHOLD}`,
        "Check Resend dashboard, domain DNS, and RESEND_FROM.",
      ].join("\n"),
      tag: "ops_email_failures",
      cooldownMs: 60 * 60 * 1000,
    });
  }
}
