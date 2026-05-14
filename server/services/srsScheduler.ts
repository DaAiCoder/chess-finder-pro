/**
 * Spaced repetition — FSRS via `ts-fsrs` (replaces legacy SM-2).
 *
 * Hooked from every trainer's attempt-recording mutation; `/api/srs/due`
 * surfaces due cards for the daily review queue.
 */

import { createEmptyCard, fsrs, Rating, type Card } from "ts-fsrs";
import { storage } from "../storage.js";
import type { SrsCard } from "../../shared/schema.js";

const scheduler = fsrs();
const DAY_MS = 24 * 60 * 60 * 1000;

export type SrsQuality = "fail" | "hint-pass" | "pass";

function reviveCard(raw: unknown, now: Date): Card {
  if (!raw || typeof raw !== "object") return createEmptyCard(now);
  const c = raw as Record<string, unknown>;
  const due = c.due != null ? new Date(c.due as string | number) : now;
  const last =
    c.last_review == null || c.last_review === undefined
      ? undefined
      : new Date(c.last_review as string | number);
  return {
    ...(c as unknown as Card),
    due,
    last_review: last,
  };
}

function toFsrsCard(existing: SrsCard | undefined, now: Date): Card {
  if (existing?.fsrsState) return reviveCard(existing.fsrsState, now);
  return createEmptyCard(now);
}

function serializeFsrs(card: Card) {
  return JSON.parse(JSON.stringify(card)) as Record<string, unknown>;
}

/** Schedule (or reschedule) the SRS card for one (userId, problemId). */
export async function schedule(
  userId: number,
  problemId: number,
  quality: SrsQuality,
): Promise<SrsCard> {
  const now = new Date();
  const existing = await storage.getSrsCard(userId, problemId);
  const prev = toFsrsCard(existing, now);
  const grade =
    quality === "pass" ? Rating.Good : quality === "hint-pass" ? Rating.Hard : Rating.Again;
  const { card } = scheduler.next(prev, now, grade);
  const dueAt = card.due instanceof Date ? card.due : new Date(card.due as unknown as string);
  const intervalDays = Math.max(1, Math.ceil((dueAt.getTime() - now.getTime()) / DAY_MS));
  return storage.upsertSrsCard({
    userId,
    problemId,
    easeFactor: Math.max(1.3, card.stability || 2.5),
    intervalDays,
    repetitions: card.reps,
    dueAt,
    lastReviewedAt: now,
    fsrsState: serializeFsrs(card),
  });
}

/** Returns up-to-`limit` due cards for the user, soonest first. */
export async function listDue(userId: number, limit = 25): Promise<SrsCard[]> {
  return storage.listDueSrsCards(userId, new Date(), limit);
}
