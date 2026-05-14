import { CHESS_TUBE_PLAYLISTS } from "./playlists";
import { CHESS_TUBE_VIDEOS } from "./videos";
import type { ChessTubeCategory, ChessTubeItem, ChessTubePlaylist, ChessTubeVideo } from "./types";

export type { ChessTubeCategory, ChessTubeItem, ChessTubePlaylist, ChessTubeVideo } from "./types";
export { CHESS_TUBE_VIDEOS } from "./videos";
export { CHESS_TUBE_PLAYLISTS } from "./playlists";

export const CHESS_TUBE_ITEMS: ChessTubeItem[] = [...CHESS_TUBE_VIDEOS, ...CHESS_TUBE_PLAYLISTS];

export const CHESS_TUBE_CATEGORY_TABS: { id: "all" | ChessTubeCategory; label: string }[] = [
  { id: "all", label: "All" },
  { id: "opening-series", label: "Opening series" },
  { id: "openings", label: "Openings" },
  { id: "tactics", label: "Tactics" },
  { id: "traps", label: "Traps" },
  { id: "endgames", label: "Endgames" },
  { id: "middlegame", label: "Middlegame" },
  { id: "world-championship", label: "World Championship" },
  { id: "history", label: "History" },
  { id: "stream-highlights", label: "Streams & fun" },
  { id: "computers-engines", label: "Engines & silicon" },
  { id: "beginner", label: "Beginner" },
  { id: "strategy", label: "Strategy" },
];

export function chessTubeEmbedSrc(item: ChessTubeItem): string {
  if (item.kind === "video") {
    return `https://www.youtube-nocookie.com/embed/${item.youtubeId}?rel=0`;
  }
  return `https://www.youtube-nocookie.com/embed/videoseries?list=${item.playlistId}`;
}

export function chessTubeWatchHref(item: ChessTubeItem): string {
  if (item.kind === "video") {
    return `https://www.youtube.com/watch?v=${item.youtubeId}`;
  }
  return `https://www.youtube.com/playlist?list=${item.playlistId}`;
}

export function chessTubeThumbUrl(item: ChessTubeItem): string {
  const id = item.kind === "video" ? item.youtubeId : item.coverVideoId ?? "49H728S_VjM";
  return `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
}

export function catalogSessionEstimate(items: ChessTubeItem[]): number {
  let n = 0;
  for (const it of items) {
    if (it.kind === "video") n += 1;
    else n += it.episodeEstimate;
  }
  return n;
}

export function filterChessTubeItems(
  items: ChessTubeItem[],
  category: "all" | ChessTubeCategory,
  query: string,
): ChessTubeItem[] {
  const q = query.trim().toLowerCase();
  return items.filter((it) => {
    if (category !== "all" && !it.categories.includes(category)) return false;
    if (!q) return true;
    const hay = `${it.title} ${it.creator} ${it.kind === "video" ? it.series ?? "" : ""}`.toLowerCase();
    return hay.includes(q);
  });
}

/** Curated strip for /watch/cvc — engines first, then a few WC epics. */
export function computerChessTubePicks(items: ChessTubeItem[], limit = 16): ChessTubeItem[] {
  const eng = items.filter((i) => i.categories.includes("computers-engines"));
  const wc = items.filter(
    (i) => i.categories.includes("world-championship") && !i.categories.includes("computers-engines"),
  );
  const merged = [...eng, ...wc];
  const out: ChessTubeItem[] = [];
  const seen = new Set<string>();
  for (const it of merged) {
    const key = it.kind === "video" ? it.youtubeId : `pl:${it.playlistId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
    if (out.length >= limit) break;
  }
  return out;
}
