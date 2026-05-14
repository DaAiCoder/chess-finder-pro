/**
 * Adaptive next-problem picker: prefers due SRS cards, otherwise chooses
 * a problem whose implied rating is near the user's skill rating.
 */
import { storage } from "../storage.js";
import type { TrainingProblem } from "../../shared/schema.js";
import { listDue as listDueSrs } from "./srsScheduler.js";
import { moduleSkillKey } from "./ratingService.js";

const DIFF_TO_RATING: Record<number, number> = {
  1: 1000,
  2: 1200,
  3: 1400,
  4: 1600,
  5: 1800,
};

function impliedProblemRating(p: TrainingProblem): number {
  return DIFF_TO_RATING[p.difficulty] ?? 1200;
}

export async function pickNextTrainingProblem(
  userId: number,
  module: string,
): Promise<TrainingProblem | undefined> {
  const skill = await storage.getUserMotifSkill(userId, moduleSkillKey(module));
  const userR = skill?.rating ?? 1200;

  const due = await listDueSrs(userId, 40);
  if (due.length > 0) {
    const ids = new Set(due.map((c) => c.problemId));
    for (const c of due) {
      const p = await storage.getTrainingProblem(c.problemId);
      if (p && p.module === module && ids.has(p.id)) return p;
    }
  }

  const pool = await storage.listTrainingProblems({ module });
  if (pool.length === 0) return undefined;

  const band = 120;
  const scored = pool.map((p) => ({
    p,
    d: Math.abs(impliedProblemRating(p) - userR),
  }));
  scored.sort((a, b) => a.d - b.d);
  const inBand = scored.filter((x) => x.d <= band);
  const pickFrom = inBand.length > 0 ? inBand : scored;
  const choice = pickFrom[Math.floor(Math.random() * Math.min(pickFrom.length, 12))]!;
  return choice.p;
}
