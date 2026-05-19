/**
 * Resend webhook — bounces, complaints, delivery failures.
 * Configure in Resend dashboard → Webhooks → POST /api/webhooks/resend
 *
 * Optional: RESEND_WEBHOOK_SECRET (Svix signing secret from Resend)
 */
import type { Express, Request, Response } from "express";
import express from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import { recordResendBounce, notifyWebhookSignatureFailure } from "./opsAlerts.js";

function verifySvixSignature(raw: Buffer, headers: Request["headers"], secret: string): boolean {
  const msgId = headers["svix-id"];
  const timestamp = headers["svix-timestamp"];
  const signature = headers["svix-signature"];
  if (
    typeof msgId !== "string" ||
    typeof timestamp !== "string" ||
    typeof signature !== "string"
  ) {
    return false;
  }
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;

  const signed = `${msgId}.${timestamp}.${raw.toString("utf8")}`;
  const key = secret.startsWith("whsec_") ? Buffer.from(secret.slice(6), "base64") : Buffer.from(secret);
  const expected = createHmac("sha256", key).update(signed).digest("base64");

  for (const part of signature.split(" ")) {
    const [, sig] = part.split(",", 2);
    if (!sig) continue;
    try {
      const a = Buffer.from(sig);
      const b = Buffer.from(expected);
      if (a.length === b.length && timingSafeEqual(a, b)) return true;
    } catch {
      /* continue */
    }
  }
  return false;
}

export function registerResendWebhook(app: Express): void {
  app.post(
    "/api/webhooks/resend",
    express.raw({ type: "application/json" }),
    (req: Request, res: Response) => {
      const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
      const raw = req.body as Buffer;
      if (secret && !verifySvixSignature(raw, req.headers, secret)) {
        notifyWebhookSignatureFailure("resend", "Svix signature verification failed");
        return res.status(400).json({ error: "invalid_signature" });
      }

      let payload: { type?: string; data?: Record<string, unknown> };
      try {
        payload = JSON.parse(raw.toString("utf8")) as typeof payload;
      } catch {
        return res.status(400).json({ error: "invalid_json" });
      }

      const type = payload.type ?? "";
      const data = payload.data ?? {};
      const to = typeof data.to === "string" ? data.to : "";
      const reason =
        typeof data.bounce === "object" && data.bounce && "message" in (data.bounce as object)
          ? String((data.bounce as { message?: string }).message ?? "")
          : typeof data.error === "string"
            ? data.error
            : undefined;

      if (
        type === "email.bounced" ||
        type === "email.complained" ||
        type === "email.delivery_delayed" ||
        type === "email.failed"
      ) {
        if (to) {
          recordResendBounce({ email: to, type, reason });
        }
      }

      res.json({ received: true });
    },
  );
}
