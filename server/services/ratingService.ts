/**
 * Per-(user, skill) ratings — generalises motif calibration to arbitrary
 * `skillKey` strings (motif keys from tacticType, or `module:<name>`).
 */
import { recordMotifAttempt } from "./calibration.js";

/** Canonical key for a training module's aggregate rating. */
export function moduleSkillKey(module: string): string {
  return `__mod__:${module}`;
}

export async function recordSkillRatingAttempt(
  userId: number,
  skillKey: string,
  problemDifficulty: number,
  success: boolean,
) {
  return recordMotifAttempt(userId, skillKey, problemDifficulty, success);
}
