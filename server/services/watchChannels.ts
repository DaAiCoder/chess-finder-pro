/**
 * Watch channels — curated YouTube-style playlists drawn from the
 * existing `library_games` table.
 *
 * Each channel is just a saved query over the library + some
 * presentational metadata. Lookups are cached for a few minutes since
 * the library doesn't churn often.
 *
 * The channel registry below is the single source of truth for what
 * appears on `/watch` and powers `/api/watch/channels/:slug`.
 */

import { storage } from "../storage.js";
import type { LibraryGame, LibraryTier } from "../../shared/schema.js";

export interface WatchChannelDef {
  slug: string;
  title: string;
  description: string;
  /** Tailwind-ish gradient pair used as the card banner background. */
  accent: { from: string; to: string };
  /** Hero "presenter" name shown on the channel card. */
  presenter?: string;
  /** Filter applied against `library_games`. */
  filter: {
    /** Library tier(s) to match. */
    tiers?: LibraryTier[];
    /** Library sources to include. */
    sources?: LibraryGame["source"][];
    /** Substring match against either white or black player. */
    playerLike?: string;
    /** Substring match against `event`. */
    eventLike?: string;
    /** ECO prefix list (e.g. ["B90", "B91"]). */
    ecoPrefixes?: string[];
    /** Minimum number of plies (filters out crushed minigames). */
    minPly?: number;
    /** Required avg rating floor for both sides. */
    minAvgRating?: number;
    /** Required result. */
    result?: "1-0" | "0-1" | "1/2-1/2";
    /** Cap on channel size — useful for "Top 50" style feeds. */
    limit?: number;
  };
}

/**
 * Registry. Order matters — first match wins for "Featured" placement on
 * the channels grid. Keep ~10 channels max; if we get more, fold them
 * into themed sub-pages.
 */
export const WATCH_CHANNELS: WatchChannelDef[] = [
  {
    slug: "carlsen-best",
    title: "Magnus Carlsen — Best Games",
    description:
      "The World Champion at his sharpest. Decisive wins as both colors with at least 25 moves.",
    accent: { from: "#0ea5e9", to: "#1e293b" },
    presenter: "Carlsen",
    filter: {
      playerLike: "carlsen",
      minPly: 50,
      tiers: ["masters"],
      limit: 60,
    },
  },
  {
    slug: "tal-attacks",
    title: "Mikhail Tal — Magician of Riga",
    description:
      "Tal's iconic sacrifices, attacks, and queenside cavalry charges.",
    accent: { from: "#d97706", to: "#7c2d12" },
    presenter: "Tal",
    filter: {
      playerLike: "tal",
      minPly: 40,
      tiers: ["masters"],
      limit: 60,
    },
  },
  {
    slug: "kasparov-attacks",
    title: "Garry Kasparov — Master of the Initiative",
    description:
      "Kasparov in full flight — opening preparation meets relentless attack.",
    accent: { from: "#7c3aed", to: "#1e1b4b" },
    presenter: "Kasparov",
    filter: {
      playerLike: "kasparov",
      minPly: 50,
      tiers: ["masters"],
      limit: 60,
    },
  },
  {
    slug: "fischer-classics",
    title: "Bobby Fischer — American Classics",
    description:
      "Crystal-clear classical games from the '60s and '70s, including the Game of the Century.",
    accent: { from: "#dc2626", to: "#1f2937" },
    presenter: "Fischer",
    filter: { playerLike: "fischer", minPly: 40, tiers: ["masters"], limit: 60 },
  },
  {
    slug: "world-championships",
    title: "World Championships",
    description:
      "Decisive games from the highest-stakes matches in chess history.",
    accent: { from: "#facc15", to: "#7c2d12" },
    filter: {
      eventLike: "championship",
      minPly: 30,
      tiers: ["masters"],
      limit: 80,
    },
  },
  {
    slug: "morphy-fischer-romantics",
    title: "Romantic Era — Morphy & friends",
    description:
      "Pre-modern attacking masterpieces where development > pawn structure.",
    accent: { from: "#a16207", to: "#1c1917" },
    filter: {
      playerLike: "morphy",
      minPly: 20,
      tiers: ["masters"],
      limit: 60,
    },
  },
  {
    slug: "endgame-magic",
    title: "Endgame Magic",
    description:
      "Master-level technique from 40+ move conversions — Karpov, Smyslov, Capablanca.",
    accent: { from: "#059669", to: "#1f2937" },
    filter: { minPly: 90, tiers: ["masters"], limit: 60 },
  },
  {
    slug: "engine-classics",
    title: "Computer Classics",
    description:
      "Famous engine matches: AlphaZero vs Stockfish, Kasparov vs Deep Blue, and TCEC superfinals.",
    accent: { from: "#0f766e", to: "#0c1e1e" },
    // Only curated bundles — live in-app engine matches go in their own
    // channel below.
    filter: {
      tiers: ["engine"],
      sources: ["pgn", "chessbase", "broadcast"],
      minPly: 20,
      limit: 60,
    },
  },
  {
    slug: "engine-matches-mine",
    title: "My Engine Matches",
    description:
      "Stockfish self-play matches you started in the Computer vs Computer studio.",
    accent: { from: "#475569", to: "#0f172a" },
    filter: { sources: ["engine-match"], limit: 60 },
  },
];

/* ---------------------------------------------------------------------- */
/* Cache                                                                  */
/* ---------------------------------------------------------------------- */

interface ChannelEpisode {
  id: number;
  whitePlayer: string | null;
  blackPlayer: string | null;
  whiteRating: number | null;
  blackRating: number | null;
  result: string | null;
  eco: string | null;
  opening: string | null;
  event: string | null;
  playedAt: string | null;
  plyCount: number;
  tier: string;
  /** Mid-game FEN used for the channel thumbnail. */
  thumbnailFen: string;
  /** Estimated runtime at 1.0x watch speed (seconds). */
  durationS: number;
}

interface ChannelSummary {
  def: WatchChannelDef;
  count: number;
  /** First few episodes for inline previews on the channel grid. */
  preview: ChannelEpisode[];
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; value: ChannelEpisode[] }>();
const summaryCache = { at: 0, value: [] as ChannelSummary[] };

/* ---------------------------------------------------------------------- */
/* Public API                                                             */
/* ---------------------------------------------------------------------- */

export async function listChannels(): Promise<ChannelSummary[]> {
  if (summaryCache.at && Date.now() - summaryCache.at < CACHE_TTL_MS) {
    return summaryCache.value;
  }
  const out: ChannelSummary[] = [];
  for (const def of WATCH_CHANNELS) {
    const episodes = await getEpisodesCached(def);
    out.push({
      def,
      count: episodes.length,
      preview: episodes.slice(0, 4),
    });
  }
  summaryCache.value = out;
  summaryCache.at = Date.now();
  return out;
}

export async function getChannel(
  slug: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<{ def: WatchChannelDef; episodes: ChannelEpisode[]; total: number } | null> {
  const def = WATCH_CHANNELS.find((c) => c.slug === slug);
  if (!def) return null;
  const all = await getEpisodesCached(def);
  const limit = Math.max(1, Math.min(50, opts.limit ?? 24));
  const offset = Math.max(0, opts.offset ?? 0);
  return {
    def,
    episodes: all.slice(offset, offset + limit),
    total: all.length,
  };
}

export function invalidateChannelCache(slug?: string): void {
  if (slug) cache.delete(slug);
  else cache.clear();
  summaryCache.at = 0;
  summaryCache.value = [];
}

/* ---------------------------------------------------------------------- */
/* Internals                                                              */
/* ---------------------------------------------------------------------- */

async function getEpisodesCached(def: WatchChannelDef): Promise<ChannelEpisode[]> {
  const cached = cache.get(def.slug);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

  const list = await buildEpisodes(def);
  cache.set(def.slug, { at: Date.now(), value: list });
  return list;
}

async function buildEpisodes(def: WatchChannelDef): Promise<ChannelEpisode[]> {
  // Pull a generous candidate pool — the in-memory storage doesn't
  // support all our filter combos in one go, so we fan out per tier
  // and merge in JS.
  const tiers = def.filter.tiers ?? [
    "masters",
    "titled",
    "expert",
    "intermediate",
    "amateur",
    "engine",
    "broadcast",
  ];
  const pool: LibraryGame[] = [];
  for (const tier of tiers) {
    const batch = await storage.listLibraryGames({
      tier,
      limit: 400,
      offset: 0,
    });
    pool.push(...batch);
  }

  const filtered = pool.filter((g) => {
    if (def.filter.sources && !def.filter.sources.includes(g.source)) return false;
    if (def.filter.minPly && g.plyCount < def.filter.minPly) return false;
    if (def.filter.minAvgRating && (g.avgRating ?? 0) < def.filter.minAvgRating) return false;
    if (def.filter.result && g.result !== def.filter.result) return false;
    if (def.filter.eventLike) {
      const ev = (g.event ?? "").toLowerCase();
      if (!ev.includes(def.filter.eventLike.toLowerCase())) return false;
    }
    if (def.filter.ecoPrefixes && def.filter.ecoPrefixes.length > 0) {
      const eco = g.eco ?? "";
      if (!def.filter.ecoPrefixes.some((p) => eco.startsWith(p))) return false;
    }
    if (def.filter.playerLike) {
      const q = def.filter.playerLike.toLowerCase();
      const w = (g.whitePlayer ?? "").toLowerCase();
      const b = (g.blackPlayer ?? "").toLowerCase();
      if (!w.includes(q) && !b.includes(q)) return false;
    }
    return true;
  });

  // Sort: decisive games first, then by date desc, then by ply (more is
  // "richer" content for a Watch episode).
  filtered.sort((a, b) => {
    const da = decisiveRank(a.result);
    const db = decisiveRank(b.result);
    if (da !== db) return db - da;
    const tA = a.playedAt ? new Date(a.playedAt).getTime() : 0;
    const tB = b.playedAt ? new Date(b.playedAt).getTime() : 0;
    if (tA !== tB) return tB - tA;
    return b.plyCount - a.plyCount;
  });

  const cap = def.filter.limit ?? 60;
  return filtered.slice(0, cap).map(toEpisode);
}

function decisiveRank(r: LibraryGame["result"]): number {
  if (r === "1-0" || r === "0-1") return 2;
  if (r === "1/2-1/2") return 1;
  return 0;
}

function toEpisode(g: LibraryGame): ChannelEpisode {
  // The thumbnail is the EPD ~70% through the indexed window. EPDs lack
  // half-clock info but the Chessboard component is happy to render
  // them with "0 1" appended.
  const idx = Math.min(
    g.epds.length - 1,
    Math.max(8, Math.floor(g.epds.length * 0.7)),
  );
  const epd = g.epds[idx] ?? g.epds[0] ?? "";
  const fen = epd ? `${epd} 0 1` : "";
  return {
    id: g.id,
    whitePlayer: g.whitePlayer,
    blackPlayer: g.blackPlayer,
    whiteRating: g.whiteRating,
    blackRating: g.blackRating,
    result: g.result,
    eco: g.eco,
    opening: g.opening,
    event: g.event,
    playedAt: g.playedAt ? new Date(g.playedAt).toISOString() : null,
    plyCount: g.plyCount,
    tier: g.tier,
    thumbnailFen: fen,
    // ~1.6s per ply + 6s intro/outro padding.
    durationS: Math.round(g.plyCount * 1.6 + 6),
  };
}
