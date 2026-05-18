/**
 * scrypt password hashing shared by auth routes and dev-user seeding.
 */
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const SCRYPT_SALT_LEN = 16;
const SCRYPT_KEYLEN = 64;
const SCRYPT_OPTS = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;

function scryptHash(plain: string, salt: Buffer, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(plain, salt, keylen, SCRYPT_OPTS, (err, derived) => {
      if (err) reject(err);
      else resolve(derived as Buffer);
    });
  });
}

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SCRYPT_SALT_LEN);
  const derived = await scryptHash(plain, salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  if (!stored.startsWith("scrypt$")) return false;
  const parts = stored.split("$");
  if (parts.length !== 3) return false;
  try {
    const salt = Buffer.from(parts[1]!, "hex");
    const want = Buffer.from(parts[2]!, "hex");
    const derived = await scryptHash(plain, salt, SCRYPT_KEYLEN);
    if (derived.length !== want.length) return false;
    return timingSafeEqual(derived, want);
  } catch {
    return false;
  }
}

/** Login timing mask when the account does not exist. */
export const DUMMY_SCRYPT_HASH = `scrypt$${randomBytes(SCRYPT_SALT_LEN).toString("hex")}$${randomBytes(SCRYPT_KEYLEN).toString("hex")}`;
