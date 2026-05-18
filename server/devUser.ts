/**
 * Ensures a known dev/test app login exists (email+password via /login).
 * Disabled in production unless DEV_SEED_LOGIN=1.
 */
import { storage } from "./storage.js";
import { hashPassword } from "./password.js";

export function devLoginEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.DEV_SEED_LOGIN === "1";
}

export function devLoginCredentials(): { username: string; password: string; email: string } {
  const username = (process.env.DEV_LOGIN_USER ?? "dev").trim().toLowerCase();
  const password = process.env.DEV_LOGIN_PASSWORD ?? "dev";
  const email = (process.env.DEV_LOGIN_EMAIL ?? "dev@localhost").trim().toLowerCase();
  return { username, password, email };
}

export async function ensureDevLoginUser(): Promise<void> {
  if (!devLoginEnabled()) return;

  const { username, password, email } = devLoginCredentials();
  if (!username || username.startsWith("anon-") || username.startsWith("lichess-")) {
    console.warn("[dev] DEV_LOGIN_USER is reserved or empty — skip seeding");
    return;
  }

  const hash = await hashPassword(password);
  let user = await storage.getUserByUsername(username);

  if (!user) {
    user = await storage.createUser({
      username,
      password: hash,
      email,
      preferences: {},
    });
    console.log(`[dev] created app login: username="${username}" email="${email}"`);
    return;
  }

  if (!user.password?.startsWith("scrypt$")) {
    await storage.updateUserPassword(user.id, hash);
    console.log(`[dev] upgraded password hash for "${username}"`);
  }

  if (!user.email && email) {
    await storage.updateUserEmail(user.id, email);
  }
}
