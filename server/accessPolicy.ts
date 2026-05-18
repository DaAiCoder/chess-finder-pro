/**
 * Pro access: 3-day signup trial, active Stripe subscription, or complimentary
 * test/admin users (COMPLIMENTARY_USER_IDS / COMPLIMENTARY_USERNAMES).
 * Anonymous sessions are handled separately (preview-only, not "members").
 */

import type { User } from "../shared/schema.js";

export const SIGNUP_TRIAL_DAYS = 3;

function parseIdList(raw: string | undefined): Set<number> {
  const out = new Set<number>();
  if (!raw?.trim()) return out;
  for (const part of raw.split(",")) {
    const n = Number(part.trim());
    if (Number.isFinite(n) && n > 0) out.add(n);
  }
  return out;
}

function parseNameList(raw: string | undefined): Set<string> {
  const out = new Set<string>();
  if (!raw?.trim()) return out;
  for (const part of raw.split(",")) {
    const s = part.trim().toLowerCase();
    if (s) out.add(s);
  }
  return out;
}

let cachedIds: Set<number> | null = null;
let cachedNames: Set<string> | null = null;

function complimentaryIds(): Set<number> {
  if (!cachedIds) cachedIds = parseIdList(process.env.COMPLIMENTARY_USER_IDS);
  return cachedIds;
}

function complimentaryNames(): Set<string> {
  if (!cachedNames) cachedNames = parseNameList(process.env.COMPLIMENTARY_USERNAMES);
  return cachedNames;
}

export function isAnonymousUsername(username: string): boolean {
  return username.startsWith("anon-");
}

export function isComplimentaryUser(u: User): boolean {
  if (complimentaryIds().has(u.id)) return true;
  if (complimentaryNames().has(u.username.toLowerCase())) return true;
  return false;
}

export function hasPaidSubscription(u: User): boolean {
  const s = (u.subscriptionStatus ?? "").trim().toLowerCase();
  return s === "active" || s === "trialing";
}

export function signupTrialEndsAt(u: User): Date {
  const start = u.createdAt instanceof Date ? u.createdAt : new Date(u.createdAt);
  return new Date(start.getTime() + SIGNUP_TRIAL_DAYS * 24 * 60 * 60 * 1000);
}

export function inSignupTrial(u: User, now: Date = new Date()): boolean {
  return now.getTime() < signupTrialEndsAt(u).getTime();
}

/** Full Pro feature access (member accounts). Anonymous users never get true here. */
export function userHasProAccess(u: User, now: Date = new Date()): boolean {
  if (isAnonymousUsername(u.username)) return false;
  if (isComplimentaryUser(u)) return true;
  if (hasPaidSubscription(u)) return true;
  if (inSignupTrial(u, now)) return true;
  return false;
}

export function proAccessPayload(u: User, now: Date = new Date()) {
  const trialEndsAt = signupTrialEndsAt(u);
  const paid = hasPaidSubscription(u);
  const comp = isComplimentaryUser(u);
  const trial = inSignupTrial(u, now);
  return {
    hasProAccess: userHasProAccess(u, now),
    trialEndsAt: trialEndsAt.toISOString(),
    subscriptionActive: paid,
    complimentary: comp,
    inSignupTrial: trial && !paid && !comp,
  };
}
