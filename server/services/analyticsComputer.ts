/**
 * Analytics computer.
 *
 * Given a list of games (with optional pre-computed analyses) produces
 * "Aimchess-style" skill scores in 6 categories on a 0..3000 scale:
 *
 *   - advantageCapitalization
 *   - opening
 *   - tactics
 *   - timeManagement
 *   - resourcefulness
 *   - endgame
 *
 * The scoring is intentionally simple/heuristic so the dashboard works the
 * moment a user imports games, without requiring expensive engine analysis on
 * every position. Per-game review still uses Stockfish.
 */

import type { Game, GameAnalysis } from "../../shared/schema.js";

export interface SkillScores {
  advantageCapitalization: number;
  opening: number;
  tactics: number;
  timeManagement: number;
  resourcefulness: number;
  endgame: number;
}

export interface AnalyticsBucket {
  date: string; // ISO date
  rating: number;
  scores: SkillScores;
  result: "W" | "D" | "L";
  ourColor: "white" | "black";
}

export interface AnalyticsSummary {
  buckets: AnalyticsBucket[];
  wins: number;
  draws: number;
  losses: number;
  current: SkillScores;
  delta: SkillScores;
  /**
   * Personal rolling baseline — replaces the fixed 1800/2100 reference
   * lines from the old design. Defined as the mean of all buckets
   * EXCLUDING the most recent 10 (i.e. "your past self"). When fewer
   * than 20 buckets exist, falls back to the overall mean. Empty when
   * there are no games at all.
   */
  baseline: SkillScores;
  ratingMin: number;
  ratingMax: number;
}

export function computeAnalytics(args: {
  username: string;
  games: Game[];
  analyses: Map<number, GameAnalysis>;
}): AnalyticsSummary {
  const { username, games, analyses } = args;
  const buckets: AnalyticsBucket[] = [];
  let wins = 0,
    draws = 0,
    losses = 0;

  // Sort oldest -> newest for chart continuity.
  const sortedGames = [...games].sort((a, b) => {
    const at = (a.playedAt ?? a.createdAt).getTime();
    const bt = (b.playedAt ?? b.createdAt).getTime();
    return at - bt;
  });

  for (const g of sortedGames) {
    const ourColor = (g.whitePlayer ?? "").toLowerCase() === username.toLowerCase() ? "white" : "black";
    const ourRating = ourColor === "white" ? g.whiteRating ?? 1500 : g.blackRating ?? 1500;
    const result = resultFor(g.result, ourColor);
    if (result === "W") wins++;
    else if (result === "D") draws++;
    else losses++;

    const analysis = analyses.get(g.id);
    const scores = scoreGame({ analysis, ourColor, result, opening: g.opening ?? null, ourRating });
    buckets.push({
      date: (g.playedAt ?? g.createdAt).toISOString(),
      rating: ourRating,
      scores,
      result,
      ourColor,
    });
  }

  const current = average(buckets.slice(-10).map((b) => b.scores)) ?? zero();
  const previous = average(buckets.slice(-20, -10).map((b) => b.scores)) ?? current;
  const delta: SkillScores = {
    advantageCapitalization: current.advantageCapitalization - previous.advantageCapitalization,
    opening: current.opening - previous.opening,
    tactics: current.tactics - previous.tactics,
    timeManagement: current.timeManagement - previous.timeManagement,
    resourcefulness: current.resourcefulness - previous.resourcefulness,
    endgame: current.endgame - previous.endgame,
  };

  // Personal baseline = your past self. When we have a meaningful past
  // (>=20 buckets) we exclude the most recent 10 so "current" can drift
  // away from it; otherwise the baseline is the overall mean so the
  // chart still has a reference line.
  const baseline =
    buckets.length >= 20
      ? average(buckets.slice(0, -10).map((b) => b.scores)) ?? current
      : average(buckets.map((b) => b.scores)) ?? current;

  const ratings = buckets.map((b) => b.rating);
  return {
    buckets,
    wins,
    draws,
    losses,
    current,
    delta,
    baseline,
    ratingMin: ratings.length ? Math.min(...ratings) - 50 : 1500,
    ratingMax: ratings.length ? Math.max(...ratings) + 50 : 2200,
  };
}

function resultFor(result: string | null, ourColor: "white" | "black"): "W" | "D" | "L" {
  if (!result || result === "*") return "D";
  if (result === "1/2-1/2") return "D";
  if (result === "1-0") return ourColor === "white" ? "W" : "L";
  if (result === "0-1") return ourColor === "black" ? "W" : "L";
  return "D";
}

function scoreGame(args: {
  analysis?: GameAnalysis;
  ourColor: "white" | "black";
  result: "W" | "D" | "L";
  opening: string | null;
  ourRating: number;
}): SkillScores {
  const baseline = Math.max(800, Math.min(2500, args.ourRating));

  if (!args.analysis) {
    // Without engine analysis, lean on result + rating with mild noise.
    const wlAdj = args.result === "W" ? 80 : args.result === "L" ? -60 : 0;
    return {
      advantageCapitalization: baseline + wlAdj,
      opening: baseline + (args.opening ? 40 : -10),
      tactics: baseline + wlAdj,
      timeManagement: baseline,
      resourcefulness: baseline + (args.result !== "L" ? 20 : -20),
      endgame: baseline + wlAdj * 0.5,
    };
  }

  const moves = (args.analysis.moveAnalysis as { isWhite: boolean; cpl: number; ply: number; quality: string }[] | null) ?? [];
  const ours = moves.filter((m) => (args.ourColor === "white" ? m.isWhite : !m.isWhite));
  if (ours.length === 0) return zeroAt(baseline);

  const phase = (start: number, end: number) =>
    ours.filter((m) => m.ply >= start && m.ply <= end);
  const opening = phase(1, 16);
  const middle = phase(17, 60);
  const endgame = phase(61, 999);

  const accFromCpl = (cpl: number) =>
    Math.max(0, 103.1668 * Math.exp(-0.04354 * cpl) - 3.1669);

  const blunderRate = ours.filter((m) => m.quality === "blunder" || m.quality === "mistake").length / ours.length;
  const brilliantCount = ours.filter((m) => m.quality === "brilliant" || m.quality === "great").length;

  const openingAcc = accFromCpl(meanCpl(opening));
  const middleAcc = accFromCpl(meanCpl(middle));
  const endgameAcc = accFromCpl(meanCpl(endgame));
  const overallAcc = accFromCpl(meanCpl(ours));

  return {
    advantageCapitalization: baseline + (args.result === "W" ? overallAcc * 5 : -blunderRate * 400),
    opening: baseline + (openingAcc - 70) * 6,
    tactics: baseline + brilliantCount * 50 - blunderRate * 300,
    timeManagement: baseline + (overallAcc - 70) * 4,
    resourcefulness: baseline + (args.result !== "L" ? overallAcc * 3 : -200),
    endgame: baseline + (endgameAcc - 70) * 6,
  };
}

function meanCpl(arr: { cpl: number }[]): number {
  if (arr.length === 0) return 30;
  return arr.reduce((s, m) => s + m.cpl, 0) / arr.length;
}

function average(scores: SkillScores[]): SkillScores | null {
  if (scores.length === 0) return null;
  const sum = scores.reduce<SkillScores>(
    (acc, s) => ({
      advantageCapitalization: acc.advantageCapitalization + s.advantageCapitalization,
      opening: acc.opening + s.opening,
      tactics: acc.tactics + s.tactics,
      timeManagement: acc.timeManagement + s.timeManagement,
      resourcefulness: acc.resourcefulness + s.resourcefulness,
      endgame: acc.endgame + s.endgame,
    }),
    zero(),
  );
  const n = scores.length;
  return {
    advantageCapitalization: Math.round(sum.advantageCapitalization / n),
    opening: Math.round(sum.opening / n),
    tactics: Math.round(sum.tactics / n),
    timeManagement: Math.round(sum.timeManagement / n),
    resourcefulness: Math.round(sum.resourcefulness / n),
    endgame: Math.round(sum.endgame / n),
  };
}

function zero(): SkillScores {
  return {
    advantageCapitalization: 0,
    opening: 0,
    tactics: 0,
    timeManagement: 0,
    resourcefulness: 0,
    endgame: 0,
  };
}

function zeroAt(v: number): SkillScores {
  return {
    advantageCapitalization: v,
    opening: v,
    tactics: v,
    timeManagement: v,
    resourcefulness: v,
    endgame: v,
  };
}
