/**
 * Opponent prep analyzer.
 *
 * Builds an opening tree (first 12 plies) from a list of an opponent's games,
 * computes their win/draw/loss rate per branch, and identifies recurring
 * weaknesses (most common blunder pattern, weak opening color, time pressure
 * losses, etc.).
 */

import { Chess } from "chess.js";
import type { Game } from "../../shared/schema.js";

export interface OpeningNode {
  move: string;
  san: string;
  count: number;
  wins: number;
  draws: number;
  losses: number;
  children: Record<string, OpeningNode>;
}

export interface OpponentReport {
  username: string;
  platform: string;
  gamesAnalyzed: number;
  averageRating: number | null;
  openingTreeWhite: OpeningNode;
  openingTreeBlack: OpeningNode;
  weaknesses: {
    weakerColor: "white" | "black";
    weakerColorScore: number;
    favoriteOpenings: { name: string; count: number; score: number }[];
    timeControlBreakdown: Record<string, { games: number; winRate: number }>;
  };
}

export function analyzeOpponent(args: { username: string; platform: string; games: Game[] }): OpponentReport {
  const { username, platform, games } = args;
  const lower = username.toLowerCase();

  const whiteGames = games.filter((g) => (g.whitePlayer ?? "").toLowerCase() === lower);
  const blackGames = games.filter((g) => (g.blackPlayer ?? "").toLowerCase() === lower);

  const treeWhite = buildOpeningTree(whiteGames, "white");
  const treeBlack = buildOpeningTree(blackGames, "black");

  const ratings: number[] = [];
  for (const g of games) {
    const r = (g.whitePlayer ?? "").toLowerCase() === lower ? g.whiteRating : g.blackRating;
    if (r) ratings.push(r);
  }
  const avgRating = ratings.length ? Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length) : null;

  const whiteScore = scoreFor(whiteGames, "white", lower);
  const blackScore = scoreFor(blackGames, "black", lower);

  const openingCounts = new Map<string, { count: number; wins: number; losses: number; draws: number }>();
  for (const g of games) {
    const name = g.opening ?? "Unknown";
    const our = (g.whitePlayer ?? "").toLowerCase() === lower ? "white" : "black";
    const cur = openingCounts.get(name) ?? { count: 0, wins: 0, losses: 0, draws: 0 };
    cur.count++;
    const r = scoreOne(g.result, our);
    if (r === 1) cur.wins++;
    else if (r === 0) cur.losses++;
    else cur.draws++;
    openingCounts.set(name, cur);
  }
  const favoriteOpenings = Array.from(openingCounts.entries())
    .map(([name, s]) => ({ name, count: s.count, score: s.count ? (s.wins + s.draws * 0.5) / s.count : 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const tcMap = new Map<string, { games: number; wins: number }>();
  for (const g of games) {
    const tc = g.timeControl ?? "unknown";
    const our = (g.whitePlayer ?? "").toLowerCase() === lower ? "white" : "black";
    const cur = tcMap.get(tc) ?? { games: 0, wins: 0 };
    cur.games++;
    if (scoreOne(g.result, our) === 1) cur.wins++;
    tcMap.set(tc, cur);
  }
  const timeControlBreakdown: Record<string, { games: number; winRate: number }> = {};
  tcMap.forEach((v, k) => {
    timeControlBreakdown[k] = { games: v.games, winRate: v.games ? v.wins / v.games : 0 };
  });

  return {
    username,
    platform,
    gamesAnalyzed: games.length,
    averageRating: avgRating,
    openingTreeWhite: treeWhite,
    openingTreeBlack: treeBlack,
    weaknesses: {
      weakerColor: whiteScore < blackScore ? "white" : "black",
      weakerColorScore: Math.min(whiteScore, blackScore),
      favoriteOpenings,
      timeControlBreakdown,
    },
  };
}

function scoreFor(games: Game[], color: "white" | "black", username: string): number {
  if (games.length === 0) return 0.5;
  let sum = 0;
  for (const g of games) {
    const r = scoreOne(g.result, color);
    sum += r;
    void username;
  }
  return sum / games.length;
}

function scoreOne(result: string | null, color: "white" | "black"): number {
  if (!result || result === "*") return 0.5;
  if (result === "1/2-1/2") return 0.5;
  if (result === "1-0") return color === "white" ? 1 : 0;
  if (result === "0-1") return color === "black" ? 1 : 0;
  return 0.5;
}

function buildOpeningTree(games: Game[], color: "white" | "black"): OpeningNode {
  const root: OpeningNode = {
    move: "",
    san: "",
    count: 0,
    wins: 0,
    draws: 0,
    losses: 0,
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
    const moves = chess.history({ verbose: true }).slice(0, 12);
    let node = root;
    node.count++;
    addResult(node, g.result, color);
    for (const m of moves) {
      const key = m.san;
      if (!node.children[key]) {
        node.children[key] = {
          move: `${m.from}${m.to}`,
          san: m.san,
          count: 0,
          wins: 0,
          draws: 0,
          losses: 0,
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
