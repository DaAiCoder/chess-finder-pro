/**
 * Authentication & per-user identity.
 *
 * Three modes:
 *   1. Anonymous session — every visitor gets a `user` row created on first
 *      authenticated action with username `anon-<8-hex>` so per-user features
 *      (SRS, weakness map, saved searches) have a stable id without forcing
 *      sign-in.
 *   2. Email + password — `/api/auth/register` and `/api/auth/login`.
 *      Passwords are hashed with `scrypt` and compared with `timingSafeEqual`.
 *   3. Lichess OAuth — `/api/auth/lichess/start` kicks off a standard PKCE
 *      OAuth flow against lichess.org; on callback we upsert a `User` row
 *      with `lichess-<username>` and regenerate the session.
 *   4. Magic-link email (passwordless / "Forgot password?") — issues a
 *      single-use SHA-256-hashed token via Resend (or logs it in dev) that
 *      signs the user in for 15 minutes.
 *
 * Security posture:
 *   - Helmet sets HSTS, frame-ancestors, no-sniff, referrer-policy.
 *   - Sessions: httpOnly, `sameSite=lax`, `secure` in prod, regenerated on
 *     every successful auth (prevents session fixation), `saveUninitialized=false`,
 *     custom cookie name, optional `__Host-` prefix in prod.
 *   - Rate limits per-IP and per-email for login, register, and magic-link.
 *   - Magic-link tokens are stored as their SHA-256 hash; the raw token only
 *     lives in the email URL.
 *   - Constant-time login: if the user does not exist we still consume the
 *     scrypt cost so timing cannot reveal account presence.
 *   - Common-password blocklist on register.
 *   - `SESSION_SECRET` is required in production; the server refuses to start
 *     without it.
 */

import type { Request, Response, NextFunction, Express } from "express";
import session from "express-session";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { randomBytes, createHash } from "node:crypto";
import { DUMMY_SCRYPT_HASH, hashPassword, verifyPassword } from "./password.js";
import { z } from "zod";
import helmet from "helmet";
import {
  sendEmailSafe,
  sendEmailChangeVerifyEmail,
  sendEmailChangedNotice,
  sendMagicLinkEmail,
  sendPasswordChangedEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  notifyAdminUserSignup,
} from "./services/transactionalEmail.js";
import { createAuthToken, consumeAuthToken } from "./services/authTokens.js";
import { storage } from "./storage.js";
import type { User } from "../shared/schema.js";
import { isCommonPassword } from "./services/commonPasswords.js";
import { proAccessPayload, userHasProAccess, isAnonymousUsername, isComplimentaryUser } from "./accessPolicy.js";
import {
  recordLoginFailure,
  recordSignupFromIp,
  notifyAdminComplimentaryGranted,
} from "./services/opsAlerts.js";

/* ---------------------------------------------------------------------- */
/* Module augmentation: extend express-session SessionData                 */
/* ---------------------------------------------------------------------- */

declare module "express-session" {
  interface SessionData {
    userId?: number;
    lichessVerifier?: string;
    lichessState?: string;
    /** After OAuth / magic link, safe in-app path (must start with `/`). */
    authRedirectNext?: string;
    /** Set by POST /api/operator/login when OPERATOR_DASHBOARD_* env is configured. */
    operatorPortal?: boolean;
  }
}

/* ---------------------------------------------------------------------- */
/* Constants                                                               */
/* ---------------------------------------------------------------------- */

const DEV_USER_ID = 1;
const DEFAULT_DEV_SECRET = "chess-finder-pro-dev-secret-change-me";
const IS_PROD = process.env.NODE_ENV === "production";
const COOKIE_NAME = IS_PROD ? "__Host-cfpsid" : "cfpsid";

const MAGIC_TTL_MS = 15 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
const EMAIL_CHANGE_TTL_MS = 24 * 60 * 60 * 1000;
const LOGIN_LOCKOUT_MAX = 8;
const LOGIN_LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const MAGIC_EMAIL_COOLDOWN_MS = 60_000;
const MAGIC_IP_PER_HOUR = 20;
const REGISTER_IP_PER_HOUR = 10;
const RESET_IP_PER_HOUR = 15;
const EMAIL_CHANGE_COOLDOWN_MS = 120_000;

const LICHESS_AUTH = "https://lichess.org/oauth";
const LICHESS_TOKEN = "https://lichess.org/api/token";
const LICHESS_ACCOUNT = "https://lichess.org/api/account";

/* ---------------------------------------------------------------------- */
/* Public API                                                              */
/* ---------------------------------------------------------------------- */

/** Session-bound user id (anonymous users get a stable row via middleware). */
export function currentUserId(req: Request): number {
  return req.session?.userId ?? DEV_USER_ID;
}

/** Wires session middleware + user-resolution into the Express app. */
export function installAuth(app: Express): void {
  // Trust the first proxy (e.g. Cloudflare, Heroku, Render, nginx) so
  // `req.secure` and `req.ip` reflect the real client when behind one.
  if (IS_PROD) app.set("trust proxy", 1);

  // Refuse to start in production with the dev secret.
  if (IS_PROD && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === DEFAULT_DEV_SECRET)) {
    throw new Error(
      "SESSION_SECRET is required in production. Generate one with `node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"` and set it in your environment.",
    );
  }

  // Security headers. Disable CSP in dev because Vite ships inline scripts
  // and a websocket-based HMR client. In production we set a strict CSP.
  app.use(
    helmet({
      contentSecurityPolicy: IS_PROD
        ? {
            useDefaults: true,
            directives: {
              "default-src": ["'self'"],
              "img-src": ["'self'", "data:", "blob:", "https:"],
              // No inline scripts in production HTML: gtag bootstrap lives at
              // `/gtag-consent-bootstrap.js` so CSP survives multiple policies
              // (e.g. Cloudflare ∩ Helmet) intersecting to strict `script-src 'self'`.
              "script-src": ["'self'", "https://www.googletagmanager.com"],
              "style-src": ["'self'", "'unsafe-inline'"],
              "connect-src": [
                "'self'",
                "https://lichess.org",
                "https://api.chess.com",
                "https://www.google-analytics.com",
                "https://www.googletagmanager.com",
                "https://region1.google-analytics.com",
              ],
              "frame-ancestors": ["'none'"],
              "object-src": ["'none'"],
              "base-uri": ["'self'"],
              "form-action": ["'self'", "https://lichess.org"],
              "upgrade-insecure-requests": [],
            },
          }
        : false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: "same-site" },
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      hsts: IS_PROD
        ? { maxAge: 60 * 60 * 24 * 365, includeSubDomains: true, preload: true }
        : false,
      // X-Frame-Options redundant with CSP frame-ancestors but cheap.
      frameguard: { action: "deny" },
    }),
  );

  app.use(
    session({
      name: COOKIE_NAME,
      secret: process.env.SESSION_SECRET ?? DEFAULT_DEV_SECRET,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: IS_PROD,
        // `__Host-` prefix demands no Domain attribute, Path=/, Secure.
        path: "/",
        maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
      },
    }),
  );

  passport.use(
    new LocalStrategy(
      { usernameField: "username", passwordField: "password" },
      async (username, password, done) => {
        try {
          const raw = (username ?? "").trim();
          if (!raw || !password) return done(null, false);
          const lower = raw.toLowerCase();
          let u: User | undefined;
          if (raw.includes("@")) {
            u = await storage.getUserByEmail(lower);
          } else {
            u = await storage.getUserByUsername(lower);
          }
          // Always run scrypt — against a dummy hash if the user is missing —
          // so login timing does not reveal account existence.
          const storedHash = u?.password?.startsWith("scrypt$")
            ? u.password
            : DUMMY_SCRYPT_HASH;
          const ok = await verifyPassword(password, storedHash);
          if (!u || !u.password?.startsWith("scrypt$") || !ok) {
            return done(null, false);
          }
          done(null, { id: u.id, username: u.username });
        } catch (e) {
          done(e as Error);
        }
      },
    ),
  );
  app.use(passport.initialize());

  // Anonymous user resolution — only when an api route asks for it
  // (`getUserId`), instead of on every request. This avoids spinning
  // session rows for every static-asset HEAD from a crawler.
}

/**
 * Returns the user id for the current request. Creates an anonymous one
 * if absent.
 */
export async function getUserId(req: Request): Promise<number> {
  if (req.session.userId) return req.session.userId;
  const u = await ensureAnonymousUser();
  req.session.userId = u.id;
  return u.id;
}

/** Convenience for routes that want the full user row. */
export async function getCurrentUser(req: Request): Promise<User | undefined> {
  const id = await getUserId(req);
  return storage.getUser(id);
}

/* ---------------------------------------------------------------------- */
/* Anonymous user creation                                                 */
/* ---------------------------------------------------------------------- */

async function ensureAnonymousUser(): Promise<User> {
  const username = `anon-${randomBytes(4).toString("hex")}`;
  return storage.createUser({ username, password: "", email: null });
}

/* ---------------------------------------------------------------------- */
/* In-memory rate limiters + helpers                                       */
/* ---------------------------------------------------------------------- */

interface Bucket {
  hits: number[];
}

const loginFailsByIp = new Map<string, Bucket>();
const loginFailsByEmail = new Map<string, Bucket>();
const magicHitsByIp = new Map<string, Bucket>();
const magicLastByEmail = new Map<string, number>();
const resetLastByEmail = new Map<string, number>();
const resetHitsByIp = new Map<string, Bucket>();
const emailChangeLastByUser = new Map<number, number>();
const registerHitsByIp = new Map<string, Bucket>();

function reqIp(req: Request): string {
  // express trust proxy already strips X-Forwarded-For when set.
  return req.ip || req.socket.remoteAddress || "unknown";
}

function pushHit(map: Map<string, Bucket>, key: string, windowMs: number, limit: number): boolean {
  const now = Date.now();
  const b = map.get(key) ?? { hits: [] };
  b.hits = b.hits.filter((t) => now - t < windowMs);
  if (b.hits.length >= limit) {
    map.set(key, b);
    return false;
  }
  b.hits.push(now);
  map.set(key, b);
  return true;
}

function publicOrigin(req: Request): string {
  const fromEnv = process.env.APP_PUBLIC_ORIGIN?.trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  const xfProto = (req.headers["x-forwarded-proto"] as string)?.split(",")[0]?.trim();
  const proto = xfProto || req.protocol || "http";
  const host = req.get("host") || "localhost:5000";
  return `${proto}://${host}`;
}

function safeRedirectPath(next: string | undefined): string {
  if (!next || typeof next !== "string") return "/analysis";
  const t = next.trim();
  if (!t.startsWith("/") || t.startsWith("//")) return "/analysis";
  return t;
}

/** Append a query param for client-side analytics (OAuth / magic-link sign-ups). */
function appendQueryParam(path: string, key: string, value: string): string {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

async function uniqueUsernameFromEmail(email: string): Promise<string> {
  const local = email.split("@")[0] ?? "player";
  const base = local
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .toLowerCase()
    .slice(0, 28)
    .replace(/^-+/, "")
    .replace(/-+$/, "");
  let candidate = (base || "player").slice(0, 30);
  let n = 0;
  while (await storage.getUserByUsername(candidate)) {
    n += 1;
    candidate = `${(base || "player").slice(0, 22)}_${n}`;
  }
  return candidate;
}

async function maybeNotifyComplimentary(u: User): Promise<void> {
  if (!isComplimentaryUser(u)) return;
  const prefs = (u.preferences as Record<string, unknown> | null) ?? {};
  if (prefs.complimentaryAdminNotified) return;
  notifyAdminComplimentaryGranted({
    userId: u.id,
    username: u.username,
    email: u.email ?? null,
  });
  await storage.updateUserPreferences(u.id, { complimentaryAdminNotified: true });
}

/* ---------------------------------------------------------------------- */
/* Routes                                                                  */
/* ---------------------------------------------------------------------- */

export function registerAuthRoutes(app: Express): void {
  app.get("/api/auth/me", async (req: Request, res: Response) => {
    const u = await getCurrentUser(req);
    if (!u) return res.json({ authenticated: false });
    const anon = u.username.startsWith("anon-");
    if (anon) {
      return res.json({
        authenticated: false,
        anonymous: true,
        id: u.id,
        username: u.username,
        email: u.email ?? null,
        lichess: null,
        preferences: u.preferences ?? {},
        hasProAccess: false,
        trialEndsAt: null,
        subscriptionActive: false,
        complimentary: false,
        inSignupTrial: false,
      });
    }
    const access = proAccessPayload(u);
    void maybeNotifyComplimentary(u);
    res.json({
      authenticated: true,
      anonymous: false,
      id: u.id,
      username: u.username,
      email: u.email ?? null,
      lichess: u.username.startsWith("lichess-") ? u.username.slice(8) : null,
      preferences: u.preferences ?? {},
      hasProAccess: access.hasProAccess,
      trialEndsAt: access.trialEndsAt,
      subscriptionActive: access.subscriptionActive,
      complimentary: access.complimentary,
      inSignupTrial: access.inSignupTrial,
    });
  });

  /* ---- Register ---- */
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    if (!pushHit(registerHitsByIp, reqIp(req), 60 * 60 * 1000, REGISTER_IP_PER_HOUR)) {
      return res.status(429).json({ error: "rate_limited" });
    }
    const body = z
      .object({
        username: z
          .string()
          .min(2)
          .max(30)
          .regex(/^[a-zA-Z0-9_-]+$/, "letters, numbers, _ or - only"),
        password: z.string().min(8).max(128),
        email: z.string().email().max(254).optional(),
      })
      .safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({ error: "invalid_body", issues: body.error.flatten() });
    }
    const { username, password, email } = body.data;
    const lower = username.trim().toLowerCase();
    if (lower.startsWith("anon-") || lower.startsWith("lichess-")) {
      return res.status(400).json({ error: "reserved_username" });
    }
    if (password.toLowerCase().includes(lower) || (email && password.toLowerCase().includes(email.split("@")[0]!.toLowerCase()))) {
      return res.status(400).json({ error: "password_contains_username" });
    }
    if (isCommonPassword(password)) {
      return res.status(400).json({ error: "password_too_common" });
    }
    if (await storage.getUserByUsername(lower)) {
      return res.status(409).json({ error: "username_taken" });
    }
    const emailNorm = email?.trim().toLowerCase();
    if (emailNorm && (await storage.getUserByEmail(emailNorm))) {
      return res.status(409).json({ error: "email_taken" });
    }
    try {
      const hash = await hashPassword(password);
      const ip = reqIp(req);
      const user = await storage.createUser({
        username: lower,
        password: hash,
        email: emailNorm ?? null,
        preferences: {},
      });
      // Session fixation: regenerate before pinning userId.
      req.session.regenerate((err) => {
        if (err) return res.status(500).json({ error: "session_regenerate_failed" });
        req.session.userId = user.id;
        req.session.save((e) => {
          if (e) return res.status(500).json({ error: "session_save_failed" });
          if (emailNorm) {
            sendEmailSafe("welcome", () =>
              sendWelcomeEmail({ to: emailNorm, username: user.username, method: "email" }),
            );
          }
          sendEmailSafe("admin-signup", () =>
            notifyAdminUserSignup({
              userId: user.id,
              username: user.username,
              email: emailNorm ?? null,
              method: "email",
              ip,
            }),
          );
          recordSignupFromIp(ip, user.username, user.id);
          res.json({ ok: true, id: user.id, username: user.username });
        });
      });
    } catch (err) {
      console.warn(`[auth] register: ${(err as Error).message}`);
      res.status(500).json({ error: "register_failed" });
    }
  });

  /* ---- Login ---- */
  app.post("/api/auth/login", (req: Request, res: Response, next: NextFunction) => {
    const ip = reqIp(req);
    const rawEmail =
      typeof req.body?.username === "string" ? req.body.username.trim().toLowerCase() : "";

    const now = Date.now();
    const recentIp =
      loginFailsByIp.get(ip)?.hits.filter((t) => now - t < LOGIN_LOCKOUT_WINDOW_MS).length ?? 0;
    const recentEmail = rawEmail
      ? (loginFailsByEmail.get(rawEmail)?.hits.filter((t) => now - t < LOGIN_LOCKOUT_WINDOW_MS).length ?? 0)
      : 0;
    if (recentIp >= LOGIN_LOCKOUT_MAX || recentEmail >= LOGIN_LOCKOUT_MAX) {
      return res.status(429).json({ error: "too_many_attempts" });
    }

    passport.authenticate(
      "local",
      (err: Error | null, user: { id: number; username: string } | false) => {
        if (err) return next(err);
        if (!user) {
          pushHit(loginFailsByIp, ip, LOGIN_LOCKOUT_WINDOW_MS, LOGIN_LOCKOUT_MAX + 10);
          if (rawEmail) pushHit(loginFailsByEmail, rawEmail, LOGIN_LOCKOUT_WINDOW_MS, LOGIN_LOCKOUT_MAX + 10);
          recordLoginFailure(ip);
          return res.status(401).json({ error: "invalid_credentials" });
        }
        // Clear failure buckets on success.
        loginFailsByIp.delete(ip);
        if (rawEmail) loginFailsByEmail.delete(rawEmail);
        req.session.regenerate((e1) => {
          if (e1) return res.status(500).json({ error: "session_regenerate_failed" });
          req.session.userId = user.id;
          req.session.save((e2) => {
            if (e2) return res.status(500).json({ error: "session_save_failed" });
            res.json({ ok: true, id: user.id, username: user.username });
          });
        });
      },
    )(req, res, next);
  });

  /* ---- Logout ---- */
  app.post("/api/auth/logout", (req: Request, res: Response) => {
    req.session.destroy(() => {
      res.clearCookie(COOKIE_NAME, {
        httpOnly: true,
        sameSite: "lax",
        secure: IS_PROD,
        path: "/",
      });
      res.json({ ok: true });
    });
  });

  /* ---- Preferences (signed-in OR anon) ---- */
  app.post("/api/auth/preferences", async (req: Request, res: Response) => {
    try {
      const userId = await getUserId(req);
      const body = z
        .object({
          boardTheme: z.enum(["green", "wood", "brown", "blue", "gray"]).optional(),
          pieceSet: z.string().min(1).max(32).optional(),
          coachAutoOn: z.boolean().optional(),
        })
        .partial()
        .safeParse(req.body);
      if (!body.success) {
        return res.status(400).json({ error: "invalid_body" });
      }
      const u = await storage.getUser(userId);
      if (!u) return res.status(404).json({ error: "user_not_found" });
      const updated = await storage.updateUserPreferences(u.id, body.data);
      res.json({ ok: true, preferences: updated?.preferences ?? body.data });
    } catch (err) {
      console.warn(`[auth] prefs: ${(err as Error).message}`);
      res.status(500).json({ error: "prefs_failed" });
    }
  });

  /* ---- Change password (signed-in only) ---- */
  app.post("/api/auth/change-password", async (req: Request, res: Response) => {
    if (!req.session.userId) return res.status(401).json({ error: "auth_required" });
    const body = z
      .object({
        currentPassword: z.string().min(1).max(128),
        newPassword: z.string().min(8).max(128),
      })
      .safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "invalid_body" });
    const u = await storage.getUser(req.session.userId);
    if (!u || !u.password?.startsWith("scrypt$")) {
      return res.status(400).json({ error: "no_password_set" });
    }
    const ok = await verifyPassword(body.data.currentPassword, u.password);
    if (!ok) return res.status(401).json({ error: "invalid_credentials" });
    if (isCommonPassword(body.data.newPassword)) {
      return res.status(400).json({ error: "password_too_common" });
    }
    const hash = await hashPassword(body.data.newPassword);
    await storage.updateUserPassword(u.id, hash);
    if (u.email) {
      sendEmailSafe("password-changed", () => sendPasswordChangedEmail({ to: u.email! }));
    }
    res.json({ ok: true });
  });

  /* ---- Magic link request ---- */
  app.post("/api/auth/magic-link/request", async (req: Request, res: Response) => {
    // Always respond { ok: true } to avoid account-existence enumeration.
    try {
      if (!pushHit(magicHitsByIp, reqIp(req), 60 * 60 * 1000, MAGIC_IP_PER_HOUR)) {
        return res.json({ ok: true });
      }
      const parsed = z
        .object({
          email: z.string().email().max(254),
          next: z.string().max(512).optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) return res.json({ ok: true });
      const email = parsed.data.email.trim().toLowerCase();
      const next = safeRedirectPath(parsed.data.next);
      const last = magicLastByEmail.get(email) ?? 0;
      if (Date.now() - last < MAGIC_EMAIL_COOLDOWN_MS) {
        return res.json({ ok: true });
      }
      magicLastByEmail.set(email, Date.now());

      const token = createAuthToken({ purpose: "magic_signin", email }, MAGIC_TTL_MS);

      const magicUrl = `${publicOrigin(req)}/api/auth/magic-link/consume?token=${encodeURIComponent(token)}&next=${encodeURIComponent(next)}`;
      try {
        await sendMagicLinkEmail({ to: email, magicUrl });
      } catch (err) {
        console.warn(`[auth] magic send: ${(err as Error).message}`);
      }
      res.json({ ok: true });
    } catch (err) {
      console.warn(`[auth] magic request: ${(err as Error).message}`);
      res.json({ ok: true });
    }
  });

  /* ---- Magic link consume ---- */
  app.get("/api/auth/magic-link/consume", async (req: Request, res: Response) => {
    const token = String(req.query.token ?? "").trim();
    const next = safeRedirectPath(String(req.query.next ?? ""));
    if (!token) {
      return res.redirect(`${publicOrigin(req)}/login?error=magic_invalid`);
    }
    const payload = consumeAuthToken(token, "magic_signin");
    if (!payload) {
      return res.redirect(`${publicOrigin(req)}/login?error=magic_invalid`);
    }
    const email = payload.email;
    try {
      let user = await storage.getUserByEmail(email);
      let isNewUser = false;
      if (!user) {
        isNewUser = true;
        const uname = await uniqueUsernameFromEmail(email);
        user = await storage.createUser({
          username: uname,
          password: "",
          email,
          preferences: {},
        });
      } else if (!user.email) {
        await storage.updateUserEmail(user.id, email);
      }
      if (isNewUser) {
        const ip = reqIp(req);
        sendEmailSafe("welcome", () =>
          sendWelcomeEmail({ to: email, username: user!.username, method: "magic_link" }),
        );
        sendEmailSafe("admin-signup", () =>
          notifyAdminUserSignup({
            userId: user!.id,
            username: user!.username,
            email,
            method: "magic_link",
            ip,
          }),
        );
        recordSignupFromIp(ip, user!.username, user!.id);
      }
      req.session.regenerate((err) => {
        if (err) {
          return res.redirect(`${publicOrigin(req)}/login?error=session`);
        }
        req.session.userId = user!.id;
        delete req.session.authRedirectNext;
        req.session.save((e) => {
          if (e) {
            return res.redirect(`${publicOrigin(req)}/login?error=session`);
          }
          res.redirect(
            `${publicOrigin(req)}${isNewUser ? appendQueryParam(next, "signed_up", "magic_link") : next}`,
          );
        });
      });
    } catch (err) {
      console.warn(`[auth] magic consume: ${(err as Error).message}`);
      res.redirect(`${publicOrigin(req)}/login?error=magic_failed`);
    }
  });

  /* ---- Password reset (forgot password) ---- */
  app.post("/api/auth/password-reset/request", async (req: Request, res: Response) => {
    try {
      if (!pushHit(resetHitsByIp, reqIp(req), 60 * 60 * 1000, RESET_IP_PER_HOUR)) {
        return res.json({ ok: true });
      }
      const parsed = z.object({ email: z.string().email().max(254) }).safeParse(req.body);
      if (!parsed.success) return res.json({ ok: true });
      const email = parsed.data.email.trim().toLowerCase();
      const last = resetLastByEmail.get(email) ?? 0;
      if (Date.now() - last < MAGIC_EMAIL_COOLDOWN_MS) return res.json({ ok: true });
      resetLastByEmail.set(email, Date.now());

      const user = await storage.getUserByEmail(email);
      if (user && !user.username.startsWith("anon-")) {
        const token = createAuthToken(
          { purpose: "password_reset", email, userId: user.id },
          PASSWORD_RESET_TTL_MS,
        );
        const resetUrl = `${publicOrigin(req)}/reset-password?token=${encodeURIComponent(token)}`;
        try {
          await sendPasswordResetEmail({ to: email, resetUrl });
        } catch (err) {
          console.warn(`[auth] password reset send: ${(err as Error).message}`);
        }
      }
      res.json({ ok: true });
    } catch (err) {
      console.warn(`[auth] password reset request: ${(err as Error).message}`);
      res.json({ ok: true });
    }
  });

  app.post("/api/auth/password-reset/confirm", async (req: Request, res: Response) => {
    const body = z
      .object({
        token: z.string().min(16).max(256),
        newPassword: z.string().min(8).max(128),
      })
      .safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "invalid_body" });
    if (isCommonPassword(body.data.newPassword)) {
      return res.status(400).json({ error: "password_too_common" });
    }
    const payload = consumeAuthToken(body.data.token, "password_reset");
    if (!payload?.userId) return res.status(400).json({ error: "reset_invalid" });
    const user = await storage.getUser(payload.userId);
    if (!user || user.email?.toLowerCase() !== payload.email) {
      return res.status(400).json({ error: "reset_invalid" });
    }
    try {
      const hash = await hashPassword(body.data.newPassword);
      await storage.updateUserPassword(user.id, hash);
      if (user.email) {
        sendEmailSafe("password-changed", () => sendPasswordChangedEmail({ to: user.email! }));
      }
      res.json({ ok: true });
    } catch (err) {
      console.warn(`[auth] password reset confirm: ${(err as Error).message}`);
      res.status(500).json({ error: "reset_failed" });
    }
  });

  /* ---- Email change (signed-in) ---- */
  app.post("/api/auth/email-change/request", async (req: Request, res: Response) => {
    if (!req.session.userId) return res.status(401).json({ error: "auth_required" });
    const body = z.object({ newEmail: z.string().email().max(254) }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "invalid_body" });
    const newEmail = body.data.newEmail.trim().toLowerCase();
    const user = await storage.getUser(req.session.userId);
    if (!user || user.username.startsWith("anon-")) {
      return res.status(400).json({ error: "auth_required" });
    }
    if (user.email?.toLowerCase() === newEmail) {
      return res.status(400).json({ error: "email_unchanged" });
    }
    if (await storage.getUserByEmail(newEmail)) {
      return res.status(409).json({ error: "email_taken" });
    }
    const last = emailChangeLastByUser.get(user.id) ?? 0;
    if (Date.now() - last < EMAIL_CHANGE_COOLDOWN_MS) {
      return res.status(429).json({ error: "rate_limited" });
    }
    emailChangeLastByUser.set(user.id, Date.now());

    const token = createAuthToken(
      {
        purpose: "email_change",
        email: user.email ?? user.username,
        userId: user.id,
        newEmail,
      },
      EMAIL_CHANGE_TTL_MS,
    );
    const verifyUrl = `${publicOrigin(req)}/api/auth/email-change/consume?token=${encodeURIComponent(token)}`;
    try {
      await sendEmailChangeVerifyEmail({ to: newEmail, verifyUrl, newEmail });
      res.json({ ok: true });
    } catch (err) {
      console.warn(`[auth] email change send: ${(err as Error).message}`);
      res.status(500).json({ error: "email_send_failed" });
    }
  });

  /* ---- Email change (signed-out: email + password) ---- */
  app.post("/api/auth/email-change/request-account", async (req: Request, res: Response) => {
    const body = z
      .object({
        email: z.string().email().max(254),
        password: z.string().min(1).max(128),
        newEmail: z.string().email().max(254),
      })
      .safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "invalid_body" });
    const email = body.data.email.trim().toLowerCase();
    const newEmail = body.data.newEmail.trim().toLowerCase();
    if (email === newEmail) return res.status(400).json({ error: "email_unchanged" });

    const user = await storage.getUserByEmail(email);
    if (!user || !user.password?.startsWith("scrypt$")) {
      return res.status(401).json({ error: "invalid_credentials" });
    }
    const ok = await verifyPassword(body.data.password, user.password);
    if (!ok) return res.status(401).json({ error: "invalid_credentials" });
    if (await storage.getUserByEmail(newEmail)) {
      return res.status(409).json({ error: "email_taken" });
    }
    const last = emailChangeLastByUser.get(user.id) ?? 0;
    if (Date.now() - last < EMAIL_CHANGE_COOLDOWN_MS) {
      return res.status(429).json({ error: "rate_limited" });
    }
    emailChangeLastByUser.set(user.id, Date.now());

    const token = createAuthToken(
      { purpose: "email_change", email, userId: user.id, newEmail },
      EMAIL_CHANGE_TTL_MS,
    );
    const verifyUrl = `${publicOrigin(req)}/api/auth/email-change/consume?token=${encodeURIComponent(token)}`;
    try {
      await sendEmailChangeVerifyEmail({ to: newEmail, verifyUrl, newEmail });
      res.json({ ok: true });
    } catch (err) {
      console.warn(`[auth] email change account send: ${(err as Error).message}`);
      res.status(500).json({ error: "email_send_failed" });
    }
  });

  app.get("/api/auth/email-change/consume", async (req: Request, res: Response) => {
    const token = String(req.query.token ?? "").trim();
    if (!token) {
      return res.redirect(`${publicOrigin(req)}/account?error=email_change_invalid`);
    }
    const payload = consumeAuthToken(token, "email_change");
    if (!payload?.userId || !payload.newEmail) {
      return res.redirect(`${publicOrigin(req)}/account?error=email_change_invalid`);
    }
    try {
      const user = await storage.getUser(payload.userId);
      if (!user) {
        return res.redirect(`${publicOrigin(req)}/account?error=email_change_invalid`);
      }
      if (await storage.getUserByEmail(payload.newEmail)) {
        return res.redirect(`${publicOrigin(req)}/account?error=email_taken`);
      }
      const oldEmail = user.email;
      await storage.updateUserEmail(user.id, payload.newEmail);
      if (oldEmail && oldEmail.toLowerCase() !== payload.newEmail) {
        sendEmailSafe("email-changed-old", () =>
          sendEmailChangedNotice({
            to: oldEmail,
            oldEmail,
            newEmail: payload.newEmail!,
          }),
        );
      }
      sendEmailSafe("email-changed-new", () =>
        sendEmailChangedNotice({
          to: payload.newEmail!,
          oldEmail: oldEmail ?? "(none)",
          newEmail: payload.newEmail!,
        }),
      );
      res.redirect(`${publicOrigin(req)}/account?email_updated=1`);
    } catch (err) {
      console.warn(`[auth] email change consume: ${(err as Error).message}`);
      res.redirect(`${publicOrigin(req)}/account?error=email_change_failed`);
    }
  });

  /* ---- Lichess OAuth ---- */
  app.get("/api/auth/lichess/start", (req: Request, res: Response) => {
    const clientId = process.env.LICHESS_CLIENT_ID;
    const redirectUri = process.env.LICHESS_REDIRECT_URI;
    if (!clientId || !redirectUri) {
      return res.status(503).json({
        error: "lichess_oauth_disabled",
        message:
          "Lichess OAuth is not configured. Set LICHESS_CLIENT_ID and LICHESS_REDIRECT_URI in .env to enable.",
      });
    }
    const next = safeRedirectPath(String(req.query.next ?? ""));
    req.session.authRedirectNext = next;
    const verifier = randomBytes(32).toString("base64url");
    const state = randomBytes(16).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    req.session.lichessVerifier = verifier;
    req.session.lichessState = state;
    const url = new URL(LICHESS_AUTH);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("scope", "preference:read");
    url.searchParams.set("state", state);
    req.session.save(() => res.redirect(url.toString()));
  });

  app.get("/api/auth/lichess/callback", async (req: Request, res: Response) => {
    const clientId = process.env.LICHESS_CLIENT_ID;
    const redirectUri = process.env.LICHESS_REDIRECT_URI;
    if (!clientId || !redirectUri) {
      return res.status(503).json({ error: "lichess_oauth_disabled" });
    }
    const { code, state } = req.query as { code?: string; state?: string };
    const expectedState = req.session.lichessState;
    const verifier = req.session.lichessVerifier;
    if (!code || !state || !expectedState || state !== expectedState || !verifier) {
      return res.redirect(`${publicOrigin(req)}/login?error=oauth_state`);
    }
    try {
      const tokenRes = await fetch(LICHESS_TOKEN, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          client_id: clientId,
          code_verifier: verifier,
        }).toString(),
      });
      if (!tokenRes.ok) {
        return res.redirect(`${publicOrigin(req)}/login?error=oauth_token`);
      }
      const tok = (await tokenRes.json()) as { access_token: string };
      const accountRes = await fetch(LICHESS_ACCOUNT, {
        headers: { authorization: `Bearer ${tok.access_token}` },
      });
      if (!accountRes.ok) {
        return res.redirect(`${publicOrigin(req)}/login?error=oauth_account`);
      }
      const account = (await accountRes.json()) as { username?: string };
      if (!account.username || !/^[A-Za-z0-9_-]{2,40}$/.test(account.username)) {
        return res.redirect(`${publicOrigin(req)}/login?error=oauth_account`);
      }
      const desired = `lichess-${account.username.toLowerCase()}`;
      let user = await storage.getUserByUsername(desired);
      const isNewUser = !user;
      if (!user) {
        user = await storage.createUser({
          username: desired,
          password: "",
          email: null,
          preferences: {},
        });
        sendEmailSafe("admin-signup", () =>
          notifyAdminUserSignup({
            userId: user!.id,
            username: user!.username,
            email: null,
            method: "lichess",
            ip: reqIp(req),
          }),
        );
        recordSignupFromIp(reqIp(req), user!.username, user!.id);
      }
      const destBase = safeRedirectPath(req.session.authRedirectNext);
      const dest = isNewUser ? appendQueryParam(destBase, "signed_up", "lichess") : destBase;
      req.session.regenerate((err) => {
        if (err) return res.redirect(`${publicOrigin(req)}/login?error=session`);
        req.session.userId = user!.id;
        req.session.save((e) => {
          if (e) return res.redirect(`${publicOrigin(req)}/login?error=session`);
          res.redirect(`${publicOrigin(req)}${dest}`);
        });
      });
    } catch (err) {
      console.warn(`[auth] lichess cb: ${(err as Error).message}`);
      res.redirect(`${publicOrigin(req)}/login?error=oauth_failed`);
    }
  });
}

/**
 * Paid coach + opponent-prep APIs: real member accounts need an active
 * subscription, complimentary flag, or in the 3-day signup trial. Anonymous
 * sessions still reach handlers (landing previews use the same routes).
 */
export function registerProFeatureGate(app: Express): void {
  app.use("/api/coach", proFeatureGateMiddleware);
  app.use("/api/opponent-prep", proFeatureGateMiddleware);
}

async function proFeatureGateMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    await getUserId(req);
    const u = await getCurrentUser(req);
    if (!u) return res.status(401).json({ error: "auth_required" });
    if (isAnonymousUsername(u.username)) return next();
    if (userHasProAccess(u)) return next();
    const p = proAccessPayload(u);
    return res.status(402).json({
      error: "subscription_required",
      trialEndsAt: p.trialEndsAt,
    });
  } catch (e) {
    next(e as Error);
  }
}

/** Express middleware that demands a non-anonymous user. */
export function requireSignedIn(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) return res.status(401).json({ error: "auth_required" });
  next();
}

