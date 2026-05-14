export type ChessTubeCategory =
  | "openings"
  | "opening-series"
  | "tactics"
  | "traps"
  | "endgames"
  | "middlegame"
  | "world-championship"
  | "history"
  | "stream-highlights"
  | "computers-engines"
  | "beginner"
  | "strategy";

export type ChessTubeVideo = {
  kind: "video";
  id: string;
  youtubeId: string;
  title: string;
  creator: string;
  categories: ChessTubeCategory[];
  /** Optional series name for grouping in the UI */
  series?: string;
};

export type ChessTubePlaylist = {
  kind: "playlist";
  id: string;
  playlistId: string;
  title: string;
  creator: string;
  categories: ChessTubeCategory[];
  /** Shown as playlist thumbnail when set */
  coverVideoId?: string;
  /** Rough count for catalog stats (YouTube playlist length changes over time) */
  episodeEstimate: number;
};

export type ChessTubeItem = ChessTubeVideo | ChessTubePlaylist;
