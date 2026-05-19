/**
 * Stripe subscription billing.
 *
 *   POST /api/billing/checkout-session  — signed-in user kicks off Checkout
 *   POST /api/billing/portal            — signed-in user opens Customer Portal
 *   GET  /api/billing/subscription      — current user's subscription status
 *   POST /api/billing/webhook           — Stripe → us; **raw body** required
 *
 * Stripe webhook events used (add in Dashboard → Webhooks):
 *   checkout.session.completed, customer.subscription.*, invoice.payment_*,
 *   charge.dispute.*, charge.refunded, refund.created
 *
 * Configuration (env vars):
 *   STRIPE_SECRET_KEY           sk_live_… or sk_test_…
 *   STRIPE_WEBHOOK_SECRET       whsec_…  (from the Stripe Dashboard webhook page)
 *   STRIPE_PRICE_MONTHLY_ID     price_… for the $12.99/mo plan
 *   STRIPE_PRICE_YEARLY_ID     price_… for the $79/yr plan
 *   APP_PUBLIC_ORIGIN           https://yourdomain.com  (or inferred from req)
 *
 * If STRIPE_SECRET_KEY is unset, every endpoint returns 503 with
 * `billing_disabled` so the rest of the app still boots in dev.
 */

import type { Express, Request, Response } from "express";
import express from "express";
import Stripe from "stripe";
import { z } from "zod";
import { storage } from "../storage.js";
import { requireSignedIn, getUserId } from "../auth.js";
import {
  sendEmailSafe,
  sendPaymentFailedEmail,
  sendSubscriptionCanceledEmail,
  sendSubscriptionWelcomeEmail,
  notifyAdminSubscription,
} from "./transactionalEmail.js";
import { notifyAdminDispute, notifyAdminRefund, notifyWebhookSignatureFailure } from "./opsAlerts.js";

type Plan = "monthly" | "yearly";

let stripeClient: Stripe | null = null;
function stripe(): Stripe {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("billing_disabled");
    // Pin a stable API version — see https://stripe.com/docs/api/versioning.
    // The SDK ships a literal type for its latest version that moves on each
    // release. We pin to a known-good string and cast the options so a
    // dependency bump doesn't break the build.
    type StripeOpts = ConstructorParameters<typeof Stripe>[1];
    const opts: StripeOpts = {
      apiVersion: "2024-06-20" as NonNullable<StripeOpts>["apiVersion"],
      typescript: true,
      appInfo: { name: "ChessFinderPro" },
    };
    stripeClient = new Stripe(key, opts);
  }
  return stripeClient;
}

function isBillingEnabled(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

function priceIdFor(plan: Plan): string | undefined {
  return plan === "monthly"
    ? process.env.STRIPE_PRICE_MONTHLY_ID
    : process.env.STRIPE_PRICE_YEARLY_ID;
}

function originFor(req: Request): string {
  const fromEnv = process.env.APP_PUBLIC_ORIGIN?.trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  const xfProto = (req.headers["x-forwarded-proto"] as string)?.split(",")[0]?.trim();
  const proto = xfProto || req.protocol || "http";
  const host = req.get("host") || "localhost:5000";
  return `${proto}://${host}`;
}

function planFromPriceId(priceId: string | undefined): Plan | null {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_PRICE_MONTHLY_ID) return "monthly";
  if (priceId === process.env.STRIPE_PRICE_YEARLY_ID) return "yearly";
  return null;
}

function statusFromStripe(
  status: Stripe.Subscription.Status | string | null | undefined,
): string {
  // Pass through whatever Stripe says — the client can format it.
  return (status ?? "none").toString();
}

function formatPeriodEnd(d: Date | null | undefined): string | null {
  if (!d) return null;
  try {
    return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return d.toISOString();
  }
}

function userEmailForBilling(user: { email?: string | null }): string | null {
  const e = user.email?.trim();
  return e && e.includes("@") ? e : null;
}

async function sendBillingEmails(args: {
  user: { id: number; username: string; email?: string | null };
  event: "subscribed" | "canceled" | "cancel_scheduled" | "payment_failed" | "renewed";
  plan: string | null;
  status: string;
  periodEnd?: Date | null;
  atPeriodEnd?: boolean;
}): Promise<void> {
  const periodLabel = formatPeriodEnd(args.periodEnd);
  const to = userEmailForBilling(args.user);
  if (to) {
    if (args.event === "subscribed" && (args.plan === "monthly" || args.plan === "yearly")) {
      sendEmailSafe("subscription-welcome", () =>
        sendSubscriptionWelcomeEmail({
          to,
          plan: args.plan as "monthly" | "yearly",
          periodEnd: periodLabel,
        }),
      );
    } else if (args.event === "cancel_scheduled" || args.event === "canceled") {
      sendEmailSafe("subscription-canceled", () =>
        sendSubscriptionCanceledEmail({
          to,
          plan: args.plan,
          atPeriodEnd: args.event === "cancel_scheduled",
          periodEnd: periodLabel,
        }),
      );
    } else if (args.event === "payment_failed") {
      sendEmailSafe("payment-failed", () => sendPaymentFailedEmail({ to }));
    }
  }
  sendEmailSafe("admin-billing", () =>
    notifyAdminSubscription({
      event: args.event,
      userId: args.user.id,
      username: args.user.username,
      email: args.user.email ?? null,
      plan: args.plan,
      status: args.status,
      periodEnd: periodLabel,
    }),
  );
}

/* ---------------------------------------------------------------------- */
/* Public route registration                                               */
/* ---------------------------------------------------------------------- */

/**
 * Register the **webhook route only**. Must be called BEFORE `express.json()`
 * in `server/index.ts` because the signature check needs the raw request body.
 */
export function registerBillingWebhook(app: Express): void {
  app.post(
    "/api/billing/webhook",
    express.raw({ type: "application/json" }),
    async (req: Request, res: Response) => {
      if (!isBillingEnabled()) return res.status(503).json({ error: "billing_disabled" });
      const secret = process.env.STRIPE_WEBHOOK_SECRET;
      if (!secret) return res.status(500).json({ error: "webhook_secret_missing" });
      const sig = req.headers["stripe-signature"];
      if (!sig || typeof sig !== "string") {
        return res.status(400).json({ error: "missing_signature" });
      }
      let event: Stripe.Event;
      try {
        event = stripe().webhooks.constructEvent(req.body as Buffer, sig, secret);
      } catch (err) {
        console.warn(`[billing] webhook signature failed: ${(err as Error).message}`);
        notifyWebhookSignatureFailure("stripe", (err as Error).message);
        return res.status(400).json({ error: "invalid_signature" });
      }
      try {
        await handleWebhookEvent(event);
        res.json({ received: true });
      } catch (err) {
        console.warn(`[billing] webhook handler error: ${(err as Error).message}`);
        // Return 200 anyway — Stripe retries 5xx. We accept the event, and our
        // next /api/billing/subscription refresh will reconcile if needed.
        res.json({ received: true, soft_error: (err as Error).message });
      }
    },
  );
}

/**
 * Register the JSON-body billing routes (checkout, portal, subscription
 * status). Call this AFTER `express.json()` in `server/index.ts`.
 */
export function registerBillingRoutes(app: Express): void {
  app.get("/api/billing/subscription", async (req: Request, res: Response) => {
    try {
      const uid = await getUserId(req);
      const u = await storage.getUser(uid);
      if (!u) return res.json({ status: "none" });
      res.json({
        status: u.subscriptionStatus ?? "none",
        plan: u.subscriptionPlan ?? null,
        currentPeriodEnd: u.subscriptionCurrentPeriodEnd
          ? u.subscriptionCurrentPeriodEnd.toISOString()
          : null,
        cancelAtPeriodEnd: !!u.subscriptionCancelAtPeriodEnd,
        active: ["active", "trialing"].includes(u.subscriptionStatus ?? ""),
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post("/api/billing/checkout-session", requireSignedIn, async (req: Request, res: Response) => {
    if (!isBillingEnabled()) return res.status(503).json({ error: "billing_disabled" });
    const parsed = z
      .object({ plan: z.enum(["monthly", "yearly"]) })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_plan" });

    const plan = parsed.data.plan;
    const priceId = priceIdFor(plan);
    if (!priceId) return res.status(503).json({ error: "price_not_configured", plan });

    try {
      const uid = await getUserId(req);
      const user = await storage.getUser(uid);
      if (!user) return res.status(404).json({ error: "user_not_found" });
      if (user.username.startsWith("anon-")) {
        return res.status(400).json({ error: "auth_required" });
      }

      const origin = originFor(req);

      // Reuse existing Stripe customer when we have one (so the user has a
      // single billing history). Fall back to creating one inline via the
      // Checkout Session when missing — we'll capture the customer id on
      // `checkout.session.completed`.
      const customerId = user.stripeCustomerId ?? undefined;

      const session = await stripe().checkout.sessions.create({
        mode: "subscription",
        client_reference_id: String(user.id),
        customer: customerId,
        customer_email: customerId ? undefined : user.email ?? undefined,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${origin}/thanks?cs={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/pricing?canceled=1`,
        allow_promotion_codes: true,
        billing_address_collection: "auto",
        subscription_data: {
          metadata: { app_user_id: String(user.id), app_plan: plan },
        },
        metadata: { app_user_id: String(user.id), app_plan: plan },
      });

      res.json({ url: session.url });
    } catch (err) {
      console.warn(`[billing] checkout error: ${(err as Error).message}`);
      res.status(500).json({ error: "checkout_failed" });
    }
  });

  app.post("/api/billing/portal", requireSignedIn, async (req: Request, res: Response) => {
    if (!isBillingEnabled()) return res.status(503).json({ error: "billing_disabled" });
    try {
      const uid = await getUserId(req);
      const user = await storage.getUser(uid);
      if (!user) return res.status(404).json({ error: "user_not_found" });
      if (!user.stripeCustomerId) {
        return res.status(400).json({ error: "no_customer" });
      }
      const session = await stripe().billingPortal.sessions.create({
        customer: user.stripeCustomerId,
        return_url: `${originFor(req)}/account/billing`,
      });
      res.json({ url: session.url });
    } catch (err) {
      console.warn(`[billing] portal error: ${(err as Error).message}`);
      res.status(500).json({ error: "portal_failed" });
    }
  });
}

/* ---------------------------------------------------------------------- */
/* Webhook event handling                                                  */
/* ---------------------------------------------------------------------- */

async function handleWebhookEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const sess = event.data.object as Stripe.Checkout.Session;
      const uidStr = (sess.client_reference_id ?? sess.metadata?.app_user_id) ?? null;
      const userId = uidStr ? Number(uidStr) : NaN;
      if (!Number.isFinite(userId)) {
        console.warn("[billing] webhook missing app_user_id on checkout session");
        return;
      }
      const customerId =
        typeof sess.customer === "string" ? sess.customer : sess.customer?.id ?? null;
      const subscriptionId =
        typeof sess.subscription === "string"
          ? sess.subscription
          : sess.subscription?.id ?? null;

      // Pull the live subscription so we have plan + period_end.
      let plan: Plan | null = null;
      let periodEnd: Date | null = null;
      let status = "active";
      let cancelAtPeriodEnd = false;
      if (subscriptionId) {
        const sub = await stripe().subscriptions.retrieve(subscriptionId);
        plan = planFromPriceId(sub.items.data[0]?.price.id);
        const cpEnd = (sub as unknown as { current_period_end?: number }).current_period_end;
        if (typeof cpEnd === "number") periodEnd = new Date(cpEnd * 1000);
        status = statusFromStripe(sub.status);
        cancelAtPeriodEnd = !!sub.cancel_at_period_end;
      }

      await storage.updateUserSubscription(userId, {
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        subscriptionStatus: status,
        subscriptionPlan: plan,
        subscriptionCurrentPeriodEnd: periodEnd,
        subscriptionCancelAtPeriodEnd: cancelAtPeriodEnd,
      });
      const user = await storage.getUser(userId);
      if (user && plan) {
        await sendBillingEmails({
          user,
          event: "subscribed",
          plan,
          status,
          periodEnd,
        });
      }
      return;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
      const user = await storage.getUserByStripeCustomerId(customerId);
      if (!user) {
        console.warn(`[billing] subscription event for unknown customer ${customerId}`);
        return;
      }
      const wasCancelScheduled = !!user.subscriptionCancelAtPeriodEnd;
      const isDeleted = event.type === "customer.subscription.deleted";
      const plan = planFromPriceId(sub.items.data[0]?.price.id);
      const cpEnd = (sub as unknown as { current_period_end?: number }).current_period_end;
      const periodEnd = typeof cpEnd === "number" ? new Date(cpEnd * 1000) : null;
      const cancelAtPeriodEnd = !!sub.cancel_at_period_end;
      await storage.updateUserSubscription(user.id, {
        stripeSubscriptionId: isDeleted ? null : sub.id,
        subscriptionStatus: isDeleted ? "canceled" : statusFromStripe(sub.status),
        subscriptionPlan: isDeleted ? null : plan,
        subscriptionCurrentPeriodEnd: periodEnd,
        subscriptionCancelAtPeriodEnd: cancelAtPeriodEnd,
      });
      if (isDeleted) {
        await sendBillingEmails({
          user,
          event: "canceled",
          plan: user.subscriptionPlan ?? plan,
          status: "canceled",
          periodEnd,
        });
      } else if (cancelAtPeriodEnd && !wasCancelScheduled) {
        await sendBillingEmails({
          user,
          event: "cancel_scheduled",
          plan: plan ?? user.subscriptionPlan,
          status: statusFromStripe(sub.status),
          periodEnd,
          atPeriodEnd: true,
        });
      }
      return;
    }

    case "invoice.payment_failed": {
      const inv = event.data.object as Stripe.Invoice;
      const customerId = typeof inv.customer === "string" ? inv.customer : inv.customer?.id;
      if (!customerId) return;
      const user = await storage.getUserByStripeCustomerId(customerId);
      if (!user) return;
      await storage.updateUserSubscription(user.id, {
        subscriptionStatus: "past_due",
      });
      await sendBillingEmails({
        user,
        event: "payment_failed",
        plan: user.subscriptionPlan,
        status: "past_due",
        periodEnd: user.subscriptionCurrentPeriodEnd,
      });
      return;
    }

    case "invoice.payment_succeeded": {
      // Renewals — refresh period end from the subscription record.
      const inv = event.data.object as Stripe.Invoice;
      const subRef = (inv as unknown as { subscription?: string | { id: string } }).subscription;
      const subscriptionId =
        typeof subRef === "string" ? subRef : subRef?.id ?? null;
      if (!subscriptionId) return;
      const customerId = typeof inv.customer === "string" ? inv.customer : inv.customer?.id;
      if (!customerId) return;
      const user = await storage.getUserByStripeCustomerId(customerId);
      if (!user) return;
      const sub = await stripe().subscriptions.retrieve(subscriptionId);
      const cpEnd = (sub as unknown as { current_period_end?: number }).current_period_end;
      const periodEnd = typeof cpEnd === "number" ? new Date(cpEnd * 1000) : null;
      const plan = planFromPriceId(sub.items.data[0]?.price.id);
      const isRenewal =
        inv.billing_reason === "subscription_cycle" ||
        inv.billing_reason === "subscription_update";
      await storage.updateUserSubscription(user.id, {
        subscriptionStatus: statusFromStripe(sub.status),
        subscriptionCurrentPeriodEnd: periodEnd,
        subscriptionCancelAtPeriodEnd: !!sub.cancel_at_period_end,
        subscriptionPlan: plan,
      });
      if (isRenewal && inv.amount_paid > 0) {
        await sendBillingEmails({
          user,
          event: "renewed",
          plan: plan ?? user.subscriptionPlan,
          status: statusFromStripe(sub.status),
          periodEnd,
        });
      }
      return;
    }

    case "charge.dispute.created":
    case "charge.dispute.updated":
    case "charge.dispute.closed": {
      const dispute = event.data.object as Stripe.Dispute;
      const chargeRef = dispute.charge;
      const chargeId = typeof chargeRef === "string" ? chargeRef : chargeRef?.id ?? null;
      let user: Awaited<ReturnType<typeof storage.getUserByStripeCustomerId>> | undefined;
      let customerEmail: string | null = null;
      if (chargeId) {
        const charge = await stripe().charges.retrieve(chargeId);
        customerEmail = charge.billing_details?.email ?? null;
        const customerId =
          typeof charge.customer === "string" ? charge.customer : charge.customer?.id ?? null;
        if (customerId) user = await storage.getUserByStripeCustomerId(customerId);
      }
      notifyAdminDispute({
        event: event.type,
        disputeId: dispute.id,
        amount: (dispute.amount / 100).toFixed(2),
        currency: (dispute.currency ?? "usd").toUpperCase(),
        customerEmail,
        userId: user?.id,
        username: user?.username,
      });
      return;
    }

    case "charge.refunded":
    case "refund.created": {
      if (event.type === "refund.created") {
        const refund = event.data.object as Stripe.Refund;
        if (refund.status && refund.status !== "succeeded" && refund.status !== "pending") {
          return;
        }
        const chargeId =
          typeof refund.charge === "string" ? refund.charge : refund.charge?.id ?? null;
        let user: Awaited<ReturnType<typeof storage.getUserByStripeCustomerId>> | undefined;
        if (chargeId) {
          const charge = await stripe().charges.retrieve(chargeId);
          const customerId =
            typeof charge.customer === "string" ? charge.customer : charge.customer?.id ?? null;
          if (customerId) user = await storage.getUserByStripeCustomerId(customerId);
        }
        notifyAdminRefund({
          refundId: refund.id,
          amount: (refund.amount / 100).toFixed(2),
          currency: (refund.currency ?? "usd").toUpperCase(),
          customerEmail: user?.email ?? null,
          userId: user?.id,
          username: user?.username,
        });
        return;
      }
      const charge = event.data.object as Stripe.Charge;
      const customerId =
        typeof charge.customer === "string" ? charge.customer : charge.customer?.id ?? null;
      const user = customerId ? await storage.getUserByStripeCustomerId(customerId) : undefined;
      const refund = charge.refunds?.data?.[0];
      notifyAdminRefund({
        refundId: refund?.id ?? charge.id,
        amount: ((refund?.amount ?? charge.amount_refunded) / 100).toFixed(2),
        currency: (charge.currency ?? "usd").toUpperCase(),
        customerEmail: charge.billing_details?.email ?? user?.email ?? null,
        userId: user?.id,
        username: user?.username,
      });
      return;
    }

    default:
      // Quietly ignore other event types.
      return;
  }
}
