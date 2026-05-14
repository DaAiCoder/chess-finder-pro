import type { ChessTubePlaylist } from "./types";

/**
 * Curated mega-playlists — each embed exposes many episodes on YouTube.
 * Playlist IDs are public; episode counts are approximate.
 */
export const CHESS_TUBE_PLAYLISTS: ChessTubePlaylist[] = [
  {
    kind: "playlist",
    id: "pl-gotham-openings",
    playlistId: "PLBRObSmbZluTpMdP-rUL3bQ5GA8v4dMbT",
    title: "GothamChess — openings megaplaylist",
    creator: "GothamChess",
    categories: ["openings", "opening-series", "traps", "beginner"],
    coverVideoId: "49H728S_VjM",
    episodeEstimate: 95,
  },
  {
    kind: "playlist",
    id: "pl-slcc-beginner",
    playlistId: "PLVWaFpMwtaGj-HHi0t8bHxFzNtDwLoWon",
    title: "Saint Louis Chess Club — Beginner Breakdown",
    creator: "Saint Louis Chess Club",
    categories: ["beginner", "strategy", "middlegame", "openings"],
    coverVideoId: "AZAD1HgLNU4",
    episodeEstimate: 55,
  },
  {
    kind: "playlist",
    id: "pl-naroditsky-mega",
    playlistId: "PLwOOPAcNTqwbscjmL9HFX_gCeOdhdg_Y7",
    title: "Daniel Naroditsky — selected lessons & series",
    creator: "Daniel Naroditsky",
    categories: ["endgames", "middlegame", "strategy", "openings"],
    coverVideoId: "owTm2uYWym4",
    episodeEstimate: 120,
  },
];
