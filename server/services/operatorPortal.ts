/**
 * Operator dashboard login (username + password → session flag).
 * Used to gate site analytics / admin pricing in the browser without pasting ADMIN_API_KEY.
 *
 * Set `OPERATOR_DASHBOARD_USER` and `OPERATOR_DASHBOARD_PASSWORD` on the server.
 * Compared with SHA-256 + timingSafeEqual (length-invariant per digest).
 */
import { createHash, timingSafeEqual } from "node:crypto";
import type { Express, Request, Response } from "express";
import { z } from "zod";

const loginSchema = z.object({
  username: z.string().min(1).max(200),
  password: z.string().min(1).max(500),
});

function sha256utf8(s: string): Buffer {
  return createHash("sha256").update(s, "utf8").digest();
}

function secretEq(a: string, b: string): boolean {
  const ha = sha256utf8(a);
  const hb = sha256utf8(b);
  if (ha.length !== hb.length) return false;
  return timingSafeEqual(ha, hb);
}

export function registerOperatorPortalRoutes(app: Express): void {
  app.get("/api/operator/session", (req: Request, res: Response) => {
    res.json({ ok: req.session?.operatorPortal === true });
  });

  app.post("/api/operator/login", (req: Request, res: Response) => {
    const user = process.env.OPERATOR_DASHBOARD_USER?.trim() ?? "";
    const pass = process.env.OPERATOR_DASHBOARD_PASSWORD?.trim() ?? "";
    if (!user || !pass) {
      return res.status(503).json({
        error: "operator_login_not_configured",
        message: "Set OPERATOR_DASHBOARD_USER and OPERATOR_DASHBOARD_PASSWORD on the server.",
      });
    }

    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid_body" });
    }

    const okUser = secretEq(parsed.data.username, user);
    const okPass = secretEq(parsed.data.password, pass);
    if (!okUser || !okPass) {
      return res.status(401).json({ error: "invalid_credentials" });
    }

    req.session.operatorPortal = true;
    req.session.save((err) => {
      if (err) {
        console.warn("[operator-portal] session save failed:", err.message);
        return res.status(500).json({ error: "session_failed" });
      }
      res.json({ ok: true });
    });
  });

  app.post("/api/operator/logout", (req: Request, res: Response) => {
    delete req.session.operatorPortal;
    req.session.save((err) => {
      if (err) {
        console.warn("[operator-portal] session save failed:", err.message);
        return res.status(500).json({ error: "session_failed" });
      }
      res.json({ ok: true });
    });
  });
}
