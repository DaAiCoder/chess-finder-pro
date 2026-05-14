import {
  pgTable,
  text,
  serial,
  integer,
  real,
  boolean,
  timestamp,
  jsonb,
  varchar,
  date,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

/* ---------------------------------------------------------------------- */
/* 1. users                                                               */
/* ---------------------------------------------------------------------- */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 64 }).notNull().unique(),
  /** Nullable for OAuth / magic-link-only accounts. Unique when set. */
  email: varchar("email", { length: 255 }).unique(),
  password: text("password").notNull(),
  /** Board theme, piece set, UI prefs — merged client-side. */
  preferences: jsonb("preferences").$type<Record<string, unknown> | null>(),
  /** Stripe customer ID. Set once we first create a Checkout Session. */
  stripeCustomerId: varchar("stripe_customer_id", { length: 64 }),
  /** Active subscription ID (if any). */
  stripeSubscriptionId: varchar("stripe_subscription_id", { length: 64 }),
  /** 'none' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete'. */
  subscriptionStatus: varchar("subscription_status", { length: 24 }),
  /** 'monthly' | 'yearly' | null. */
  subscriptionPlan: varchar("subscription_plan", { length: 12 }),
  /** Renewal / expiry timestamp from Stripe (current_period_end). */
  subscriptionCurrentPeriodEnd: timestamp("subscription_current_period_end"),
  /** True when the user has scheduled a cancel at period end. */
  subscriptionCancelAtPeriodEnd: boolean("subscription_cancel_at_period_end")
    .notNull()
    .default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

/* ---------------------------------------------------------------------- */
/* 2. chess_queries — natural-language search history                     */
/* ---------------------------------------------------------------------- */
export const chessQueries = pgTable("chess_queries", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  query: text("query").notNull(),
  parsedCriteria: jsonb("parsed_criteria"),
  results: jsonb("results"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const insertChessQuerySchema = createInsertSchema(chessQueries).omit({
  id: true,
  createdAt: true,
});
export type ChessQuery = typeof chessQueries.$inferSelect;
export type InsertChessQuery = Omit<
  z.infer<typeof insertChessQuerySchema>,
  "parsedCriteria" | "results"
> & {
  parsedCriteria?: unknown;
  results?: unknown;
};

/* ---------------------------------------------------------------------- */
/* 3. chess_positions — FEN evaluation cache                              */
/* ---------------------------------------------------------------------- */
export const chessPositions = pgTable("chess_positions", {
  id: serial("id").primaryKey(),
  fen: text("fen").notNull().unique(),
  evaluation: real("evaluation"),
  bestMove: text("best_move"),
  pv: jsonb("pv"),
  depth: integer("depth"),
  mateIn: integer("mate_in"),
  data: jsonb("data"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const insertChessPositionSchema = createInsertSchema(chessPositions).omit({
  id: true,
  createdAt: true,
});
export type ChessPosition = typeof chessPositions.$inferSelect;
export type InsertChessPosition = Omit<
  z.infer<typeof insertChessPositionSchema>,
  "pv" | "data"
> & {
  pv?: unknown;
  data?: unknown;
};

/* ---------------------------------------------------------------------- */
/* 4. opening_lines                                                       */
/* ---------------------------------------------------------------------- */
export const openingLines = pgTable("opening_lines", {
  id: serial("id").primaryKey(),
  eco: varchar("eco", { length: 4 }).notNull(),
  name: text("name").notNull(),
  moves: text("moves").notNull(),
  evaluation: real("evaluation"),
  whiteWinRate: real("white_win_rate"),
  drawRate: real("draw_rate"),
  blackWinRate: real("black_win_rate"),
  popularity: integer("popularity"),
});
export const insertOpeningLineSchema = createInsertSchema(openingLines).omit({ id: true });
export type OpeningLine = typeof openingLines.$inferSelect;
export type InsertOpeningLine = z.infer<typeof insertOpeningLineSchema>;

/* ---------------------------------------------------------------------- */
/* 5. games                                                               */
/* ---------------------------------------------------------------------- */
export const games = pgTable("games", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  pgn: text("pgn").notNull(),
  whitePlayer: text("white_player"),
  blackPlayer: text("black_player"),
  whiteRating: integer("white_rating"),
  blackRating: integer("black_rating"),
  result: varchar("result", { length: 8 }),
  source: varchar("source", { length: 16 }), // lichess | chess.com | pgn
  timeControl: varchar("time_control", { length: 16 }),
  eco: varchar("eco", { length: 4 }),
  opening: text("opening"),
  playedAt: timestamp("played_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const insertGameSchema = createInsertSchema(games).omit({ id: true, createdAt: true });
export type Game = typeof games.$inferSelect;
export type InsertGame = z.infer<typeof insertGameSchema>;

/* ---------------------------------------------------------------------- */
/* 6. game_analysis                                                       */
/* ---------------------------------------------------------------------- */
export const gameAnalysis = pgTable("game_analysis", {
  id: serial("id").primaryKey(),
  gameId: integer("game_id").notNull(),
  whiteAccuracy: real("white_accuracy"),
  blackAccuracy: real("black_accuracy"),
  moveAnalysis: jsonb("move_analysis"),
  evalGraph: jsonb("eval_graph"),
  whitePhaseGrades: jsonb("white_phase_grades"),
  blackPhaseGrades: jsonb("black_phase_grades"),
  depth: integer("depth"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const insertGameAnalysisSchema = createInsertSchema(gameAnalysis).omit({
  id: true,
  createdAt: true,
});
export type GameAnalysis = typeof gameAnalysis.$inferSelect;
// We override the inferred Insert type to use `unknown` for jsonb columns —
// drizzle-zod 0.6's strict `Json` type doesn't accept arbitrary user types
// without an index signature, but we know what we're storing.
export type InsertGameAnalysis = Omit<
  z.infer<typeof insertGameAnalysisSchema>,
  "moveAnalysis" | "evalGraph" | "whitePhaseGrades" | "blackPhaseGrades"
> & {
  moveAnalysis?: unknown;
  evalGraph?: unknown;
  whitePhaseGrades?: unknown;
  blackPhaseGrades?: unknown;
};

/* ---------------------------------------------------------------------- */
/* 7. opponent_profiles                                                   */
/* ---------------------------------------------------------------------- */
export const opponentProfiles = pgTable("opponent_profiles", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 128 }).notNull(),
  platform: varchar("platform", { length: 16 }).notNull(),
  openingTree: jsonb("opening_tree"),
  weaknesses: jsonb("weaknesses"),
  tacticalPatterns: jsonb("tactical_patterns"),
  averageRating: integer("average_rating"),
  gamesAnalyzed: integer("games_analyzed").default(0),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export const insertOpponentProfileSchema = createInsertSchema(opponentProfiles).omit({
  id: true,
  updatedAt: true,
});
export type OpponentProfile = typeof opponentProfiles.$inferSelect;
export type InsertOpponentProfile = Omit<
  z.infer<typeof insertOpponentProfileSchema>,
  "openingTree" | "weaknesses" | "tacticalPatterns"
> & {
  openingTree?: unknown;
  weaknesses?: unknown;
  tacticalPatterns?: unknown;
};

/* ---------------------------------------------------------------------- */
/* 8. training_problems                                                   */
/* ---------------------------------------------------------------------- */
export const trainingProblems = pgTable("training_problems", {
  id: serial("id").primaryKey(),
  module: varchar("module", { length: 32 }).notNull(),
  fen: text("fen").notNull(),
  solution: jsonb("solution").notNull(),
  difficulty: integer("difficulty").notNull().default(3),
  themes: jsonb("themes"),
  tacticType: varchar("tactic_type", { length: 64 }),
  explanation: text("explanation"),
  source: varchar("source", { length: 32 }),
  sourceGameId: integer("source_game_id"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const insertTrainingProblemSchema = createInsertSchema(trainingProblems).omit({
  id: true,
  createdAt: true,
});
export type TrainingProblem = typeof trainingProblems.$inferSelect;
export type InsertTrainingProblem = Omit<
  z.infer<typeof insertTrainingProblemSchema>,
  "solution" | "themes" | "metadata"
> & {
  solution: unknown;
  themes?: unknown;
  metadata?: unknown;
};

/* ---------------------------------------------------------------------- */
/* 9. training_attempts                                                   */
/* ---------------------------------------------------------------------- */
export const trainingAttempts = pgTable("training_attempts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  problemId: integer("problem_id").notNull(),
  solved: boolean("solved").notNull(),
  timeSpent: integer("time_spent").notNull(),
  movesPlayed: jsonb("moves_played"),
  /** DB column `attempted_at` (relational mirror + Drizzle introspection). */
  createdAt: timestamp("attempted_at").defaultNow().notNull(),
});
export const insertTrainingAttemptSchema = createInsertSchema(trainingAttempts).omit({
  id: true,
  createdAt: true,
});
export type TrainingAttempt = typeof trainingAttempts.$inferSelect;
export type InsertTrainingAttempt = Omit<
  z.infer<typeof insertTrainingAttemptSchema>,
  "movesPlayed"
> & {
  movesPlayed?: unknown;
};

/* ---------------------------------------------------------------------- */
/* 10. training_progress (per-user, per-module)                           */
/* ---------------------------------------------------------------------- */
export const trainingProgress = pgTable("training_progress", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  module: varchar("module", { length: 32 }).notNull(),
  rating: integer("rating").notNull().default(1200),
  problemsSolved: integer("problems_solved").notNull().default(0),
  totalAttempts: integer("total_attempts").notNull().default(0),
  accuracy: real("accuracy").notNull().default(0),
  lastPracticed: timestamp("last_practiced"),
});
export const insertTrainingProgressSchema = createInsertSchema(trainingProgress).omit({
  id: true,
});
export type TrainingProgress = typeof trainingProgress.$inferSelect;
export type InsertTrainingProgress = z.infer<typeof insertTrainingProgressSchema>;

/* ---------------------------------------------------------------------- */
/* 11. daily_challenges                                                   */
/* ---------------------------------------------------------------------- */
export const dailyChallenges = pgTable("daily_challenges", {
  id: serial("id").primaryKey(),
  problemId: integer("problem_id").notNull(),
  date: date("date").notNull().unique(),
});
export const insertDailyChallengeSchema = createInsertSchema(dailyChallenges).omit({ id: true });
export type DailyChallenge = typeof dailyChallenges.$inferSelect;
export type InsertDailyChallenge = z.infer<typeof insertDailyChallengeSchema>;

/* ---------------------------------------------------------------------- */
/* 12. user_streaks                                                       */
/* ---------------------------------------------------------------------- */
export const userStreaks = pgTable("user_streaks", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique(),
  currentStreak: integer("current_streak").notNull().default(0),
  longestStreak: integer("longest_streak").notNull().default(0),
  lastActivityDate: date("last_activity_date"),
  xp: integer("xp").notNull().default(0),
  level: integer("level").notNull().default(1),
  weeklyXp: integer("weekly_xp").notNull().default(0),
});
export const insertUserStreakSchema = createInsertSchema(userStreaks).omit({ id: true });
export type UserStreak = typeof userStreaks.$inferSelect;
export type InsertUserStreak = z.infer<typeof insertUserStreakSchema>;

/* ---------------------------------------------------------------------- */
/* 12b. user_motif_skills — SQL mirror (server/services/relationalMirror) */
/* ---------------------------------------------------------------------- */
export const userMotifSkills = pgTable(
  "user_motif_skills",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    motifKey: varchar("motif_key", { length: 48 }).notNull(),
    rating: real("rating").notNull(),
    rd: real("rd").notNull(),
    attempts: integer("attempts").notNull().default(0),
    correct: integer("correct").notNull().default(0),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [unique("user_motif_skills_user_id_motif_key_unique").on(t.userId, t.motifKey)],
);

/* ---------------------------------------------------------------------- */
/* 13. motif_definitions                                                  */
/* ---------------------------------------------------------------------- */
export const motifDefinitions = pgTable("motif_definitions", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 48 }).notNull().unique(),
  name: text("name").notNull(),
  category: varchar("category", { length: 32 }).notNull(),
  description: text("description"),
  detectionParams: jsonb("detection_params"),
});
export const insertMotifDefinitionSchema = createInsertSchema(motifDefinitions).omit({ id: true });
export type MotifDefinition = typeof motifDefinitions.$inferSelect;
export type InsertMotifDefinition = Omit<
  z.infer<typeof insertMotifDefinitionSchema>,
  "detectionParams"
> & {
  detectionParams?: unknown;
};

/* ---------------------------------------------------------------------- */
/* 14. motif_instances                                                    */
/* ---------------------------------------------------------------------- */
export const motifInstances = pgTable("motif_instances", {
  id: serial("id").primaryKey(),
  motifKey: varchar("motif_key", { length: 48 }).notNull(),
  gameId: integer("game_id"),
  ply: integer("ply"),
  fen: text("fen"),
  data: jsonb("data"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const insertMotifInstanceSchema = createInsertSchema(motifInstances).omit({
  id: true,
  createdAt: true,
});
export type MotifInstance = typeof motifInstances.$inferSelect;
export type InsertMotifInstance = Omit<
  z.infer<typeof insertMotifInstanceSchema>,
  "data"
> & {
  data?: unknown;
};

/* ---------------------------------------------------------------------- */
/* 15. motif_metrics                                                      */
/* ---------------------------------------------------------------------- */
export const motifMetrics = pgTable("motif_metrics", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  motifKey: varchar("motif_key", { length: 48 }).notNull(),
  attempts: integer("attempts").notNull().default(0),
  correct: integer("correct").notNull().default(0),
  accuracy: real("accuracy").notNull().default(0),
  lastSeenAt: timestamp("last_seen_at"),
});
export const insertMotifMetricSchema = createInsertSchema(motifMetrics).omit({ id: true });
export type MotifMetric = typeof motifMetrics.$inferSelect;
export type InsertMotifMetric = z.infer<typeof insertMotifMetricSchema>;

/* ---------------------------------------------------------------------- */
/* 16. motif_queries                                                      */
/* ---------------------------------------------------------------------- */
export const motifQueries = pgTable("motif_queries", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  query: text("query").notNull(),
  results: jsonb("results"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const insertMotifQuerySchema = createInsertSchema(motifQueries).omit({
  id: true,
  createdAt: true,
});
export type MotifQuery = typeof motifQueries.$inferSelect;
export type InsertMotifQuery = Omit<
  z.infer<typeof insertMotifQuerySchema>,
  "results"
> & {
  results?: unknown;
};

/* ---------------------------------------------------------------------- */
/* 17. First-party site analytics (sessions + page views, admin dashboard) */
/* ---------------------------------------------------------------------- */
export const analyticsSessions = pgTable(
  "analytics_sessions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    anonymousId: varchar("anonymous_id", { length: 64 }).notNull(),
    userId: integer("user_id"),
    country: varchar("country", { length: 2 }),
    referrer: varchar("referrer", { length: 2048 }),
    userAgent: varchar("user_agent", { length: 512 }),
    clientLocale: varchar("client_locale", { length: 32 }),
    clientTimezone: varchar("client_timezone", { length: 64 }),
  },
  (t) => [
    index("analytics_sessions_started_idx").on(t.startedAt),
    index("analytics_sessions_country_idx").on(t.country),
    index("analytics_sessions_user_idx").on(t.userId),
  ],
);

export const analyticsPageViews = pgTable(
  "analytics_page_views",
  {
    id: serial("id").primaryKey(),
    sessionId: varchar("session_id", { length: 36 })
      .notNull()
      .references(() => analyticsSessions.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    query: varchar("query", { length: 512 }),
    title: varchar("title", { length: 512 }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("analytics_pv_session_idx").on(t.sessionId),
    index("analytics_pv_occurred_idx").on(t.occurredAt),
    index("analytics_pv_path_idx").on(t.path),
  ],
);

/* ---------------------------------------------------------------------- */
/* Shared application-level value types                                    */
/* ---------------------------------------------------------------------- */
export type MoveQuality =
  | "brilliant"
  | "great"
  | "best"
  | "excellent"
  | "good"
  | "book"
  | "inaccuracy"
  | "miss"
  | "mistake"
  | "blunder";

export interface MoveAnalysis {
  ply: number;
  san: string;
  uci: string;
  fenBefore: string;
  fenAfter: string;
  evalBefore: number; // centipawns from white's POV (mate = ±100000)
  evalAfter: number;
  cpl: number;
  bestMove: string | null;
  quality: MoveQuality;
  isWhite: boolean;
}

export interface PhaseGrades {
  opening: number; // 0..100
  middlegame: number;
  endgame: number;
}

export type TrainingModule =
  | "tactics"
  | "blunder-preventer"
  | "opening-improver"
  | "advantage-capitalization"
  | "visualization"
  | "endgame";

/* ---------------------------------------------------------------------- */
/* Motif categories — group the ~20 detected motif keys into broader      */
/* themes the Pattern Finder UI / NL parser can reason about.             */
/* ---------------------------------------------------------------------- */
export const MOTIF_CATEGORIES = {
  FORKS_DOUBLE_ATTACKS: "forks_double_attacks",
  PINS_SKEWERS: "pins_skewers",
  DISCOVERED_IDEAS: "discovered_ideas",
  DEFLECTION_OVERLOAD: "deflection_overload",
  CLEARANCE_INTERFERENCE: "clearance_interference",
  TRAPPING: "trapping",
  MATING_NETS: "mating_nets",
  PROMOTION: "promotion",
  ENDGAME: "endgame",
  DEFENSIVE: "defensive",
} as const;
export type MotifCategory = (typeof MOTIF_CATEGORIES)[keyof typeof MOTIF_CATEGORIES];

/** Maps detector `motifKey` → high-level category bucket. */
export const MOTIF_KEY_TO_CATEGORY: Record<string, MotifCategory> = {
  fork: MOTIF_CATEGORIES.FORKS_DOUBLE_ATTACKS,
  "double-attack": MOTIF_CATEGORIES.FORKS_DOUBLE_ATTACKS,
  pin: MOTIF_CATEGORIES.PINS_SKEWERS,
  skewer: MOTIF_CATEGORIES.PINS_SKEWERS,
  "x-ray": MOTIF_CATEGORIES.PINS_SKEWERS,
  "discovered-attack": MOTIF_CATEGORIES.DISCOVERED_IDEAS,
  windmill: MOTIF_CATEGORIES.DISCOVERED_IDEAS,
  deflection: MOTIF_CATEGORIES.DEFLECTION_OVERLOAD,
  decoy: MOTIF_CATEGORIES.DEFLECTION_OVERLOAD,
  "overloaded-piece": MOTIF_CATEGORIES.DEFLECTION_OVERLOAD,
  interference: MOTIF_CATEGORIES.CLEARANCE_INTERFERENCE,
  zwischenzug: MOTIF_CATEGORIES.CLEARANCE_INTERFERENCE,
  "trapped-piece": MOTIF_CATEGORIES.TRAPPING,
  "hanging-piece": MOTIF_CATEGORIES.TRAPPING,
  "back-rank": MOTIF_CATEGORIES.MATING_NETS,
  "smothered-mate": MOTIF_CATEGORIES.MATING_NETS,
  "greek-gift": MOTIF_CATEGORIES.MATING_NETS,
  "passed-pawn": MOTIF_CATEGORIES.PROMOTION,
  opposition: MOTIF_CATEGORIES.ENDGAME,
  lucena: MOTIF_CATEGORIES.ENDGAME,
  philidor: MOTIF_CATEGORIES.ENDGAME,
};

/* ---------------------------------------------------------------------- */
/* MotifSearchCriteria — shared between server route + client UI.         */
/* ---------------------------------------------------------------------- */
export const motifSearchCriteriaSchema = z.object({
  /** Restrict to specific motif keys, e.g. ["fork", "back-rank"]. */
  motifKeys: z.array(z.string()).optional(),
  /** Restrict to a high-level category bucket. */
  category: z.string().optional(),
  /** White only / black only / both. */
  side: z.enum(["white", "black"]).optional(),
  /** Outcome filter from the perspective of `side` (default: any). */
  result: z.enum(["win", "loss", "draw"]).optional(),
  /** Only show instances flagged as "missed" by the side. */
  missed: z.boolean().optional(),
  /** Minimum eval swing in centipawns (only meaningful when analyzed). */
  minEvalSwing: z.number().optional(),
  /** Restrict to a single game. */
  gameId: z.number().int().optional(),
  /** Pagination. */
  limit: z.number().int().min(1).max(500).optional(),
  offset: z.number().int().min(0).optional(),
});
export type MotifSearchCriteria = z.infer<typeof motifSearchCriteriaSchema>;

/** Shape stored in `motif_instances.data` jsonb (kept loose; all optional). */
export interface MotifInstanceData {
  san?: string;
  side?: "white" | "black";
  /** True when the side could/should have spotted this motif but didn't. */
  missed?: boolean;
  /** Result of the parent game (1-0 / 0-1 / 1/2-1/2 / *) at detection time. */
  gameResult?: string;
  /** Eval swing in centipawns from before-the-move to after, mover's POV. */
  evalSwing?: number;
  /** Square the motif centres on (e.g. capturing square, pinning square). */
  square?: string;
}

/* ---------------------------------------------------------------------- */
/* Unified Pattern Finder — search across motifs (your games) AND         */
/* discoverable opening lines in a single query language.                 */
/* ---------------------------------------------------------------------- */

export type LineQueryScope = "games" | "lines" | "both";
export type LineQueryReplyMode = "forcing" | "common";
export type MaterialPiece = "queen" | "rook" | "bishop" | "knight" | "pawn" | "minor" | "major";

export const evalBandSchema = z.object({
  cpMin: z.number().int(),
  cpMax: z.number().int(),
  label: z.enum(["equal", "slight", "advantage", "winning", "any"]).optional(),
});
export type EvalBand = z.infer<typeof evalBandSchema>;

export const materialGainSchema = z.object({
  piece: z.enum(["queen", "rook", "bishop", "knight", "pawn", "minor", "major"]),
  /** Which side does the gaining. */
  side: z.enum(["white", "black"]),
});
export type MaterialGain = z.infer<typeof materialGainSchema>;

export const lineQuerySchema = z.object({
  /** Original natural-language text, if any. */
  raw: z.string().optional(),
  /** Free-form opening hint — resolved server-side to a dictionary entry. */
  openingHint: z.string().optional(),
  /** Resolved opening ID from the dictionary (post-parse). */
  openingId: z.string().optional(),
  /**
   * Resolved universal setup ID (Hedgehog, London, KIA, …). When set, the
   * server walks every plausible opponent first move and reports one line
   * per first move showing how the setup is reached.
   */
  setupId: z.string().optional(),
  motifs: z.array(z.string()).optional(),
  side: z.enum(["white", "black"]).optional(),
  result: z.enum(["win", "loss", "draw"]).optional(),
  missed: z.boolean().optional(),
  evalBand: evalBandSchema.optional(),
  materialGain: materialGainSchema.optional(),
  /** Number of plies (half-moves) the discovered line should reach. */
  plyTarget: z.number().int().min(2).max(80).optional(),
  replyMode: z.enum(["forcing", "common"]).optional(),
  scope: z.enum(["games", "lines", "both"]).optional(),
  /** Per-scope pagination. */
  limit: z.number().int().min(1).max(200).optional(),
});
export type LineQuery = z.infer<typeof lineQuerySchema>;

/**
 * Universal setup / system definition (Hedgehog, London, KIA, Stonewall…).
 *
 * Unlike `OpeningEntry`, a setup is reached by many different move orders.
 * The Pattern Finder walks toward `targets` from each plausible opponent
 * first move and reports one line per branch.
 */
export interface SetupTemplate {
  id: string;
  name: string;
  /** Which side is *playing* the setup. */
  side: "white" | "black";
  /** Short description for the UI tooltip. */
  description: string;
  /** Common informal names ("hedgehog", "london", "kia", "hippo"). */
  aliases: string[];
  /**
   * Target placement — for each piece type, the squares we want at least
   * one piece on. A position satisfies the template when at least
   * `minMatchCount` of the targets are met.
   */
  targets: Array<{
    /** Piece type (lowercase, chess.js convention). */
    piece: "p" | "n" | "b" | "r" | "q" | "k";
    /** Acceptable squares — any one of them counts as a hit. */
    squares: string[];
  }>;
  /** How many of the targets must be hit (defaults to all). */
  minMatchCount?: number;
  /** A canonical sample move order — used as the seed and for display. */
  sampleSan: string[];
}

/** A row in the openings dictionary (loaded from Lichess + curated TSVs). */
export interface OpeningEntry {
  id: string;
  name: string;
  eco?: string;
  aliases: string[];
  /** Standard SAN moves from the initial position to this opening. */
  prefixSan: string[];
  /** EPD/FEN at the end of `prefixSan` (cached for fast lookup). */
  fen: string;
}

/** A single result row produced by the line searcher. */
export interface DiscoveredLine {
  id: string;
  opening: { id: string; name: string; eco?: string };
  /** Full SAN move list (prefix + continuation). */
  moves: string[];
  /** Plies the prefix occupies — moves[0..prefixPlies-1] are the opening. */
  prefixPlies: number;
  /** FEN at the leaf. */
  leafFen: string;
  /** Engine eval at the leaf, white POV in centipawns. */
  evalCp: number | null;
  /** Distance to mate if applicable (white +, black -). */
  mateIn: number | null;
  /** Stockfish depth that produced `evalCp`. */
  depth: number;
  /** Motif keys that fire on the line (run through detector). */
  motifs: string[];
  /** Lichess masters explorer stats if available. */
  stats?: {
    games: number;
    white: number;
    draws: number;
    black: number;
    avgElo?: number;
  };
  /** Material delta at leaf: positive = white gained material, in pawns. */
  materialDelta: number;
  /**
   * For setup or any-opening sweeps — a short label like "vs 1.e4" that
   * the UI groups results by. Omitted for normal opening searches.
   */
  against?: string;
  /** When produced via a setup walk, which setup did we hit. */
  setup?: { id: string; name: string };
}

/* ====================================================================== */
/* Phase 1: learning loop                                                  */
/* ====================================================================== */

/** Per-user, per-motif skill rating produced by onboarding + drilling. */
export interface UserMotifSkill {
  id: number;
  userId: number;
  motifKey: string;
  /** Rough Elo-like rating; default 1200 for new motifs. */
  rating: number;
  /** Glicko-style uncertainty band — shrinks with attempts. */
  rd: number;
  attempts: number;
  correct: number;
  updatedAt: Date;
}
export type InsertUserMotifSkill = Omit<
  UserMotifSkill,
  "id" | "updatedAt"
> & {
  updatedAt?: Date;
};

/** SRS card — SM-2 legacy fields retained; optional FSRS state in `fsrsState`. */
export interface SrsCard {
  id: number;
  userId: number;
  problemId: number;
  /** Anki / SM-2 ease factor — multiplier on the interval. */
  easeFactor: number;
  /** Days to wait before showing again. */
  intervalDays: number;
  /** Streak of consecutive successful reviews. */
  repetitions: number;
  dueAt: Date;
  lastReviewedAt: Date | null;
  createdAt: Date;
  /** Serialized FSRS card from `ts-fsrs` when FSRS scheduling is active. */
  fsrsState?: unknown;
}
export type InsertSrsCard = Omit<SrsCard, "id" | "createdAt"> & {
  createdAt?: Date;
};

/** Cached natural-language coach explanation per (FEN, userMove). */
export interface CoachExplanation {
  id: number;
  /** sha1(fen|userMove) — primary lookup key. */
  cacheKey: string;
  fen: string;
  userMove: string;
  correctMove: string | null;
  motif: string | null;
  /** 1-2 sentence rationale rendered to the user. */
  text: string;
  /** Model name that produced it, for cache busts on model swaps. */
  model: string;
  createdAt: Date;
}
export type InsertCoachExplanation = Omit<CoachExplanation, "id" | "createdAt"> & {
  createdAt?: Date;
};

/* ====================================================================== */
/* Phase 2.2: pattern-finder saved searches                                */
/* ====================================================================== */

export interface SavedSearch {
  id: number;
  userId: number;
  name: string;
  /** Serialised LineQuery (typed as unknown so the storage layer stays
   *  agnostic and the consumer can revalidate via Zod). */
  query: unknown;
  createdAt: Date;
}
export type InsertSavedSearch = Omit<SavedSearch, "id" | "createdAt"> & {
  createdAt?: Date;
};

/* ====================================================================== */
/* Phase 3.3: repertoire trainer                                           */
/* ====================================================================== */

export interface Repertoire {
  id: number;
  userId: number;
  name: string;
  color: "white" | "black";
  createdAt: Date;
}
export type InsertRepertoire = Omit<Repertoire, "id" | "createdAt"> & {
  createdAt?: Date;
};

export interface RepertoireNode {
  id: number;
  repertoireId: number;
  parentId: number | null;
  /** FEN AFTER the node's move was played (the position the user is in). */
  fen: string;
  /** SAN of the move that produced `fen` from the parent's position. */
  san: string;
  /** Optional annotation entered by the user. */
  comment: string | null;
  createdAt: Date;
}
export type InsertRepertoireNode = Omit<RepertoireNode, "id" | "createdAt"> & {
  createdAt?: Date;
};

export interface RepertoireDeviation {
  id: number;
  repertoireId: number;
  userId: number;
  /** The book FEN where the deviation happened. */
  fen: string;
  /** Move the user/opponent played that was NOT in the tree. */
  san: string;
  /** Which side deviated. */
  side: "white" | "black";
  /** Source: from a played game, from a drill, etc. */
  source: "drill" | "game";
  /** Optional reference to the game (when source = "game"). */
  gameId: number | null;
  createdAt: Date;
}
export type InsertRepertoireDeviation = Omit<
  RepertoireDeviation,
  "id" | "createdAt"
> & {
  createdAt?: Date;
};

/* ====================================================================== */
/* Phase 5: giant game library + position explorer                         */
/* ====================================================================== */

/**
 * A single game stored in the local Game Library. The library is sourced
 * from Lichess broadcasts/databases, Chess.com archives, Chessbase PGN
 * dumps, or user uploads. Each game carries an inferred "tier" so the
 * explorer UI can group masters / titled / club / amateur play.
 */
export type LibraryTier =
  | "masters" // 2400+ FIDE rated, or curated GM/IM games
  | "titled" // 2200–2399 (FM / titled amateurs)
  | "expert" // 2000–2199 (club masters / experts)
  | "intermediate" // 1600–1999
  | "amateur" // <1600 (or unrated)
  | "engine" // engine vs engine games
  | "broadcast"; // tournament feed games (FIDE / TCEC live)

export interface LibraryGame {
  id: number;
  /** Stable hash of PGN so duplicate imports are no-ops. */
  pgnHash: string;
  source:
    | "lichess"
    | "chess.com"
    | "chessbase"
    | "pgn"
    | "broadcast"
    | "engine-match";
  tier: LibraryTier;
  whitePlayer: string | null;
  blackPlayer: string | null;
  whiteRating: number | null;
  blackRating: number | null;
  /** Average of the two ratings, used for tier classification. */
  avgRating: number | null;
  result: "1-0" | "0-1" | "1/2-1/2" | "*" | null;
  eco: string | null;
  opening: string | null;
  event: string | null;
  site: string | null;
  playedAt: Date | null;
  /** Time control header (e.g. "180+2", "5+0"). */
  timeControl: string | null;
  /** Total plies in the game. */
  plyCount: number;
  /** Full PGN text. */
  pgn: string;
  /**
   * The first N (default 24) EPDs reached, used as a position index. EPD
   * = FEN with castling/ep but WITHOUT half/full clocks, so positions
   * collapse cleanly. Stored as a JSON array for cheap lookup.
   */
  epds: string[];
  /**
   * Parallel SAN sequence — `firstSans[i]` is the move played from the
   * position whose EPD is `epds[i]`. Precomputed at ingest time so the
   * position explorer can compute aggregate move stats without re-
   * parsing every PGN. Length is at most `epds.length`.
   */
  firstSans?: string[];
  /**
   * Parallel UCI sequence — `firstUcis[i]` is the same move as
   * `firstSans[i]` but in UCI form (e.g. "e2e4", "e7e8q"). Precomputed
   * so the explorer doesn't have to instantiate chess.js per move.
   */
  firstUcis?: string[];
  createdAt: Date;
}
export type InsertLibraryGame = Omit<LibraryGame, "id" | "createdAt"> & {
  createdAt?: Date;
};

/**
 * Cached aggregate stats for a single EPD position. Populated lazily from
 * Lichess explorer endpoints + our local library, keyed by `(epd, tier)`.
 * Each row represents a single "tier bucket" so the UI can switch between
 * Masters / Lichess 2000+ / Lichess <1600 / My Games etc. without
 * re-querying upstream APIs.
 */
export interface LibraryPositionStats {
  id: number;
  epd: string;
  tier: LibraryTier | "lichess-2500" | "lichess-2000" | "lichess-1600" | "lichess-1200" | "local";
  whiteWins: number;
  draws: number;
  blackWins: number;
  totalGames: number;
  avgRating: number | null;
  /** Top moves sorted by play count, with WDL per move. */
  moves: Array<{
    san: string;
    uci: string;
    whiteWins: number;
    draws: number;
    blackWins: number;
    games: number;
    avgRating: number | null;
    /** Engine evaluation in centipawns (white POV), if computed. */
    evalCp?: number | null;
  }>;
  /** Sample game refs reaching this position (top 6). */
  sampleGames?: Array<{
    libraryGameId?: number;
    lichessGameId?: string;
    white: string;
    black: string;
    whiteRating?: number;
    blackRating?: number;
    result: string;
    year?: number;
  }>;
  /** When the stats were last refreshed from upstream. */
  refreshedAt: Date;
  createdAt: Date;
}
export type InsertLibraryPositionStats = Omit<
  LibraryPositionStats,
  "id" | "createdAt"
> & {
  createdAt?: Date;
};

/** Tier labels for the explorer UI dropdown. */
export const LIBRARY_TIER_LABELS: Record<string, string> = {
  masters: "Masters (2400+)",
  titled: "Titled (2200-2399)",
  expert: "Expert (2000-2199)",
  intermediate: "Club (1600-1999)",
  amateur: "Amateur (<1600)",
  engine: "Engine",
  broadcast: "Live broadcast",
  "lichess-2500": "Lichess 2500+",
  "lichess-2000": "Lichess 2000-2499",
  "lichess-1600": "Lichess 1600-1999",
  "lichess-1200": "Lichess <1600",
  local: "My Library",
};

/* ====================================================================== */
/* Phase 4: variant games                                                  */
/* ====================================================================== */

export type VariantId =
  | "standard"
  | "chess960"
  | "king-of-the-hill"
  | "three-check"
  | "atomic"
  | "antichess"
  | "crazyhouse"
  | "racing-kings"
  | "horde"
  | "fog-of-war"
  | "motif-hunt"
  | "live-coach"
  | "reverse-endgame";

export interface VariantGame {
  id: number;
  userId: number;
  variant: VariantId;
  /** Persona or odds applied (e.g. "magnus", "knight-odds", "time-30-600"). */
  persona: string | null;
  /** Initial FEN (random for 960 / Horde / Racing Kings). */
  startFen: string;
  /** Full PGN of the played game. */
  pgn: string;
  /** Game result string ("1-0", "0-1", "1/2-1/2", or "*" for ongoing). */
  result: string;
  timeControl: string | null;
  /**
   * Color the human user is playing. Defaults to "white" for back-compat
   * with rows created before color choice landed. The bot drives the
   * other side.
   */
  playerColor: "white" | "black";
  startedAt: Date;
  finishedAt: Date | null;
}
export type InsertVariantGame = Omit<VariantGame, "id" | "startedAt"> & {
  startedAt?: Date;
};

/* ====================================================================== */
/* Coach 2.0 — conversational threads (JSON snapshot + future Drizzle)   */
/* ====================================================================== */

export interface CoachChatMessage {
  role: "user" | "assistant";
  content: string;
  at: string;
}

export interface CoachConversation {
  id: number;
  userId: number;
  title: string;
  messages: CoachChatMessage[];
  updatedAt: Date;
}

export type InsertCoachConversation = Omit<CoachConversation, "id" | "updatedAt"> & {
  updatedAt?: Date;
};
