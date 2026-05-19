/**
 * Public contact form → admin notification.
 */
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { notifyAdminContactSubmission } from "./opsAlerts.js";

const hitsByIp = new Map<string, number[]>();
const LIMIT = 5;
const WINDOW_MS = 60 * 60 * 1000;

function reqIp(req: Request): string {
  const xf = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim();
  return xf || req.socket.remoteAddress || "unknown";
}

function rateOk(ip: string): boolean {
  const now = Date.now();
  const hits = (hitsByIp.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= LIMIT) return false;
  hits.push(now);
  hitsByIp.set(ip, hits);
  return true;
}

export function registerContactRoutes(app: Express): void {
  app.post("/api/contact", async (req: Request, res: Response) => {
    const ip = reqIp(req);
    if (!rateOk(ip)) {
      return res.status(429).json({ error: "rate_limited" });
    }
    const body = z
      .object({
        name: z.string().min(1).max(120),
        email: z.string().email().max(254),
        topic: z.enum(["support", "billing", "privacy", "security", "partnership", "other"]),
        message: z.string().min(10).max(5000),
      })
      .safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({ error: "invalid_body" });
    }
    const topicLabels: Record<string, string> = {
      support: "Support",
      billing: "Billing",
      privacy: "Privacy / data",
      security: "Security",
      partnership: "Partnership",
      other: "Other",
    };
    notifyAdminContactSubmission({
      name: body.data.name.trim(),
      email: body.data.email.trim().toLowerCase(),
      topic: topicLabels[body.data.topic] ?? body.data.topic,
      message: body.data.message.trim(),
      ip,
    });
    res.json({ ok: true });
  });
}
