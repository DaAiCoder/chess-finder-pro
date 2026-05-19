/**
 * Transactional email via Resend (magic links, auth, billing, admin alerts).
 *
 * Env:
 *   RESEND_API_KEY       — required to send (otherwise logs to stdout)
 *   RESEND_FROM          — verified sender, e.g. Chess Finder Pro <noreply@mail.chessgm.co>
 *   ADMIN_NOTIFY_EMAILS  — comma-separated admin inboxes for ops alerts
 *   APP_PUBLIC_ORIGIN    — used in template footers / links when building offline
 *   APP_NAME             — optional display name (default Chess Finder Pro)
 */
const RESEND_API = "https://api.resend.com/emails";

import { recordEmailSendFailure } from "./emailMetrics.js";

export type EmailSendMode = "resend" | "log";

export interface SendEmailArgs {
  to: string | string[];
  subject: string;
  text: string;
  html: string;
  tags?: { name: string; value: string }[];
}

function appName(): string {
  return process.env.APP_NAME?.trim() || "Chess Finder Pro";
}

function fromAddress(): string {
  return process.env.RESEND_FROM?.trim() || `${appName()} <onboarding@resend.dev>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function siteOrigin(): string {
  return process.env.APP_PUBLIC_ORIGIN?.trim().replace(/\/$/, "") || "https://chessgm.co";
}

function emailLayout(args: {
  title: string;
  bodyHtml: string;
  ctaHref?: string;
  ctaLabel?: string;
}): string {
  const btn =
    args.ctaHref && args.ctaLabel
      ? `<p style="margin:24px 0"><a href="${escapeHtml(args.ctaHref)}" style="display:inline-block;background:#769656;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">${escapeHtml(args.ctaLabel)}</a></p>`
      : "";
  return `<!DOCTYPE html><html><body style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5;color:#111;max-width:560px;margin:0 auto;padding:24px">
<h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(args.title)}</h1>
${args.bodyHtml}
${btn}
<p style="color:#666;font-size:12px;margin-top:32px;border-top:1px solid #eee;padding-top:16px">
  ${escapeHtml(appName())} · <a href="${escapeHtml(siteOrigin())}">${escapeHtml(siteOrigin())}</a><br/>
  If you did not request this, you can ignore this email.
</p>
</body></html>`;
}

export async function sendTransactionalEmail(
  args: SendEmailArgs,
): Promise<{ ok: boolean; mode: EmailSendMode }> {
  const key = process.env.RESEND_API_KEY?.trim();
  const recipients = (Array.isArray(args.to) ? args.to : [args.to]).filter(Boolean);
  if (!recipients.length) return { ok: true, mode: "log" };

  if (key) {
    const res = await fetch(RESEND_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: recipients,
        subject: args.subject,
        text: args.text,
        html: args.html,
        tags: args.tags,
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      const err = new Error(`Resend ${res.status}: ${errText.slice(0, 500)}`);
      recordEmailSendFailure(recipients.join(","), err.message);
      throw err;
    }
    return { ok: true, mode: "resend" };
  }

  console.log(
    `[email] (no RESEND_API_KEY) to=${recipients.join(",")} subject=${args.subject}\n${args.text}`,
  );
  return { ok: true, mode: "log" };
}

export function adminNotifyEmails(): string[] {
  const raw = process.env.ADMIN_NOTIFY_EMAILS?.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.includes("@"));
}

export async function notifyAdmins(args: {
  subject: string;
  text: string;
  html?: string;
  tag?: string;
}): Promise<void> {
  const admins = adminNotifyEmails();
  if (!admins.length) return;
  const subject = `[${appName()} Admin] ${args.subject}`;
  const html =
    args.html ??
    emailLayout({
      title: args.subject,
      bodyHtml: `<p>${escapeHtml(args.text).replace(/\n/g, "<br/>")}</p>`,
    });
  await sendTransactionalEmail({
    to: admins,
    subject,
    text: args.text,
    html,
    tags: args.tag ? [{ name: "event", value: args.tag }] : undefined,
  });
}

/** Fire-and-forget helper — never throws to callers. */
export function sendEmailSafe(label: string, fn: () => Promise<void>): void {
  void fn().catch((err) => {
    console.warn(`[email] ${label}: ${(err as Error).message}`);
  });
}

/* ---------------------------------------------------------------------- */
/* User-facing templates                                                   */
/* ---------------------------------------------------------------------- */

export async function sendWelcomeEmail(args: {
  to: string;
  username: string;
  method: "email" | "magic_link" | "lichess";
}): Promise<void> {
  const origin = siteOrigin();
  const methodLabel =
    args.method === "lichess"
      ? "Lichess"
      : args.method === "magic_link"
        ? "email magic link"
        : "email and password";
  const text = `Welcome to ${appName()}!\n\nYour account (@${args.username}) is ready. You signed up via ${methodLabel}.\n\nOpen the app: ${origin}/analysis\n\nYour 3-day Pro trial starts now.`;
  const html = emailLayout({
    title: `Welcome to ${appName()}`,
    bodyHtml: `<p>Your account <strong>@${escapeHtml(args.username)}</strong> is ready.</p>
<p>You signed up via ${escapeHtml(methodLabel)}. Your <strong>3-day Pro trial</strong> starts now.</p>`,
    ctaHref: `${origin}/analysis`,
    ctaLabel: "Start training",
  });
  await sendTransactionalEmail({
    to: args.to,
    subject: `Welcome to ${appName()}`,
    text,
    html,
    tags: [{ name: "category", value: "welcome" }],
  });
}

export async function sendMagicLinkEmail(args: {
  to: string;
  magicUrl: string;
}): Promise<void> {
  const text = `Sign in to ${appName()} (expires in 15 minutes):\n\n${args.magicUrl}`;
  const html = emailLayout({
    title: "Sign in",
    bodyHtml: `<p>Click below to sign in. This link expires in <strong>15 minutes</strong> and works once.</p>`,
    ctaHref: args.magicUrl,
    ctaLabel: "Sign in",
  });
  await sendTransactionalEmail({
    to: args.to,
    subject: `Sign in to ${appName()}`,
    text,
    html,
    tags: [{ name: "category", value: "magic_link" }],
  });
}

export async function sendPasswordResetEmail(args: {
  to: string;
  resetUrl: string;
}): Promise<void> {
  const text = `Reset your ${appName()} password (expires in 1 hour):\n\n${args.resetUrl}`;
  const html = emailLayout({
    title: "Reset your password",
    bodyHtml: `<p>We received a request to reset your password. This link expires in <strong>1 hour</strong>.</p>`,
    ctaHref: args.resetUrl,
    ctaLabel: "Reset password",
  });
  await sendTransactionalEmail({
    to: args.to,
    subject: `Reset your ${appName()} password`,
    text,
    html,
    tags: [{ name: "category", value: "password_reset" }],
  });
}

export async function sendPasswordChangedEmail(args: { to: string }): Promise<void> {
  const origin = siteOrigin();
  const text = `Your ${appName()} password was changed.\n\nIf this wasn't you, reset your password immediately: ${origin}/login\n\nAccount: ${origin}/account`;
  const html = emailLayout({
    title: "Password changed",
    bodyHtml: `<p>Your password was just changed. If this wasn't you, use <strong>Forgot password</strong> on the sign-in page right away.</p>`,
    ctaHref: `${origin}/account`,
    ctaLabel: "Account settings",
  });
  await sendTransactionalEmail({
    to: args.to,
    subject: `Your ${appName()} password was changed`,
    text,
    html,
    tags: [{ name: "category", value: "password_changed" }],
  });
}

export async function sendEmailChangeVerifyEmail(args: {
  to: string;
  verifyUrl: string;
  newEmail: string;
}): Promise<void> {
  const text = `Confirm your new email for ${appName()}:\n\n${args.verifyUrl}\n\nNew address: ${args.newEmail}\n\nExpires in 24 hours.`;
  const html = emailLayout({
    title: "Confirm new email",
    bodyHtml: `<p>Confirm changing your email to <strong>${escapeHtml(args.newEmail)}</strong>. Link expires in <strong>24 hours</strong>.</p>`,
    ctaHref: args.verifyUrl,
    ctaLabel: "Confirm email",
  });
  await sendTransactionalEmail({
    to: args.to,
    subject: `Confirm your new email — ${appName()}`,
    text,
    html,
    tags: [{ name: "category", value: "email_change_verify" }],
  });
}

export async function sendEmailChangedNotice(args: {
  to: string;
  oldEmail: string;
  newEmail: string;
}): Promise<void> {
  const origin = siteOrigin();
  const text = `Your ${appName()} email was changed from ${args.oldEmail} to ${args.newEmail}.\n\nIf this wasn't you, contact support: ${origin}/legal/contact`;
  const html = emailLayout({
    title: "Email address updated",
    bodyHtml: `<p>Your sign-in email was changed from <strong>${escapeHtml(args.oldEmail)}</strong> to <strong>${escapeHtml(args.newEmail)}</strong>.</p>
<p>If you didn't make this change, contact us immediately.</p>`,
    ctaHref: `${origin}/legal/contact`,
    ctaLabel: "Contact support",
  });
  await sendTransactionalEmail({
    to: args.to,
    subject: `Your ${appName()} email was updated`,
    text,
    html,
    tags: [{ name: "category", value: "email_changed" }],
  });
}

export async function sendSubscriptionWelcomeEmail(args: {
  to: string;
  plan: "monthly" | "yearly";
  periodEnd?: string | null;
}): Promise<void> {
  const origin = siteOrigin();
  const planLabel = args.plan === "yearly" ? "Yearly Pro" : "Monthly Pro";
  const renew = args.periodEnd ? `\nCurrent period ends: ${args.periodEnd}` : "";
  const text = `Thanks for subscribing to ${planLabel} on ${appName()}!${renew}\n\nManage billing: ${origin}/account/billing`;
  const html = emailLayout({
    title: "You're Pro!",
    bodyHtml: `<p>Thanks for subscribing to <strong>${escapeHtml(planLabel)}</strong>. You now have unlimited training and full Pro features.</p>
${args.periodEnd ? `<p style="color:#666;font-size:14px">Current period ends: ${escapeHtml(args.periodEnd)}</p>` : ""}
<p>Stripe may also send a payment receipt to this inbox.</p>`,
    ctaHref: `${origin}/account/billing`,
    ctaLabel: "Manage billing",
  });
  await sendTransactionalEmail({
    to: args.to,
    subject: `Welcome to ${appName()} Pro`,
    text,
    html,
    tags: [{ name: "category", value: "subscription_welcome" }],
  });
}

export async function sendSubscriptionCanceledEmail(args: {
  to: string;
  plan: string | null;
  atPeriodEnd: boolean;
  periodEnd?: string | null;
}): Promise<void> {
  const origin = siteOrigin();
  const when = args.atPeriodEnd
    ? `Your Pro access continues until ${args.periodEnd ?? "the end of your billing period"}.`
    : "Your Pro subscription has ended.";
  const text = `${when}\n\nResubscribe anytime: ${origin}/pricing`;
  const html = emailLayout({
    title: args.atPeriodEnd ? "Cancellation scheduled" : "Subscription ended",
    bodyHtml: `<p>${escapeHtml(when)}</p>
<p>You can resubscribe anytime to restore unlimited training.</p>`,
    ctaHref: `${origin}/pricing`,
    ctaLabel: "View pricing",
  });
  await sendTransactionalEmail({
    to: args.to,
    subject: args.atPeriodEnd
      ? `${appName()} — cancellation scheduled`
      : `${appName()} — subscription ended`,
    text,
    html,
    tags: [{ name: "category", value: "subscription_canceled" }],
  });
}

export async function sendPaymentFailedEmail(args: { to: string }): Promise<void> {
  const origin = siteOrigin();
  const text = `We couldn't process your latest ${appName()} payment.\n\nUpdate your card: ${origin}/account/billing`;
  const html = emailLayout({
    title: "Payment failed",
    bodyHtml: `<p>We couldn't process your latest subscription payment. Update your payment method to keep Pro access.</p>`,
    ctaHref: `${origin}/account/billing`,
    ctaLabel: "Update payment method",
  });
  await sendTransactionalEmail({
    to: args.to,
    subject: `Action needed — ${appName()} payment failed`,
    text,
    html,
    tags: [{ name: "category", value: "payment_failed" }],
  });
}

export async function sendTrialExpiringEmail(args: {
  to: string;
  username: string;
  hoursLeft: number;
}): Promise<void> {
  const origin = siteOrigin();
  const text = `Your ${appName()} Pro trial ends in about ${args.hoursLeft} hours (@${args.username}).\n\nSubscribe to keep unlimited training: ${origin}/pricing`;
  const html = emailLayout({
    title: "Your Pro trial is ending soon",
    bodyHtml: `<p>Hi <strong>@${escapeHtml(args.username)}</strong>, your <strong>3-day Pro trial</strong> ends in about <strong>${args.hoursLeft} hours</strong>.</p>
<p>Subscribe to keep unlimited training and Pro features.</p>`,
    ctaHref: `${origin}/pricing`,
    ctaLabel: "View pricing",
  });
  await sendTransactionalEmail({
    to: args.to,
    subject: `${appName()} — trial ending soon`,
    text,
    html,
    tags: [{ name: "category", value: "trial_expiring" }],
  });
}

export async function sendTrialExpiredEmail(args: {
  to: string;
  username: string;
}): Promise<void> {
  const origin = siteOrigin();
  const text = `Your ${appName()} Pro trial has ended (@${args.username}). Subscribe to restore unlimited training: ${origin}/pricing`;
  const html = emailLayout({
    title: "Your trial has ended",
    bodyHtml: `<p>Hi <strong>@${escapeHtml(args.username)}</strong>, your free Pro trial has ended.</p>
<p>Subscribe monthly or yearly to unlock unlimited training again.</p>`,
    ctaHref: `${origin}/pricing`,
    ctaLabel: "Subscribe",
  });
  await sendTransactionalEmail({
    to: args.to,
    subject: `${appName()} — trial ended`,
    text,
    html,
    tags: [{ name: "category", value: "trial_expired" }],
  });
}

/* ---------------------------------------------------------------------- */
/* Admin alerts                                                            */
/* ---------------------------------------------------------------------- */

export async function notifyAdminUserSignup(args: {
  userId: number;
  username: string;
  email: string | null;
  method: "email" | "magic_link" | "lichess";
  ip?: string;
}): Promise<void> {
  await notifyAdmins({
    subject: `New signup: @${args.username}`,
    text: [
      `User ID: ${args.userId}`,
      `Username: ${args.username}`,
      `Email: ${args.email ?? "(none)"}`,
      `Method: ${args.method}`,
      args.ip ? `IP: ${args.ip}` : "",
      `Time: ${new Date().toISOString()}`,
    ]
      .filter(Boolean)
      .join("\n"),
    tag: "user_signup",
  });
}

export async function notifyAdminSubscription(args: {
  event: "subscribed" | "canceled" | "cancel_scheduled" | "payment_failed" | "renewed";
  userId: number;
  username: string;
  email: string | null;
  plan: string | null;
  status: string;
  periodEnd?: string | null;
}): Promise<void> {
  const labels: Record<typeof args.event, string> = {
    subscribed: "New subscription",
    canceled: "Subscription canceled",
    cancel_scheduled: "Cancel at period end",
    payment_failed: "Payment failed",
    renewed: "Subscription renewed",
  };
  await notifyAdmins({
    subject: `${labels[args.event]} — @${args.username}`,
    text: [
      `Event: ${args.event}`,
      `User ID: ${args.userId}`,
      `Username: ${args.username}`,
      `Email: ${args.email ?? "(none)"}`,
      `Plan: ${args.plan ?? "—"}`,
      `Status: ${args.status}`,
      args.periodEnd ? `Period end: ${args.periodEnd}` : "",
      `Time: ${new Date().toISOString()}`,
    ]
      .filter(Boolean)
      .join("\n"),
    tag: `billing_${args.event}`,
  });
}
