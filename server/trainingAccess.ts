/**
 * Training freemium: daily puzzle caps for non-Pro users and Pro-only
 * personalized / advanced trainers.
 */

import type { Response } from "express";
import type { User } from "../shared/schema.js";
import { isAnonymousUsername, userHasProAccess } from "./accessPolicy.js";
import { storage } from "./storage.js";

export const TRAINING_DAILY_LIMIT_ANONYMOUS = Number(
  process.env.TRAINING_DAILY_LIMIT_ANONYMOUS ?? 5,
);
export const TRAINING_DAILY_LIMIT_FREE = Number(process.env.TRAINING_DAILY_LIMIT_FREE ?? 15);
export const TRAINING_RETRY_FREE_LIMIT = 3;

/** Modules that require Pro to open at all (not just daily cap). */
export const PRO_ONLY_TRAINING_MODULES = new Set([
  "pawn-structures",
  "calculation-studio",
  "plans",
]);

export type TrainingProFeature =
  | "weekly_plan"
  | "repertoire"
  | "calculation_ladder"
  | "time_pressure"
  | "plan_finder"
  | "pawn_structures"
  | "calculation_studio"
  | "library_generate"
  | "personalized_problems"
  | "retry_queue"
  | "srs_review";

export function utcDayStart(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function trainingDailyLimit(user: User | undefined): number {
  if (!user || isAnonymousUsername(user.username)) return TRAINING_DAILY_LIMIT_ANONYMOUS;
  return TRAINING_DAILY_LIMIT_FREE;
}

export function hasUnlimitedTraining(user: User | undefined | null): boolean {
  return Boolean(user && userHasProAccess(user));
}

export function isProOnlyTrainingModule(module: string): boolean {
  return PRO_ONLY_TRAINING_MODULES.has(module);
}

export async function countTrainingAttemptsToday(userId: number): Promise<number> {
  return storage.countAttemptsSince(userId, utcDayStart());
}

export async function getTrainingUsage(user: User | undefined, userId: number) {
  const unlimited = hasUnlimitedTraining(user);
  const limit = trainingDailyLimit(user);
  const used = unlimited ? 0 : await countTrainingAttemptsToday(userId);
  const remaining = unlimited ? Infinity : Math.max(0, limit - used);
  return { unlimited, used, limit, remaining };
}

export function sendTrainingProRequired(res: Response, feature: TrainingProFeature) {
  res.status(402).json({
    error: "training_pro_required",
    feature,
    message: "Subscribe to Pro for personalized training from your games and advanced trainers.",
  });
}

export function sendTrainingDailyLimit(res: Response, used: number, limit: number) {
  res.status(402).json({
    error: "training_daily_limit",
    used,
    limit,
    message: `Daily training limit reached (${used}/${limit}). Subscribe for unlimited puzzles.`,
  });
}
