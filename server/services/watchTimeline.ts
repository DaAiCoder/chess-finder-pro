/**
 * Watch timeline: script director (long-form hybrid) + edge-tts prerender + eval fill.
 */

import { storage } from "../storage.js";
import { stockfish } from "./stockfish.js";
import type { NarrationCaption } from "./narration.js";
import { buildScript, SCRIPT_DIRECTOR_VERSION } from "./scriptDirector.js";
import { prerenderWatchCaptions } from "./watchAudio.js";
import type { LibraryGame } from "../../shared/schema.js";

export interface TimelineAlternate {
  uci: string;
  san?: string;
  cp?: number | null;
  mateIn?: number | null;
  pvSan?: string;
}

export interface TimelinePosition {
  fen: string;
  san: string;
  uci?: string;
  evalCp?: number | null;
  mateIn?: number | null;
  bestMoveUci?: string | null;
  alternates?: TimelineAlternate[];
}

export interface TimelineArrow {
  ply: number;
  orig: string;
  dest: string;
  brush?: "green" | "red" | "blue" | "yellow";
}

export interface WatchTimelinePayload {
  title: string;
  subtitle?: string;
  white?: string;
  black?: string;
  result?: string;
  positions: TimelinePosition[];
  captions: NarrationCaption[];
  arrows: TimelineArrow[];
  introHoldS: number;
  perMoveSecondsAt1x: number;
  outroHoldS: number;
  totalDurationS: number;
  targetDurationS: number;
  introEndS?: number;
  outroStartS?: number;
  plyTimeStarts?: number[];
  meta: {
    libraryGameId: number;
    plyCount: number;
    tier: string;
    source: string;
    opening?: string;
    event?: string;
    playedAt?: string;
  };
}

const DEFAULT_TARGET_S = 25 * 60;
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; value: WatchTimelinePayload }>();

function cacheKey(gameId: number, target: number, voice: string): string {
  return `${gameId}|${target}|v${SCRIPT_DIRECTOR_VERSION}|${voice}`;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export async function buildTimeline(
  gameId: number,
  opts: {
    llmPolish?: boolean;
    targetDurationS?: number;
    /** aria | guy | ryan or full edge voice name */
    voice?: string;
  } = {},
): Promise<WatchTimelinePayload | null> {
  void opts.llmPolish; // script path is deterministic; LLM polish hook reserved

  const targetDurationS = clamp(
    opts.targetDurationS ??
      Number(process.env.WATCH_TARGET_DURATION_SECONDS ?? DEFAULT_TARGET_S),
    10 * 60,
    90 * 60,
  );
  const voice = opts.voice ?? process.env.WATCH_TTS_VOICE_NAME ?? "aria";
  const key = cacheKey(gameId, targetDurationS, voice);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const game = await storage.getLibraryGame(gameId);
  if (!game) return null;

  const script = await buildScript(game, { targetDurationS });
  const lastPly = Math.max(0, script.positions.length - 1);

  let captions = await prerenderWatchCaptions(script.captions, voice);

  const totalDurationS = Math.max(
    captions.reduce((m, c) => Math.max(m, c.tEnd), 0),
    script.totalDurationS,
  );

  await forwardFillEvals(script.positions as TimelinePosition[]);

  const firstMovePly1 = captions.find((c) => c.kind === "move" && c.ply === 1);
  const introEndS = firstMovePly1?.tStart ?? script.introEndS;
  const outroCap = [...captions].reverse().find((c) => c.kind === "outro");
  const outroStartS = outroCap?.tStart ?? Math.max(0, totalDurationS - script.outroHoldS);

  const introHoldS = introEndS;
  const outroHoldS = Math.max(0.5, totalDurationS - outroStartS);
  const perMoveSecondsAt1x =
    lastPly > 0 ? (totalDurationS - introHoldS - outroHoldS) / lastPly : totalDurationS;

  const plyTimeStarts = computePlyTimeStarts(captions, lastPly);

  const arrows: TimelineArrow[] = [];
  for (const ply of script.criticalPlies) {
    const p = script.positions[ply];
    if (p?.uci) {
      arrows.push({
        ply,
        orig: p.uci.slice(0, 2),
        dest: p.uci.slice(2, 4),
        brush: "red",
      });
    }
  }

  const payload: WatchTimelinePayload = {
    title: game.whitePlayer && game.blackPlayer ? `${game.whitePlayer} vs ${game.blackPlayer}` : "Game",
    subtitle: subtitleFor(game),
    white: game.whitePlayer ?? undefined,
    black: game.blackPlayer ?? undefined,
    result: game.result ?? undefined,
    positions: script.positions as TimelinePosition[],
    captions,
    arrows,
    introHoldS,
    perMoveSecondsAt1x,
    outroHoldS,
    totalDurationS,
    targetDurationS,
    introEndS,
    outroStartS,
    plyTimeStarts,
    meta: {
      libraryGameId: game.id,
      plyCount: script.plyCount,
      tier: game.tier,
      source: game.source,
      opening: game.opening ?? undefined,
      event: game.event ?? undefined,
      playedAt: game.playedAt ? new Date(game.playedAt).toISOString() : undefined,
    },
  };
  cache.set(key, { at: Date.now(), value: payload });
  return payload;
}

function computePlyTimeStarts(captions: NarrationCaption[], lastPly: number): number[] {
  const out: number[] = Array.from({ length: lastPly + 1 }, () => Number.POSITIVE_INFINITY);
  out[0] = 0;
  for (const c of captions) {
    if (c.kind === "move" && c.ply >= 1 && c.ply <= lastPly) {
      out[c.ply] = Math.min(out[c.ply]!, c.tStart);
    }
  }
  for (let i = 1; i <= lastPly; i++) {
    const v = out[i]!;
    out[i] = Number.isFinite(v) ? Math.max(out[i - 1]!, v) : out[i - 1]!;
  }
  return out;
}

async function forwardFillEvals(positions: TimelinePosition[]): Promise<void> {
  let lastCp: number | null = 0;
  let lastMate: number | null = null;
  try {
    const ev = await stockfish.evaluate(positions[0]!.fen, 6, 2500);
    lastCp = ev.evaluation;
    lastMate = ev.mateIn;
  } catch {
    lastCp = 0;
  }
  positions[0]!.evalCp = positions[0]!.evalCp ?? lastCp;
  positions[0]!.mateIn = positions[0]!.mateIn ?? lastMate;
  for (let i = 1; i < positions.length; i++) {
    const p = positions[i]!;
    if (p.evalCp != null || p.mateIn != null) {
      lastCp = p.evalCp ?? lastCp;
      lastMate = p.mateIn ?? lastMate;
    }
    p.evalCp = p.evalCp ?? lastCp;
    p.mateIn = p.mateIn ?? lastMate;
  }
}

export function invalidateTimeline(gameId?: number): void {
  if (gameId == null) {
    cache.clear();
    return;
  }
  for (const k of [...cache.keys()]) {
    if (k.startsWith(`${gameId}|`)) cache.delete(k);
  }
}

function subtitleFor(g: LibraryGame): string | undefined {
  const parts: string[] = [];
  if (g.event) parts.push(g.event);
  if (g.playedAt) parts.push(new Date(g.playedAt).getFullYear().toString());
  if (g.eco) parts.push(`ECO ${g.eco}`);
  if (g.opening) parts.push(g.opening);
  return parts.length ? parts.join(" · ") : undefined;
}
