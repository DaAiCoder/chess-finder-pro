/**
 * Persist which training puzzle the user is on so leaving the page and
 * returning does not reset the deck to the first card.
 *
 * Keys should be unique per trainer / filter (e.g. `tactics:any`,
 * `tactics:Fork`, `endgame`).
 */

const PREFIX = "chessfinder.trainingDeck.v1:";

export function readDeckProblemId(key: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(PREFIX + key);
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function writeDeckProblemId(key: string, problemId: number): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PREFIX + key, String(problemId));
  } catch {
    /* quota / private mode */
  }
}

export function indexForProblemId<T extends { id: number }>(
  problems: T[],
  problemId: number | null,
): number {
  if (problemId == null || problems.length === 0) return 0;
  const i = problems.findIndex((p) => p.id === problemId);
  return i >= 0 ? i : 0;
}
