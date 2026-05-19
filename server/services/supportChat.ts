/**
 * Public AI support chat (Render-style widget).
 *   POST /api/support/chat  — SSE stream
 *   GET  /api/support/config — starter prompts + enabled flag
 */
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { SUPPORT_STARTER_PROMPTS } from "../data/supportKnowledge.js";
import { iterSupportReply } from "./supportChatStream.js";

const hitsByIp = new Map<string, number[]>();
const IP_LIMIT = 40;
const IP_WINDOW_MS = 60 * 60 * 1000;

function reqIp(req: Request): string {
  const xf = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim();
  return xf || req.socket.remoteAddress || "unknown";
}

function rateOk(ip: string): boolean {
  const now = Date.now();
  const hits = (hitsByIp.get(ip) ?? []).filter((t) => now - t < IP_WINDOW_MS);
  if (hits.length >= IP_LIMIT) return false;
  hits.push(now);
  hitsByIp.set(ip, hits);
  return true;
}

export function isSupportChatEnabled(): boolean {
  return process.env.SUPPORT_CHAT_ENABLED !== "0" && process.env.SUPPORT_CHAT_ENABLED !== "off";
}

export function registerSupportRoutes(app: Express): void {
  app.get("/api/support/config", (_req, res) => {
    res.json({
      enabled: isSupportChatEnabled(),
      starters: [...SUPPORT_STARTER_PROMPTS],
    });
  });

  app.post("/api/support/chat", async (req: Request, res: Response) => {
    if (!isSupportChatEnabled()) {
      return res.status(503).json({ error: "support_disabled" });
    }
    const ip = reqIp(req);
    if (!rateOk(ip)) {
      return res.status(429).json({ error: "rate_limited" });
    }

    const schema = z.object({
      message: z.string().min(1).max(2000),
      history: z
        .array(
          z.object({
            role: z.enum(["user", "assistant"]),
            content: z.string().max(8000),
          }),
        )
        .max(12)
        .optional(),
      page: z.string().max(256).optional(),
      signedIn: z.boolean().optional(),
      hasPro: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid_body" });
    }

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("X-CFP-Support-Api", "1");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    try {
      for await (const delta of iterSupportReply({
        userMessage: parsed.data.message,
        history: parsed.data.history,
        page: parsed.data.page,
        signedIn: parsed.data.signedIn,
        hasPro: parsed.data.hasPro,
      })) {
        res.write(`data: ${JSON.stringify({ delta })}\n\n`);
      }
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (err) {
      res.write(`data: ${JSON.stringify({ error: (err as Error).message })}\n\n`);
      res.end();
    }
  });
}
