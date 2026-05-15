#!/usr/bin/env node
/**
 * Print cryptographically random secrets suitable for env vars (sessions, operator dashboard, etc.).
 *
 * Usage:
 *   node scripts/gen-password.mjs          # one URL-safe token (~32 chars)
 *   node scripts/gen-password.mjs 3        # three tokens
 *   node scripts/gen-password.mjs --ascii  # 20-char password from letters+digits+symbols
 */
import { randomBytes } from "node:crypto";

const argv = process.argv.slice(2);
const count = Math.max(1, Number(argv.find((a) => /^\d+$/.test(a))) || 1);
const ascii = argv.includes("--ascii");

const SYMBOLS = "!@#$%^&*-_+=.";

function urlSafeToken(bytes = 24) {
  return randomBytes(bytes).toString("base64url");
}

function asciiPassword(length = 20) {
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const digit = "0123456789";
  const pool = lower + upper + digit + SYMBOLS;
  const buf = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += pool[buf[i] % pool.length];
  }
  return out;
}

for (let i = 0; i < count; i++) {
  console.log(ascii ? asciiPassword() : urlSafeToken());
}
