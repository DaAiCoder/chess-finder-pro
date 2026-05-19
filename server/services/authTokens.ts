/**
 * Single-use auth tokens (hashed at rest). Raw token only appears in email URLs.
 */
import { createHash, randomBytes } from "node:crypto";

export type AuthTokenPurpose = "magic_signin" | "password_reset" | "email_change";

export interface AuthTokenPayload {
  purpose: AuthTokenPurpose;
  email: string;
  userId?: number;
  newEmail?: string;
}

interface StoredToken extends AuthTokenPayload {
  exp: number;
}

const tokens = new Map<string, StoredToken>();

function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function pruneExpired(): void {
  const now = Date.now();
  for (const [k, v] of tokens) {
    if (v.exp < now) tokens.delete(k);
  }
}

export function createAuthToken(payload: AuthTokenPayload, ttlMs: number): string {
  pruneExpired();
  const raw = randomBytes(32).toString("base64url");
  tokens.set(sha256Hex(raw), { ...payload, exp: Date.now() + ttlMs });
  return raw;
}

export function consumeAuthToken(
  rawToken: string,
  expectedPurpose: AuthTokenPurpose,
): AuthTokenPayload | null {
  pruneExpired();
  const key = sha256Hex(rawToken.trim());
  const row = tokens.get(key);
  if (!row || row.exp < Date.now() || row.purpose !== expectedPurpose) {
    tokens.delete(key);
    return null;
  }
  tokens.delete(key);
  return {
    purpose: row.purpose,
    email: row.email,
    userId: row.userId,
    newEmail: row.newEmail,
  };
}
