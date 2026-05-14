/**
 * Comprehensive opponent scouting analyzer.
 *
 * Builds a thorough scouting report from a sample of an opponent's games:
 *
 *  - Profile + sample stats (size, date range, color split)
 *  - WDL per color with absolute counts
 *  - Recent form: rating trajectory bucketed by month, current streak,
 *    last-N games strip
 *  - Opening tree (deeper than the old version, with WDL per node)
 *  - Pet lines (count >= petThreshold) and surprise lines (count <=
 *    surpriseThreshold) — useful to know what they've prepared vs where
 *    they're improvising.
 *  - Repertoire shifts: monthly opening counts so we can see "switched
 *    from 1.e4 to 1.d4 in March".
 *  - Critical positions: most-reached non-trivial FENs (after move 8) so
 *    you know the middlegame structures they keep getting.
 *  - Head-to-head: top opponents they've played, with W/D/L records.
 *  - Recommendations: openings where the scouted player scores poorly
 *    (sample size >= 3) — these are the lines you should aim for.
 */

import { Chess } from "chess.js";
import type { Game } from "../../shared/schema.js";
import type { PlayerProfile } from "./playerProfile.js";

export interface OpeningNode {
  move: string;
  san: string;
  count: number;
  wins: number;
  draws: number;
  losses: number;
  /** FEN reached AFTER this move was played. Used by the explorer to draw a board. */
  fen: string;
  children: Record<string, OpeningNode>;
}

export interface WDL {
  games: number;
  wins: number;
  draws: number;
  losses: number;
  score: number; // 0..1
}

export interface RecentGameSummary {
  id: number;
  pgn: string;
  result: string | null;
  color: "white" | "black";
  opponent: string;
  opponentRating: number | null;
  myRating: number | null;
  opening: string | null;
  eco: string | null;
  timeControl: string | null;
  playedAt: string | null;
  /** 1 win / 0.5 draw / 0 loss for the scouted player (or 0.5 if unknown). */
  myScore: number;
}

export interface RatingTrajectoryPoint {
  /** YYYY-MM */
  month: string;
  avgRating: number;
  games: number;
}

export interface H2HEntry {
  opponent: string;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  score: number;
  lastPlayed: string | null;
}

export interface CriticalPosition {
  fen: string;
  count: number;
  /** Score from the scouted player's perspective. */
  score: number;
  /** Move number when this position was first reached. */
  moveNumber: number;
}

export interface OpeningRecord {
  name: string;
  count: number;
  wins: number;
  draws: number;
  losses: number;
  score: number;
}

export interface RepertoireShift {
  month: string; // YYYY-MM
  /** Top 3 most-played first moves that month (san → count). */
  topMoves: { san: string; count: number }[];
}

export interface ScoutingRecommendation {
  /** What to play against him (opening name from the data). */
  opening: string;
  reason: string;
  sample: number;
  oppScore: number; // 0..1 — lower means he struggles
  color: "white" | "black"; // your color when this opening is played
}

export interface ScoutReport {
  /** Stable id derived from username + platform. */
  id: string;
  profile: PlayerProfile;
  generatedAt: string; // ISO
  sample: {
    total: number;
    asWhite: number;
    asBlack: number;
    dateFrom: string | null;
    dateTo: string | null;
  };
  wdl: {
    overall: WDL;
    asWhite: WDL;
    asBlack: WDL;
    /** Per time control. */
    byTimeControl: Record<string, WDL>;
  };
  /** Last N games (most recent first). */
  recent: RecentGameSummary[];
  /** Current win/loss/draw streak (most recent contiguous). */
  currentStreak: { type: "W" | "L" | "D" | "none"; length: number };
  ratingTrajectory: RatingTrajectoryPoint[];
  /** Bucketed by month. */
  repertoireShifts: RepertoireShift[];
  openingTreeWhite: OpeningNode;
  openingTreeBlack: OpeningNode;
  /** Openings the player has at least N games in (well-prepared). */
  petLines: OpeningRecord[];
  /** Openings the player has only 1-2 games in (surprises / improvisations). */
  surpriseLines: OpeningRecord[];
  /** Most-reached non-trivial positions. */
  criticalPositions: CriticalPosition[];
  /** Top opponents by game count. */
  headToHead: H2HEntry[];
  /** Suggested openings to aim for vs this player. */
  recommendations: ScoutingRecommendation[];
}

/* ====================================================================== */
/*  Public                                                                 */
/* ====================================================================== */

export function buildScoutReport(args: {
  profile: PlayerProfile;
  games: Game[];
}): ScoutReport {
  const { profile, games } = args;
  const lower = profile.username.toLowerCase();

  // -------- sample stats
  const whiteGames = games.filter(
    (g) => (g.whitePlayer ?? "").toLowerCase() === lower,
  );
  const blackGames = games.filter(
    (g) => (g.blackPlayer ?? "").toLowerCase() === lower,
  );

  // Sort all by date desc for "recent" + streak.
  const allByDateDesc = [...games].sort(
    (a, b) =>
      (b.playedAt?.getTime?.() ?? 0) - (a.playedAt?.getTime?.() ?? 0),
  );
  const dates = games
    .map((g) => g.playedAt?.getTime() ?? 0)
    .filter((t) => t > 0);
  const dateFrom = dates.length ? new Date(Math.min(...dates)).toISOString() : null;
  const dateTo = dates.length ? new Date(Math.max(...dates)).toISOString() : null;

  // -------- WDL per dimension
  const wdlOverall = computeWDL(games, lower);
  const wdlWhite = computeWDL(whiteGames, lower);
  const wdlBlack = computeWDL(blackGames, lower);
  const byTimeControl = bucketBy(games, (g) => g.timeControl ?? "unknown", lower);

  // -------- Recent + streak
  const recent: RecentGameSummary[] = allByDateDesc.slice(0, 20).map((g) => {
    const myColor: "white" | "black" =
      (g.whitePlayer ?? "").toLowerCase() === lower ? "white" : "black";
    return {
      id: g.id,
      pgn: g.pgn,
      result: g.result,
      color: myColor,
      opponent: myColor === "white" ? g.blackPlayer ?? "?" : g.whitePlayer ?? "?",
      opponentRating: myColor === "white" ? g.blackRating : g.whiteRating,
      myRating: myColor === "white" ? g.whiteRating : g.blackRating,
      opening: g.opening,
      eco: g.eco,
      timeControl: g.timeControl,
      playedAt: g.playedAt?.toISOString() ?? null,
      myScore: scoreOne(g.result, myColor),
    };
  });
  const currentStreak = computeStreak(recent);

  // -------- Rating trajectory (monthly avg of player's rating)
  const ratingTrajectory = computeRatingTrajectory(games, lower);

  // -------- Opening trees
  const openingTreeWhite = buildOpeningTree(whiteGames, "white", 14);
  const openingTreeBlack = buildOpeningTree(blackGames, "black", 14);

  // -------- Opening records (named ECO/Opening header)
  const named = aggregateNamedOpenings(games, lower);
  const sortedByCount = [...named].sort((a, b) => b.count - a.count);
  const petLines = sortedByCount.filter((o) => o.count >= 5).slice(0, 12);
  const surpriseLines = sortedByCount.filter((o) => o.count <= 2).slice(0, 8);

  // -------- Repertoire shifts (monthly top moves played as white)
  const repertoireShifts = computeRepertoireShifts(whiteGames);

  // -------- Critical positions (most-reached FENs after move 8)
  const criticalPositions = computeCriticalPositions(games, lower, 8);

  // -------- H2H
  const headToHead = computeH2H(games, lower);

  // -------- Recommendations
  const recommendations = computeRecommendations(named, whiteGames, blackGames, lower);

  return {
    id: `${profile.platform}:${lower}`,
    profile,
    generatedAt: new Date().toISOString(),
    sample: {
      total: games.length,
      asWhite: whiteGames.length,
      asBlack: blackGames.length,
      dateFrom,
      dateTo,
    },
    wdl: {
      overall: wdlOverall,
      asWhite: wdlWhite,
      asBlack: wdlBlack,
      byTimeControl,
    },
    recent,
    currentStreak,
    ratingTrajectory,
    repertoireShifts,
    openingTreeWhite,
    openingTreeBlack,
    petLines,
    surpriseLines,
    criticalPositions,
    headToHead,
    recommendations,
  };
}

/* ====================================================================== */
/*  Internals                                                              */
/* ====================================================================== */

function computeWDL(games: Game[], scoutedLower: string): WDL {
  let wins = 0,
    draws = 0,
    losses = 0;
  for (const g of games) {
    const color: "white" | "black" =
      (g.whitePlayer ?? "").toLowerCase() === scoutedLower ? "white" : "black";
    const r = scoreOne(g.result, color);
    if (r === 1) wins++;
    else if (r === 0) losses++;
    else draws++;
  }
  const games_ = wins + draws + losses;
  return {
    games: games_,
    wins,
    draws,
    losses,
    score: games_ ? (wins + draws * 0.5) / games_ : 0,
  };
}

function bucketBy(
  games: Game[],
  keyFn: (g: Game) => string,
  scoutedLower: string,
): Record<string, WDL> {
  const buckets = new Map<string, Game[]>();
  for (const g of games) {
    const k = keyFn(g);
    const arr = buckets.get(k) ?? [];
    arr.push(g);
    buckets.set(k, arr);
  }
  const out: Record<string, WDL> = {};
  for (const [k, arr] of buckets) out[k] = computeWDL(arr, scoutedLower);
  return out;
}

function scoreOne(result: string | null, color: "white" | "black"): number {
  if (!result || result === "*") return 0.5;
  if (result === "1/2-1/2") return 0.5;
  if (result === "1-0") return color === "white" ? 1 : 0;
  if (result === "0-1") return color === "black" ? 1 : 0;
  return 0.5;
}

function computeStreak(
  recent: RecentGameSummary[],
): { type: "W" | "L" | "D" | "none"; length: number } {
  if (recent.length === 0) return { type: "none", length: 0 };
  const first = recent[0].myScore;
  const t: "W" | "L" | "D" = first === 1 ? "W" : first === 0 ? "L" : "D";
  let len = 0;
  for (const g of recent) {
    const cur = g.myScore === 1 ? "W" : g.myScore === 0 ? "L" : "D";
    if (cur === t) len++;
    else break;
  }
  return { type: t, length: len };
}

function computeRatingTrajectory(
  games: Game[],
  scoutedLower: string,
): RatingTrajectoryPoint[] {
  const buckets = new Map<string, { sum: number; count: number }>();
  for (const g of games) {
    if (!g.playedAt) continue;
    const r =
      (g.whitePlayer ?? "").toLowerCase() === scoutedLower
        ? g.whiteRating
        : g.blackRating;
    if (!r) continue;
    const d = g.playedAt;
    const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const cur = buckets.get(month) ?? { sum: 0, count: 0 };
    cur.sum += r;
    cur.count += 1;
    buckets.set(month, cur);
  }
  return Array.from(buckets.entries())
    .map(([month, b]) => ({
      month,
      avgRating: Math.round(b.sum / b.count),
      games: b.count,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

function buildOpeningTree(
  games: Game[],
  color: "white" | "black",
  maxPlies: number,
): OpeningNode {
  const root: OpeningNode = {
    move: "",
    san: "",
    count: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    children: {},
  };
  for (const g of games) {
    let chess: Chess;
    try {
      chess = new Chess();
      chess.loadPgn(g.pgn);
    } catch {
      continue;
    }
    const moves = chess.history({ verbose: true }).slice(0, maxPlies);
    let node = root;
    node.count++;
    addResult(node, g.result, color);
    const replay = new Chess();
    for (const m of moves) {
      replay.move({ from: m.from, to: m.to, promotion: m.promotion });
      const key = m.san;
      if (!node.children[key]) {
        node.children[key] = {
          move: `${m.from}${m.to}`,
          san: m.san,
          count: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          fen: replay.fen(),
          children: {},
        };
      }
      node = node.children[key];
      node.count++;
      addResult(node, g.result, color);
    }
  }
  return root;
}

function addResult(node: OpeningNode, result: string | null, color: "white" | "black") {
  const r = scoreOne(result, color);
  if (r === 1) node.wins++;
  else if (r === 0) node.losses++;
  else node.draws++;
}

function aggregateNamedOpenings(games: Game[], scoutedLower: string): OpeningRecord[] {
  const map = new Map<
    string,
    { count: number; wins: number; draws: number; losses: number }
  >();
  for (const g of games) {
    const name = g.opening ?? `Unknown (${g.eco ?? "—"})`;
    const color: "white" | "black" =
      (g.whitePlayer ?? "").toLowerCase() === scoutedLower ? "white" : "black";
    const cur = map.get(name) ?? { count: 0, wins: 0, draws: 0, losses: 0 };
    cur.count++;
    const r = scoreOne(g.result, color);
    if (r === 1) cur.wins++;
    else if (r === 0) cur.losses++;
    else cur.draws++;
    map.set(name, cur);
  }
  return Array.from(map.entries()).map(([name, s]) => ({
    name,
    ...s,
    score: s.count ? (s.wins + s.draws * 0.5) / s.count : 0,
  }));
}

function computeRepertoireShifts(whiteGames: Game[]): RepertoireShift[] {
  const buckets = new Map<string, Map<string, number>>();
  for (const g of whiteGames) {
    if (!g.playedAt) continue;
    let chess: Chess;
    try {
      chess = new Chess();
      chess.loadPgn(g.pgn);
    } catch {
      continue;
    }
    const first = chess.history()[0];
    if (!first) continue;
    const d = g.playedAt;
    const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const inner = buckets.get(month) ?? new Map<string, number>();
    inner.set(first, (inner.get(first) ?? 0) + 1);
    buckets.set(month, inner);
  }
  return Array.from(buckets.entries())
    .map(([month, inner]) => ({
      month,
      topMoves: Array.from(inner.entries())
        .map(([san, count]) => ({ san, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3),
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

function computeCriticalPositions(
  games: Game[],
  scoutedLower: string,
  startPly: number,
): CriticalPosition[] {
  const counts = new Map<string, { count: number; wins: number; draws: number; losses: number; firstPly: number }>();
  for (const g of games) {
    let chess: Chess;
    try {
      chess = new Chess();
      chess.loadPgn(g.pgn);
    } catch {
      continue;
    }
    const moves = chess.history({ verbose: true });
    const replay = new Chess();
    const seen = new Set<string>();
    for (let i = 0; i < moves.length && i < 30; i++) {
      const m = moves[i];
      replay.move({ from: m.from, to: m.to, promotion: m.promotion });
      if (i + 1 < startPly) continue;
      // Only count the position once per game.
      const key = replay.fen().split(" ").slice(0, 4).join(" ");
      if (seen.has(key)) continue;
      seen.add(key);
      const color: "white" | "black" =
        (g.whitePlayer ?? "").toLowerCase() === scoutedLower ? "white" : "black";
      const r = scoreOne(g.result, color);
      const cur = counts.get(key) ?? { count: 0, wins: 0, draws: 0, losses: 0, firstPly: i + 1 };
      cur.count++;
      if (r === 1) cur.wins++;
      else if (r === 0) cur.losses++;
      else cur.draws++;
      counts.set(key, cur);
    }
  }
  return Array.from(counts.entries())
    .filter(([_, v]) => v.count >= 3)
    .map(([fen, v]) => ({
      fen: fen + " - 0 1",
      count: v.count,
      score: v.count ? (v.wins + v.draws * 0.5) / v.count : 0,
      moveNumber: Math.ceil(v.firstPly / 2),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);
}

function computeH2H(games: Game[], scoutedLower: string): H2HEntry[] {
  const map = new Map<
    string,
    { games: number; wins: number; draws: number; losses: number; lastPlayed: number }
  >();
  for (const g of games) {
    const color: "white" | "black" =
      (g.whitePlayer ?? "").toLowerCase() === scoutedLower ? "white" : "black";
    const opponent = color === "white" ? g.blackPlayer : g.whitePlayer;
    if (!opponent) continue;
    const key = opponent;
    const cur = map.get(key) ?? { games: 0, wins: 0, draws: 0, losses: 0, lastPlayed: 0 };
    cur.games++;
    const r = scoreOne(g.result, color);
    if (r === 1) cur.wins++;
    else if (r === 0) cur.losses++;
    else cur.draws++;
    if (g.playedAt) cur.lastPlayed = Math.max(cur.lastPlayed, g.playedAt.getTime());
    map.set(key, cur);
  }
  return Array.from(map.entries())
    .map(([opponent, s]) => ({
      opponent,
      games: s.games,
      wins: s.wins,
      draws: s.draws,
      losses: s.losses,
      score: s.games ? (s.wins + s.draws * 0.5) / s.games : 0,
      lastPlayed: s.lastPlayed ? new Date(s.lastPlayed).toISOString() : null,
    }))
    .filter((h) => h.games >= 2)
    .sort((a, b) => b.games - a.games)
    .slice(0, 15);
}

function computeRecommendations(
  named: OpeningRecord[],
  whiteGames: Game[],
  blackGames: Game[],
  scoutedLower: string,
): ScoutingRecommendation[] {
  // Find openings where opponent scored < 0.45 with sample >= 4.
  // Tag the color YOU should play (= the color the opponent did NOT play).
  const recs: ScoutingRecommendation[] = [];
  for (const o of named) {
    if (o.count < 4) continue;
    if (o.score >= 0.45) continue;
    // Determine which color the opponent usually played in this opening.
    const inWhite = whiteGames.filter((g) => g.opening === o.name).length;
    const inBlack = blackGames.filter((g) => g.opening === o.name).length;
    const playedAs: "white" | "black" = inWhite >= inBlack ? "white" : "black";
    const youPlay: "white" | "black" = playedAs === "white" ? "black" : "white";
    const reason =
      o.score < 0.3
        ? `Loses ${Math.round((1 - o.score) * 100)}% in this line over ${o.count} games`
        : `Underperforms (${Math.round(o.score * 100)}% score) over ${o.count} games`;
    recs.push({
      opening: o.name,
      reason,
      sample: o.count,
      oppScore: o.score,
      color: youPlay,
    });
    void scoutedLower;
  }
  return recs.sort((a, b) => a.oppScore - b.oppScore).slice(0, 8);
}
