/**
 * Storage layer.
 *
 * - If `DATABASE_URL` is set, persists via TCP Postgres (`postgres.js`) —
 *   Render, Neon, or local.
 * - Otherwise, falls back to a process-local in-memory implementation
 *   that satisfies the same interface (perfect for local dev / demos).
 *   The in-memory implementation also persists to a single JSON file
 *   (`data/storage.json` by default) on a 1s debounce so games / analyses
 *   / training progress survive server restarts. Set
 *   `STORAGE_PERSIST=false` to disable.
 */

import { promises as fs, existsSync } from "node:fs";
import path from "node:path";
import type {
  User, InsertUser,
  ChessQuery, InsertChessQuery,
  ChessPosition, InsertChessPosition,
  OpeningLine, InsertOpeningLine,
  Game, InsertGame,
  GameAnalysis, InsertGameAnalysis,
  OpponentProfile, InsertOpponentProfile,
  TrainingProblem, InsertTrainingProblem,
  TrainingAttempt, InsertTrainingAttempt,
  TrainingProgress, InsertTrainingProgress,
  DailyChallenge, InsertDailyChallenge,
  UserStreak, InsertUserStreak,
  MotifDefinition, InsertMotifDefinition,
  MotifInstance, InsertMotifInstance,
  MotifMetric, InsertMotifMetric,
  MotifQuery, InsertMotifQuery,
  UserMotifSkill, InsertUserMotifSkill,
  SrsCard, InsertSrsCard,
  CoachExplanation, InsertCoachExplanation,
  SavedSearch, InsertSavedSearch,
  Repertoire, InsertRepertoire,
  RepertoireNode, InsertRepertoireNode,
  RepertoireDeviation, InsertRepertoireDeviation,
  VariantGame, InsertVariantGame,
  LibraryGame, InsertLibraryGame,
  LibraryPositionStats, InsertLibraryPositionStats,
  CoachConversation,
  InsertCoachConversation,
} from "../shared/schema.js";
import type { ScoutReport } from "./services/opponentScout.js";
import {
  ensureNeonSnapshotTable,
  loadNeonSnapshot,
  neonEnabled,
  saveNeonSnapshot,
} from "./neonSnapshot.js";
import {
  ensureRelationalTables,
  mirrorMotifSkill,
  mirrorTrainingAttempt,
  mirrorUserStreak,
} from "./services/relationalMirror.js";

export interface IStorage {
  init(): Promise<void>;

  // users
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(input: InsertUser): Promise<User>;
  updateUserPreferences(
    userId: number,
    preferences: Record<string, unknown>,
  ): Promise<User | undefined>;
  updateUserEmail(userId: number, email: string | null): Promise<User | undefined>;
  updateUserPassword(userId: number, passwordHash: string): Promise<User | undefined>;
  getUserByStripeCustomerId(stripeCustomerId: string): Promise<User | undefined>;
  updateUserSubscription(
    userId: number,
    patch: {
      stripeCustomerId?: string | null;
      stripeSubscriptionId?: string | null;
      subscriptionStatus?: string | null;
      subscriptionPlan?: string | null;
      subscriptionCurrentPeriodEnd?: Date | null;
      subscriptionCancelAtPeriodEnd?: boolean;
    },
  ): Promise<User | undefined>;

  // games
  listGames(userId?: number): Promise<Game[]>;
  getGame(id: number): Promise<Game | undefined>;
  createGame(input: InsertGame): Promise<Game>;
  deleteGame(id: number): Promise<void>;

  // game analysis
  getAnalysisForGame(gameId: number): Promise<GameAnalysis | undefined>;
  upsertGameAnalysis(input: InsertGameAnalysis): Promise<GameAnalysis>;

  // chess positions
  getPositionByFen(fen: string): Promise<ChessPosition | undefined>;
  upsertPosition(input: InsertChessPosition): Promise<ChessPosition>;

  // chess queries
  createChessQuery(input: InsertChessQuery): Promise<ChessQuery>;
  listChessQueries(userId?: number): Promise<ChessQuery[]>;

  // openings
  listOpenings(): Promise<OpeningLine[]>;
  upsertOpening(input: InsertOpeningLine): Promise<OpeningLine>;

  // opponent profiles
  getOpponentProfile(username: string, platform: string): Promise<OpponentProfile | undefined>;
  upsertOpponentProfile(input: InsertOpponentProfile): Promise<OpponentProfile>;

  // training
  listTrainingProblems(filter?: {
    module?: string;
    tacticType?: string;
    difficulty?: number;
  }): Promise<TrainingProblem[]>;
  getTrainingProblem(id: number): Promise<TrainingProblem | undefined>;
  createTrainingProblem(input: InsertTrainingProblem): Promise<TrainingProblem>;
  countTrainingProblems(filter?: { module?: string }): Promise<number>;
  deleteTrainingProblem(id: number): Promise<boolean>;

  recordAttempt(input: InsertTrainingAttempt): Promise<TrainingAttempt>;
  listAttempts(userId: number, problemId?: number): Promise<TrainingAttempt[]>;

  getProgress(userId: number, module: string): Promise<TrainingProgress | undefined>;
  upsertProgress(input: InsertTrainingProgress): Promise<TrainingProgress>;
  listProgress(userId: number): Promise<TrainingProgress[]>;

  // daily
  getDailyChallenge(date: string): Promise<DailyChallenge | undefined>;
  setDailyChallenge(input: InsertDailyChallenge): Promise<DailyChallenge>;

  getStreak(userId: number): Promise<UserStreak | undefined>;
  upsertStreak(input: InsertUserStreak): Promise<UserStreak>;

  // motifs
  listMotifDefinitions(): Promise<MotifDefinition[]>;
  upsertMotifDefinition(input: InsertMotifDefinition): Promise<MotifDefinition>;
  recordMotifInstance(input: InsertMotifInstance): Promise<MotifInstance>;
  listMotifInstances(filter?: { motifKey?: string; gameId?: number }): Promise<MotifInstance[]>;
  upsertMotifMetric(input: InsertMotifMetric): Promise<MotifMetric>;
  listMotifMetrics(userId: number): Promise<MotifMetric[]>;
  recordMotifQuery(input: InsertMotifQuery): Promise<MotifQuery>;

  /* user motif skill (Phase 1.1 onboarding) */
  getUserMotifSkill(userId: number, motifKey: string): Promise<UserMotifSkill | undefined>;
  listUserMotifSkills(userId: number): Promise<UserMotifSkill[]>;
  upsertUserMotifSkill(input: InsertUserMotifSkill): Promise<UserMotifSkill>;

  /* srs cards (Phase 1.3) */
  getSrsCard(userId: number, problemId: number): Promise<SrsCard | undefined>;
  listDueSrsCards(userId: number, now: Date, limit?: number): Promise<SrsCard[]>;
  upsertSrsCard(input: InsertSrsCard): Promise<SrsCard>;

  /* coach explanations (Phase 1.2) */
  getCoachExplanation(cacheKey: string): Promise<CoachExplanation | undefined>;
  upsertCoachExplanation(input: InsertCoachExplanation): Promise<CoachExplanation>;

  /* saved searches (Phase 2.2) */
  listSavedSearches(userId: number): Promise<SavedSearch[]>;
  createSavedSearch(input: InsertSavedSearch): Promise<SavedSearch>;
  deleteSavedSearch(id: number): Promise<void>;

  /* repertoire trainer (Phase 3.3) */
  listRepertoires(userId: number): Promise<Repertoire[]>;
  getRepertoire(id: number): Promise<Repertoire | undefined>;
  createRepertoire(input: InsertRepertoire): Promise<Repertoire>;
  deleteRepertoire(id: number): Promise<void>;
  listRepertoireNodes(repertoireId: number): Promise<RepertoireNode[]>;
  createRepertoireNode(input: InsertRepertoireNode): Promise<RepertoireNode>;
  recordRepertoireDeviation(input: InsertRepertoireDeviation): Promise<RepertoireDeviation>;
  listRepertoireDeviations(repertoireId: number): Promise<RepertoireDeviation[]>;

  /* variant games (Phase 4) */
  listVariantGames(userId: number): Promise<VariantGame[]>;
  getVariantGame(id: number): Promise<VariantGame | undefined>;
  createVariantGame(input: InsertVariantGame): Promise<VariantGame>;
  updateVariantGame(
    id: number,
    patch: Partial<Pick<VariantGame, "pgn" | "result" | "finishedAt">>,
  ): Promise<VariantGame | undefined>;

  /* library games (Phase 5: giant game database) */
  countLibraryGames(filter?: { tier?: string; source?: string }): Promise<number>;
  listLibraryGames(filter?: {
    tier?: string;
    source?: string;
    player?: string;
    eco?: string;
    minRating?: number;
    maxRating?: number;
    yearFrom?: number;
    yearTo?: number;
    limit?: number;
    offset?: number;
  }): Promise<LibraryGame[]>;
  getLibraryGame(id: number): Promise<LibraryGame | undefined>;
  getLibraryGameByHash(pgnHash: string): Promise<LibraryGame | undefined>;
  createLibraryGame(input: InsertLibraryGame): Promise<LibraryGame>;
  deleteLibraryGame(id: number): Promise<void>;
  /** Games whose epd index contains the given EPD. */
  listLibraryGamesByEpd(epd: string, limit?: number): Promise<LibraryGame[]>;

  getLibraryPositionStats(epd: string, tier: string): Promise<LibraryPositionStats | undefined>;
  upsertLibraryPositionStats(input: InsertLibraryPositionStats): Promise<LibraryPositionStats>;

  /** Opponent scout reports — replaces the old process-local `Map`. */
  getScoutEntry(id: string): Promise<StoredScoutCacheEntry | undefined>;
  upsertScoutEntry(entry: StoredScoutCacheEntry): Promise<void>;
  listScoutEntries(): Promise<StoredScoutCacheEntry[]>;
  deleteScoutEntry(id: string): Promise<void>;

  listCoachConversations(userId: number): Promise<CoachConversation[]>;
  getCoachConversation(id: number, userId: number): Promise<CoachConversation | undefined>;
  createCoachConversation(input: InsertCoachConversation): Promise<CoachConversation>;
  appendCoachMessage(
    id: number,
    userId: number,
    message: { role: "user" | "assistant"; content: string },
  ): Promise<CoachConversation | undefined>;
}

/** Shape stored for `/api/opponent-prep/scout` cache + PGN export. */
export interface StoredScoutCacheEntry {
  report: ScoutReport;
  games: unknown[];
  fetchedAt: number;
}

/* ====================================================================== */
/* In-memory implementation                                               */
/* ====================================================================== */

function normalizeStreakRow(s: UserStreak): UserStreak {
  return {
    ...s,
    xp: s.xp ?? 0,
    level: s.level ?? 1,
    weeklyXp: s.weeklyXp ?? 0,
  };
}

class InMemoryStorage implements IStorage {
  private nextId = 1;
  private id() {
    return this.nextId++;
  }

  private users = new Map<number, User>();
  private games = new Map<number, Game>();
  private analyses = new Map<number, GameAnalysis>(); // keyed by gameId
  private positions = new Map<string, ChessPosition>();
  private queries: ChessQuery[] = [];
  private openings = new Map<number, OpeningLine>();
  private opponents = new Map<string, OpponentProfile>(); // key = `${platform}:${username.toLowerCase()}`
  private problems = new Map<number, TrainingProblem>();
  private attempts: TrainingAttempt[] = [];
  private progress = new Map<string, TrainingProgress>(); // `${userId}:${module}`
  private dailies = new Map<string, DailyChallenge>(); // date string
  private streaks = new Map<number, UserStreak>();
  private motifDefs = new Map<string, MotifDefinition>(); // by key
  private motifInsts: MotifInstance[] = [];
  private motifMets = new Map<string, MotifMetric>(); // `${userId}:${motifKey}`
  private motifQs: MotifQuery[] = [];

  // Phase 1-4 collections.
  private motifSkills = new Map<string, UserMotifSkill>(); // `${userId}:${motifKey}`
  private srs = new Map<string, SrsCard>(); // `${userId}:${problemId}`
  private coachExplanations = new Map<string, CoachExplanation>(); // by cacheKey
  private savedSearches = new Map<number, SavedSearch>(); // by id
  private repertoires = new Map<number, Repertoire>();
  private repertoireNodes = new Map<number, RepertoireNode>();
  private repertoireDeviations: RepertoireDeviation[] = [];
  private variantGames = new Map<number, VariantGame>();

  // Phase 5: library
  private libraryGames = new Map<number, LibraryGame>();
  /** Reverse index: pgnHash → library game id. */
  private libraryHashIndex = new Map<string, number>();
  /** Reverse index: epd → set of library game ids that pass through it. */
  private libraryEpdIndex = new Map<string, Set<number>>();
  /** Cached aggregate stats keyed by `${epd}|${tier}`. */
  private libraryStats = new Map<string, LibraryPositionStats>();

  private scoutEntries = new Map<string, StoredScoutCacheEntry>();
  private coachThreads = new Map<number, CoachConversation>();

  /* ------------------------------------------------------------------ */
  /*  Persistence (in-memory mode only)                                  */
  /* ------------------------------------------------------------------ */
  private persistFile = path.resolve(
    process.env.STORAGE_FILE ?? path.join(process.cwd(), "data", "storage.json"),
  );
  private persistDir = path.dirname(this.persistFile);
  private filePersistEnabled =
    process.env.STORAGE_PERSIST !== "false" && !process.env.DATABASE_URL;
  private neonPersistEnabled = neonEnabled();
  private persistTimer: NodeJS.Timeout | null = null;
  private persistInFlight: Promise<void> | null = null;

  async init() {
    if (this.neonPersistEnabled) {
      try {
        await ensureNeonSnapshotTable();
        // Provision the relational mirror tables in parallel so the
        // first write-through doesn't pay the schema-create cost.
        void ensureRelationalTables();
        const remote = await loadNeonSnapshot();
        if (remote) this.applySnapshot(remote);
      } catch (err) {
        console.warn(`[storage] neon load failed: ${(err as Error).message}`);
      }
    } else if (this.filePersistEnabled && existsSync(this.persistFile)) {
      try {
        await this.loadFromDisk();
        // eslint-disable-next-line no-console
        console.log(
          `[storage] loaded ${this.games.size} games, ${this.problems.size} problems, ` +
            `${this.attempts.length} attempts from ${this.persistFile}`,
        );
      } catch (err) {
        console.warn(
          `[storage] persist file unreadable, starting empty: ${(err as Error).message}`,
        );
      }
    }
    if (this.users.size === 0) {
      const dev: User = {
        id: this.id(),
        username: "dev",
        email: null,
        password: "dev",
        preferences: null,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        subscriptionStatus: null,
        subscriptionPlan: null,
        subscriptionCurrentPeriodEnd: null,
        subscriptionCancelAtPeriodEnd: false,
        createdAt: new Date(),
      };
      this.users.set(dev.id, dev);
      this.schedulePersist();
    }
  }

  /**
   * Schedule a debounced flush to disk. Coalesces rapid bursts of writes
   * (e.g. seeding 50+ training problems on startup) into a single I/O.
   */
  private schedulePersist(): void {
    if (!this.filePersistEnabled && !this.neonPersistEnabled) return;
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      // Chain so two flushes can't race; await previous before kicking the
      // next one.
      this.persistInFlight = (this.persistInFlight ?? Promise.resolve())
        .then(() => this.flushToDisk())
        .catch((err) =>
          console.warn(`[storage] persist failed: ${(err as Error).message}`),
        );
    }, 1000);
  }

  private buildSnapshot(): Record<string, unknown> {
    return {
      version: 1,
      nextId: this.nextId,
      users: [...this.users.values()],
      games: [...this.games.values()],
      analyses: [...this.analyses.values()],
      positions: [...this.positions.values()],
      queries: this.queries,
      openings: [...this.openings.values()],
      opponents: [...this.opponents.entries()],
      problems: [...this.problems.values()],
      attempts: this.attempts,
      progress: [...this.progress.entries()],
      dailies: [...this.dailies.entries()],
      streaks: [...this.streaks.values()],
      motifDefs: [...this.motifDefs.values()],
      motifInsts: this.motifInsts,
      motifMets: [...this.motifMets.entries()],
      motifQs: this.motifQs,
      motifSkills: [...this.motifSkills.entries()],
      srs: [...this.srs.entries()],
      coachExplanations: [...this.coachExplanations.values()],
      savedSearches: [...this.savedSearches.values()],
      repertoires: [...this.repertoires.values()],
      repertoireNodes: [...this.repertoireNodes.values()],
      repertoireDeviations: this.repertoireDeviations,
      variantGames: [...this.variantGames.values()],
      libraryGames: [...this.libraryGames.values()],
      libraryStats: [...this.libraryStats.values()],
      scoutEntries: [...this.scoutEntries.entries()],
      coachThreads: [...this.coachThreads.values()],
    };
  }

  private applySnapshot(raw: unknown): void {
    const snapshot = raw as {
      nextId?: number;
      users?: User[];
      games?: Game[];
      analyses?: GameAnalysis[];
      positions?: ChessPosition[];
      queries?: ChessQuery[];
      openings?: OpeningLine[];
      opponents?: [string, OpponentProfile][];
      problems?: TrainingProblem[];
      attempts?: TrainingAttempt[];
      progress?: [string, TrainingProgress][];
      dailies?: [string, DailyChallenge][];
      streaks?: UserStreak[];
      motifDefs?: MotifDefinition[];
      motifInsts?: MotifInstance[];
      motifMets?: [string, MotifMetric][];
      motifQs?: MotifQuery[];
      motifSkills?: [string, UserMotifSkill][];
      srs?: [string, SrsCard][];
      coachExplanations?: CoachExplanation[];
      savedSearches?: SavedSearch[];
      repertoires?: Repertoire[];
      repertoireNodes?: RepertoireNode[];
      repertoireDeviations?: RepertoireDeviation[];
      variantGames?: VariantGame[];
      libraryGames?: LibraryGame[];
      libraryStats?: LibraryPositionStats[];
      scoutEntries?: [string, StoredScoutCacheEntry][];
      coachThreads?: CoachConversation[];
    };
    this.nextId = snapshot.nextId ?? 1;
    for (const u of snapshot.users ?? []) {
      const raw = u as Partial<User>;
      const row: User = {
        ...(u as User),
        email: raw.email ?? null,
        stripeCustomerId: raw.stripeCustomerId ?? null,
        stripeSubscriptionId: raw.stripeSubscriptionId ?? null,
        subscriptionStatus: raw.subscriptionStatus ?? null,
        subscriptionPlan: raw.subscriptionPlan ?? null,
        subscriptionCurrentPeriodEnd: raw.subscriptionCurrentPeriodEnd
          ? new Date(raw.subscriptionCurrentPeriodEnd)
          : null,
        subscriptionCancelAtPeriodEnd: raw.subscriptionCancelAtPeriodEnd ?? false,
      };
      this.users.set(row.id, row);
    }
    for (const g of snapshot.games ?? []) this.games.set(g.id, g);
    for (const a of snapshot.analyses ?? []) this.analyses.set(a.gameId, a);
    for (const p of snapshot.positions ?? []) this.positions.set(p.fen, p);
    this.queries = snapshot.queries ?? [];
    for (const o of snapshot.openings ?? []) this.openings.set(o.id, o);
    for (const [k, v] of snapshot.opponents ?? []) this.opponents.set(k, v);
    for (const p of snapshot.problems ?? []) this.problems.set(p.id, p);
    this.attempts = snapshot.attempts ?? [];
    for (const [k, v] of snapshot.progress ?? []) this.progress.set(k, v);
    for (const [k, v] of snapshot.dailies ?? []) this.dailies.set(k, v);
    for (const s of snapshot.streaks ?? []) this.streaks.set(s.userId, normalizeStreakRow(s));
    for (const d of snapshot.motifDefs ?? []) this.motifDefs.set(d.key, d);
    this.motifInsts = snapshot.motifInsts ?? [];
    for (const [k, v] of snapshot.motifMets ?? []) this.motifMets.set(k, v);
    this.motifQs = snapshot.motifQs ?? [];
    for (const [k, v] of snapshot.motifSkills ?? []) this.motifSkills.set(k, v);
    for (const [k, v] of snapshot.srs ?? []) this.srs.set(k, v);
    for (const c of snapshot.coachExplanations ?? []) this.coachExplanations.set(c.cacheKey, c);
    for (const s of snapshot.savedSearches ?? []) this.savedSearches.set(s.id, s);
    for (const r of snapshot.repertoires ?? []) this.repertoires.set(r.id, r);
    for (const n of snapshot.repertoireNodes ?? []) this.repertoireNodes.set(n.id, n);
    this.repertoireDeviations = snapshot.repertoireDeviations ?? [];
    for (const v of snapshot.variantGames ?? []) {
      // Back-compat: rows persisted before the playerColor field landed
      // default to white so old saves stay playable.
      const normalized: VariantGame = {
        ...v,
        playerColor: (v as { playerColor?: "white" | "black" }).playerColor ?? "white",
      };
      this.variantGames.set(normalized.id, normalized);
    }
    for (const g of snapshot.libraryGames ?? []) {
      this.libraryGames.set(g.id, g);
      this.libraryHashIndex.set(g.pgnHash, g.id);
      for (const epd of g.epds ?? []) {
        let s = this.libraryEpdIndex.get(epd);
        if (!s) {
          s = new Set();
          this.libraryEpdIndex.set(epd, s);
        }
        s.add(g.id);
      }
    }
    for (const s of snapshot.libraryStats ?? []) {
      this.libraryStats.set(`${s.epd}|${s.tier}`, s);
    }
    this.scoutEntries.clear();
    for (const [k, v] of snapshot.scoutEntries ?? []) {
      this.scoutEntries.set(k, v);
    }
    this.coachThreads.clear();
    for (const c of snapshot.coachThreads ?? []) {
      this.coachThreads.set(c.id, {
        ...c,
        updatedAt: c.updatedAt instanceof Date ? c.updatedAt : new Date(c.updatedAt),
      });
    }
  }

  private async flushToDisk(): Promise<void> {
    const snapshot = this.buildSnapshot();
    if (this.filePersistEnabled) {
      await fs.mkdir(this.persistDir, { recursive: true });
      const tmp = `${this.persistFile}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(snapshot));
      await fs.rename(tmp, this.persistFile);
    }
    if (this.neonPersistEnabled) {
      await ensureNeonSnapshotTable();
      await saveNeonSnapshot(snapshot);
    }
  }

  private async loadFromDisk(): Promise<void> {
    const raw = await fs.readFile(this.persistFile, "utf8");
    const snapshot = JSON.parse(raw, dateReviver);
    this.applySnapshot(snapshot);
  }

  /* users */
  async getUser(id: number) {
    return this.users.get(id);
  }
  async getUserByUsername(username: string) {
    for (const u of this.users.values()) if (u.username === username) return u;
    return undefined;
  }
  async getUserByEmail(email: string) {
    const lower = email.trim().toLowerCase();
    for (const u of this.users.values()) {
      if (u.email && u.email.toLowerCase() === lower) return u;
    }
    return undefined;
  }
  async createUser(input: InsertUser) {
    const u: User = {
      ...input,
      email: input.email ?? null,
      preferences: (input.preferences as User["preferences"] | null | undefined) ?? null,
      stripeCustomerId: input.stripeCustomerId ?? null,
      stripeSubscriptionId: input.stripeSubscriptionId ?? null,
      subscriptionStatus: input.subscriptionStatus ?? null,
      subscriptionPlan: input.subscriptionPlan ?? null,
      subscriptionCurrentPeriodEnd: input.subscriptionCurrentPeriodEnd ?? null,
      subscriptionCancelAtPeriodEnd: input.subscriptionCancelAtPeriodEnd ?? false,
      id: this.id(),
      createdAt: new Date(),
    };
    this.users.set(u.id, u);
    this.schedulePersist();
    return u;
  }
  async updateUserPreferences(userId: number, preferences: Record<string, unknown>) {
    const u = this.users.get(userId);
    if (!u) return undefined;
    const merged = {
      ...((u.preferences as Record<string, unknown> | null) ?? {}),
      ...preferences,
    };
    const next = { ...u, preferences: merged } as User;
    this.users.set(userId, next);
    this.schedulePersist();
    return next;
  }
  async updateUserEmail(userId: number, email: string | null) {
    const u = this.users.get(userId);
    if (!u) return undefined;
    const next = { ...u, email: email ? email.trim().toLowerCase() : null } as User;
    this.users.set(userId, next);
    this.schedulePersist();
    return next;
  }
  async updateUserPassword(userId: number, passwordHash: string) {
    const u = this.users.get(userId);
    if (!u) return undefined;
    const next = { ...u, password: passwordHash } as User;
    this.users.set(userId, next);
    this.schedulePersist();
    return next;
  }
  async getUserByStripeCustomerId(stripeCustomerId: string) {
    for (const u of this.users.values()) {
      if (u.stripeCustomerId === stripeCustomerId) return u;
    }
    return undefined;
  }
  async updateUserSubscription(
    userId: number,
    patch: {
      stripeCustomerId?: string | null;
      stripeSubscriptionId?: string | null;
      subscriptionStatus?: string | null;
      subscriptionPlan?: string | null;
      subscriptionCurrentPeriodEnd?: Date | null;
      subscriptionCancelAtPeriodEnd?: boolean;
    },
  ) {
    const u = this.users.get(userId);
    if (!u) return undefined;
    const next: User = {
      ...u,
      stripeCustomerId:
        patch.stripeCustomerId !== undefined ? patch.stripeCustomerId : u.stripeCustomerId,
      stripeSubscriptionId:
        patch.stripeSubscriptionId !== undefined
          ? patch.stripeSubscriptionId
          : u.stripeSubscriptionId,
      subscriptionStatus:
        patch.subscriptionStatus !== undefined
          ? patch.subscriptionStatus
          : u.subscriptionStatus,
      subscriptionPlan:
        patch.subscriptionPlan !== undefined ? patch.subscriptionPlan : u.subscriptionPlan,
      subscriptionCurrentPeriodEnd:
        patch.subscriptionCurrentPeriodEnd !== undefined
          ? patch.subscriptionCurrentPeriodEnd
          : u.subscriptionCurrentPeriodEnd,
      subscriptionCancelAtPeriodEnd:
        patch.subscriptionCancelAtPeriodEnd !== undefined
          ? patch.subscriptionCancelAtPeriodEnd
          : u.subscriptionCancelAtPeriodEnd,
    };
    this.users.set(userId, next);
    this.schedulePersist();
    return next;
  }

  /* games */
  async listGames(userId?: number) {
    const all = Array.from(this.games.values());
    return (userId == null ? all : all.filter((g) => g.userId === userId)).sort((a, b) => {
      const at = (a.playedAt ?? a.createdAt).getTime();
      const bt = (b.playedAt ?? b.createdAt).getTime();
      return bt - at;
    });
  }
  async getGame(id: number) {
    return this.games.get(id);
  }
  async createGame(input: InsertGame) {
    const g: Game = {
      id: this.id(),
      userId: input.userId ?? null,
      pgn: input.pgn,
      whitePlayer: input.whitePlayer ?? null,
      blackPlayer: input.blackPlayer ?? null,
      whiteRating: input.whiteRating ?? null,
      blackRating: input.blackRating ?? null,
      result: input.result ?? null,
      source: input.source ?? null,
      timeControl: input.timeControl ?? null,
      eco: input.eco ?? null,
      opening: input.opening ?? null,
      playedAt: input.playedAt ?? null,
      createdAt: new Date(),
    };
    this.games.set(g.id, g);
    this.schedulePersist();
    return g;
  }
  async deleteGame(id: number) {
    this.games.delete(id);
    this.analyses.delete(id);
    this.schedulePersist();
  }

  /* analysis */
  async getAnalysisForGame(gameId: number) {
    return this.analyses.get(gameId);
  }
  async upsertGameAnalysis(input: InsertGameAnalysis) {
    const existing = this.analyses.get(input.gameId);
    const a: GameAnalysis = {
      id: existing?.id ?? this.id(),
      gameId: input.gameId,
      whiteAccuracy: input.whiteAccuracy ?? null,
      blackAccuracy: input.blackAccuracy ?? null,
      moveAnalysis: input.moveAnalysis ?? null,
      evalGraph: input.evalGraph ?? null,
      whitePhaseGrades: input.whitePhaseGrades ?? null,
      blackPhaseGrades: input.blackPhaseGrades ?? null,
      depth: input.depth ?? null,
      createdAt: existing?.createdAt ?? new Date(),
    };
    this.analyses.set(a.gameId, a);
    this.schedulePersist();
    return a;
  }

  /* positions */
  async getPositionByFen(fen: string) {
    return this.positions.get(fen);
  }
  async upsertPosition(input: InsertChessPosition) {
    const existing = this.positions.get(input.fen);
    const p: ChessPosition = {
      id: existing?.id ?? this.id(),
      fen: input.fen,
      evaluation: input.evaluation ?? null,
      bestMove: input.bestMove ?? null,
      pv: input.pv ?? null,
      depth: input.depth ?? null,
      mateIn: input.mateIn ?? null,
      data: input.data ?? null,
      createdAt: existing?.createdAt ?? new Date(),
    };
    this.positions.set(p.fen, p);
    this.schedulePersist();
    return p;
  }

  /* queries */
  async createChessQuery(input: InsertChessQuery) {
    const q: ChessQuery = {
      id: this.id(),
      userId: input.userId ?? null,
      query: input.query,
      parsedCriteria: input.parsedCriteria ?? null,
      results: input.results ?? null,
      createdAt: new Date(),
    };
    this.queries.unshift(q);
    this.schedulePersist();
    return q;
  }
  async listChessQueries(userId?: number) {
    return userId == null ? this.queries.slice(0, 50) : this.queries.filter((q) => q.userId === userId);
  }

  /* openings */
  async listOpenings() {
    return Array.from(this.openings.values());
  }
  async upsertOpening(input: InsertOpeningLine) {
    const o: OpeningLine = {
      id: this.id(),
      eco: input.eco,
      name: input.name,
      moves: input.moves,
      evaluation: input.evaluation ?? null,
      whiteWinRate: input.whiteWinRate ?? null,
      drawRate: input.drawRate ?? null,
      blackWinRate: input.blackWinRate ?? null,
      popularity: input.popularity ?? null,
    };
    this.openings.set(o.id, o);
    this.schedulePersist();
    return o;
  }

  /* opponents */
  async getOpponentProfile(username: string, platform: string) {
    return this.opponents.get(`${platform}:${username.toLowerCase()}`);
  }
  async upsertOpponentProfile(input: InsertOpponentProfile) {
    const key = `${input.platform}:${input.username.toLowerCase()}`;
    const existing = this.opponents.get(key);
    const p: OpponentProfile = {
      id: existing?.id ?? this.id(),
      username: input.username,
      platform: input.platform,
      openingTree: input.openingTree ?? null,
      weaknesses: input.weaknesses ?? null,
      tacticalPatterns: input.tacticalPatterns ?? null,
      averageRating: input.averageRating ?? null,
      gamesAnalyzed: input.gamesAnalyzed ?? 0,
      updatedAt: new Date(),
    };
    this.opponents.set(key, p);
    this.schedulePersist();
    return p;
  }

  /* training */
  async listTrainingProblems(filter?: { module?: string; tacticType?: string; difficulty?: number }) {
    let arr = Array.from(this.problems.values());
    if (filter?.module) arr = arr.filter((p) => p.module === filter.module);
    if (filter?.tacticType) arr = arr.filter((p) => p.tacticType === filter.tacticType);
    if (filter?.difficulty != null) arr = arr.filter((p) => p.difficulty === filter.difficulty);
    return arr;
  }
  async getTrainingProblem(id: number) {
    return this.problems.get(id);
  }
  async createTrainingProblem(input: InsertTrainingProblem) {
    const p: TrainingProblem = {
      id: this.id(),
      module: input.module,
      fen: input.fen,
      solution: input.solution,
      difficulty: input.difficulty ?? 3,
      themes: input.themes ?? null,
      tacticType: input.tacticType ?? null,
      explanation: input.explanation ?? null,
      source: input.source ?? null,
      sourceGameId: input.sourceGameId ?? null,
      metadata: input.metadata ?? null,
      createdAt: new Date(),
    };
    this.problems.set(p.id, p);
    this.schedulePersist();
    return p;
  }
  async countTrainingProblems(filter?: { module?: string }) {
    return (await this.listTrainingProblems(filter)).length;
  }
  async deleteTrainingProblem(id: number) {
    const ok = this.problems.delete(id);
    if (ok) this.schedulePersist();
    return ok;
  }

  async recordAttempt(input: InsertTrainingAttempt) {
    const a: TrainingAttempt = {
      id: this.id(),
      userId: input.userId,
      problemId: input.problemId,
      solved: input.solved,
      timeSpent: input.timeSpent,
      movesPlayed: input.movesPlayed ?? null,
      createdAt: new Date(),
    };
    this.attempts.push(a);
    this.schedulePersist();
    // Best-effort write-through to the relational mirror so SQL
    // analytics dashboards can query attempts directly.
    void mirrorTrainingAttempt(input);
    return a;
  }
  async listAttempts(userId: number, problemId?: number) {
    return this.attempts.filter(
      (a) => a.userId === userId && (problemId == null || a.problemId === problemId),
    );
  }

  async getProgress(userId: number, module: string) {
    return this.progress.get(`${userId}:${module}`);
  }
  async upsertProgress(input: InsertTrainingProgress) {
    const key = `${input.userId}:${input.module}`;
    const existing = this.progress.get(key);
    const p: TrainingProgress = {
      id: existing?.id ?? this.id(),
      userId: input.userId,
      module: input.module,
      rating: input.rating ?? existing?.rating ?? 1200,
      problemsSolved: input.problemsSolved ?? existing?.problemsSolved ?? 0,
      totalAttempts: input.totalAttempts ?? existing?.totalAttempts ?? 0,
      accuracy: input.accuracy ?? existing?.accuracy ?? 0,
      lastPracticed: input.lastPracticed ?? new Date(),
    };
    this.progress.set(key, p);
    this.schedulePersist();
    return p;
  }
  async listProgress(userId: number) {
    return Array.from(this.progress.values()).filter((p) => p.userId === userId);
  }

  /* daily */
  async getDailyChallenge(date: string) {
    return this.dailies.get(date);
  }
  async setDailyChallenge(input: InsertDailyChallenge) {
    const d: DailyChallenge = {
      id: this.dailies.get(String(input.date))?.id ?? this.id(),
      problemId: input.problemId,
      date: input.date,
    };
    this.dailies.set(String(d.date), d);
    this.schedulePersist();
    return d;
  }

  async getStreak(userId: number) {
    return this.streaks.get(userId);
  }
  async upsertStreak(input: InsertUserStreak) {
    const existing = this.streaks.get(input.userId);
    const s: UserStreak = {
      id: existing?.id ?? this.id(),
      userId: input.userId,
      currentStreak: input.currentStreak ?? existing?.currentStreak ?? 0,
      longestStreak: input.longestStreak ?? existing?.longestStreak ?? 0,
      lastActivityDate: input.lastActivityDate ?? existing?.lastActivityDate ?? null,
      xp: input.xp ?? existing?.xp ?? 0,
      level: input.level ?? existing?.level ?? 1,
      weeklyXp: input.weeklyXp ?? existing?.weeklyXp ?? 0,
    };
    this.streaks.set(s.userId, s);
    this.schedulePersist();
    void mirrorUserStreak({
      userId: s.userId,
      currentStreak: s.currentStreak,
      longestStreak: s.longestStreak,
      lastActivityDate: s.lastActivityDate ?? null,
      xp: s.xp,
      level: s.level,
      weeklyXp: s.weeklyXp,
    });
    return s;
  }

  /* motifs */
  async listMotifDefinitions() {
    return Array.from(this.motifDefs.values());
  }
  async upsertMotifDefinition(input: InsertMotifDefinition) {
    const existing = this.motifDefs.get(input.key);
    const d: MotifDefinition = {
      id: existing?.id ?? this.id(),
      key: input.key,
      name: input.name,
      category: input.category,
      description: input.description ?? null,
      detectionParams: input.detectionParams ?? null,
    };
    this.motifDefs.set(d.key, d);
    this.schedulePersist();
    return d;
  }
  async recordMotifInstance(input: InsertMotifInstance) {
    const i: MotifInstance = {
      id: this.id(),
      motifKey: input.motifKey,
      gameId: input.gameId ?? null,
      ply: input.ply ?? null,
      fen: input.fen ?? null,
      data: input.data ?? null,
      createdAt: new Date(),
    };
    this.motifInsts.push(i);
    this.schedulePersist();
    return i;
  }
  async listMotifInstances(filter?: { motifKey?: string; gameId?: number }) {
    return this.motifInsts.filter(
      (m) =>
        (filter?.motifKey ? m.motifKey === filter.motifKey : true) &&
        (filter?.gameId ? m.gameId === filter.gameId : true),
    );
  }
  async upsertMotifMetric(input: InsertMotifMetric) {
    const key = `${input.userId}:${input.motifKey}`;
    const existing = this.motifMets.get(key);
    const m: MotifMetric = {
      id: existing?.id ?? this.id(),
      userId: input.userId,
      motifKey: input.motifKey,
      attempts: input.attempts ?? 0,
      correct: input.correct ?? 0,
      accuracy: input.accuracy ?? 0,
      lastSeenAt: input.lastSeenAt ?? new Date(),
    };
    this.motifMets.set(key, m);
    this.schedulePersist();
    return m;
  }
  async listMotifMetrics(userId: number) {
    return Array.from(this.motifMets.values()).filter((m) => m.userId === userId);
  }
  async recordMotifQuery(input: InsertMotifQuery) {
    const q: MotifQuery = {
      id: this.id(),
      userId: input.userId ?? null,
      query: input.query,
      results: input.results ?? null,
      createdAt: new Date(),
    };
    this.motifQs.push(q);
    this.schedulePersist();
    return q;
  }

  /* ---------------------------------------------------------------- */
  /* Phase 1.1: user motif skill                                       */
  /* ---------------------------------------------------------------- */
  async getUserMotifSkill(userId: number, motifKey: string) {
    return this.motifSkills.get(`${userId}:${motifKey}`);
  }
  async listUserMotifSkills(userId: number) {
    return Array.from(this.motifSkills.values()).filter((s) => s.userId === userId);
  }
  async upsertUserMotifSkill(input: InsertUserMotifSkill) {
    const key = `${input.userId}:${input.motifKey}`;
    const existing = this.motifSkills.get(key);
    const s: UserMotifSkill = {
      id: existing?.id ?? this.id(),
      userId: input.userId,
      motifKey: input.motifKey,
      rating: input.rating,
      rd: input.rd,
      attempts: input.attempts,
      correct: input.correct,
      updatedAt: input.updatedAt ?? new Date(),
    };
    this.motifSkills.set(key, s);
    this.schedulePersist();
    void mirrorMotifSkill({
      userId: s.userId,
      motifKey: s.motifKey,
      rating: s.rating,
      rd: s.rd,
      attempts: s.attempts,
      correct: s.correct,
    });
    return s;
  }

  /* ---------------------------------------------------------------- */
  /* Phase 1.3: SRS cards                                              */
  /* ---------------------------------------------------------------- */
  async getSrsCard(userId: number, problemId: number) {
    return this.srs.get(`${userId}:${problemId}`);
  }
  async listDueSrsCards(userId: number, now: Date, limit = 25) {
    const cutoff = now.getTime();
    return Array.from(this.srs.values())
      .filter((c) => c.userId === userId && c.dueAt.getTime() <= cutoff)
      .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())
      .slice(0, limit);
  }
  async upsertSrsCard(input: InsertSrsCard) {
    const key = `${input.userId}:${input.problemId}`;
    const existing = this.srs.get(key);
    const c: SrsCard = {
      id: existing?.id ?? this.id(),
      userId: input.userId,
      problemId: input.problemId,
      easeFactor: input.easeFactor,
      intervalDays: input.intervalDays,
      repetitions: input.repetitions,
      dueAt: input.dueAt,
      lastReviewedAt: input.lastReviewedAt,
      createdAt: existing?.createdAt ?? input.createdAt ?? new Date(),
      fsrsState: input.fsrsState ?? existing?.fsrsState,
    };
    this.srs.set(key, c);
    this.schedulePersist();
    return c;
  }

  /* ---------------------------------------------------------------- */
  /* Phase 1.2: coach explanations                                     */
  /* ---------------------------------------------------------------- */
  async getCoachExplanation(cacheKey: string) {
    return this.coachExplanations.get(cacheKey);
  }
  async upsertCoachExplanation(input: InsertCoachExplanation) {
    const existing = this.coachExplanations.get(input.cacheKey);
    const e: CoachExplanation = {
      id: existing?.id ?? this.id(),
      cacheKey: input.cacheKey,
      fen: input.fen,
      userMove: input.userMove,
      correctMove: input.correctMove,
      motif: input.motif,
      text: input.text,
      model: input.model,
      createdAt: existing?.createdAt ?? input.createdAt ?? new Date(),
    };
    this.coachExplanations.set(input.cacheKey, e);
    this.schedulePersist();
    return e;
  }

  /* ---------------------------------------------------------------- */
  /* Phase 2.2: saved searches                                         */
  /* ---------------------------------------------------------------- */
  async listSavedSearches(userId: number) {
    return Array.from(this.savedSearches.values())
      .filter((s) => s.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  async createSavedSearch(input: InsertSavedSearch) {
    const s: SavedSearch = {
      id: this.id(),
      userId: input.userId,
      name: input.name,
      query: input.query,
      createdAt: input.createdAt ?? new Date(),
    };
    this.savedSearches.set(s.id, s);
    this.schedulePersist();
    return s;
  }
  async deleteSavedSearch(id: number) {
    this.savedSearches.delete(id);
    this.schedulePersist();
  }

  /* ---------------------------------------------------------------- */
  /* Phase 3.3: repertoire trainer                                     */
  /* ---------------------------------------------------------------- */
  async listRepertoires(userId: number) {
    return Array.from(this.repertoires.values()).filter((r) => r.userId === userId);
  }
  async getRepertoire(id: number) {
    return this.repertoires.get(id);
  }
  async createRepertoire(input: InsertRepertoire) {
    const r: Repertoire = {
      id: this.id(),
      userId: input.userId,
      name: input.name,
      color: input.color,
      createdAt: input.createdAt ?? new Date(),
    };
    this.repertoires.set(r.id, r);
    this.schedulePersist();
    return r;
  }
  async deleteRepertoire(id: number) {
    this.repertoires.delete(id);
    for (const [nodeId, node] of this.repertoireNodes) {
      if (node.repertoireId === id) this.repertoireNodes.delete(nodeId);
    }
    this.repertoireDeviations = this.repertoireDeviations.filter(
      (d) => d.repertoireId !== id,
    );
    this.schedulePersist();
  }
  async listRepertoireNodes(repertoireId: number) {
    return Array.from(this.repertoireNodes.values()).filter(
      (n) => n.repertoireId === repertoireId,
    );
  }
  async createRepertoireNode(input: InsertRepertoireNode) {
    const n: RepertoireNode = {
      id: this.id(),
      repertoireId: input.repertoireId,
      parentId: input.parentId,
      fen: input.fen,
      san: input.san,
      comment: input.comment,
      createdAt: input.createdAt ?? new Date(),
    };
    this.repertoireNodes.set(n.id, n);
    this.schedulePersist();
    return n;
  }
  async recordRepertoireDeviation(input: InsertRepertoireDeviation) {
    const d: RepertoireDeviation = {
      id: this.id(),
      repertoireId: input.repertoireId,
      userId: input.userId,
      fen: input.fen,
      san: input.san,
      side: input.side,
      source: input.source,
      gameId: input.gameId,
      createdAt: input.createdAt ?? new Date(),
    };
    this.repertoireDeviations.push(d);
    this.schedulePersist();
    return d;
  }
  async listRepertoireDeviations(repertoireId: number) {
    return this.repertoireDeviations.filter((d) => d.repertoireId === repertoireId);
  }

  /* ---------------------------------------------------------------- */
  /* Phase 4: variant games                                            */
  /* ---------------------------------------------------------------- */
  async listVariantGames(userId: number) {
    return Array.from(this.variantGames.values())
      .filter((g) => g.userId === userId)
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  }
  async getVariantGame(id: number) {
    return this.variantGames.get(id);
  }
  async createVariantGame(input: InsertVariantGame) {
    const g: VariantGame = {
      id: this.id(),
      userId: input.userId,
      variant: input.variant,
      persona: input.persona,
      startFen: input.startFen,
      pgn: input.pgn,
      result: input.result,
      timeControl: input.timeControl,
      playerColor: input.playerColor ?? "white",
      startedAt: input.startedAt ?? new Date(),
      finishedAt: input.finishedAt,
    };
    this.variantGames.set(g.id, g);
    this.schedulePersist();
    return g;
  }
  async updateVariantGame(
    id: number,
    patch: Partial<Pick<VariantGame, "pgn" | "result" | "finishedAt">>,
  ) {
    const existing = this.variantGames.get(id);
    if (!existing) return undefined;
    const updated: VariantGame = { ...existing, ...patch };
    this.variantGames.set(id, updated);
    this.schedulePersist();
    return updated;
  }

  /* ---------------------------------------------------------------- */
  /* Phase 5: library games + position stats                           */
  /* ---------------------------------------------------------------- */
  async countLibraryGames(filter?: { tier?: string; source?: string }) {
    let n = 0;
    for (const g of this.libraryGames.values()) {
      if (filter?.tier && g.tier !== filter.tier) continue;
      if (filter?.source && g.source !== filter.source) continue;
      n++;
    }
    return n;
  }

  async listLibraryGames(filter?: {
    tier?: string;
    source?: string;
    player?: string;
    eco?: string;
    minRating?: number;
    maxRating?: number;
    yearFrom?: number;
    yearTo?: number;
    limit?: number;
    offset?: number;
  }) {
    let arr = Array.from(this.libraryGames.values());
    if (filter?.tier) arr = arr.filter((g) => g.tier === filter.tier);
    if (filter?.source) arr = arr.filter((g) => g.source === filter.source);
    if (filter?.eco) {
      const eco = filter.eco.toUpperCase();
      arr = arr.filter((g) => (g.eco ?? "").toUpperCase().startsWith(eco));
    }
    if (filter?.player) {
      const q = filter.player.toLowerCase();
      arr = arr.filter(
        (g) =>
          (g.whitePlayer ?? "").toLowerCase().includes(q) ||
          (g.blackPlayer ?? "").toLowerCase().includes(q),
      );
    }
    if (filter?.minRating != null) {
      arr = arr.filter((g) => (g.avgRating ?? 0) >= (filter.minRating as number));
    }
    if (filter?.maxRating != null) {
      arr = arr.filter((g) => (g.avgRating ?? 9999) <= (filter.maxRating as number));
    }
    if (filter?.yearFrom != null) {
      arr = arr.filter(
        (g) => (g.playedAt ? g.playedAt.getFullYear() : 0) >= (filter.yearFrom as number),
      );
    }
    if (filter?.yearTo != null) {
      arr = arr.filter(
        (g) => (g.playedAt ? g.playedAt.getFullYear() : 9999) <= (filter.yearTo as number),
      );
    }
    arr.sort((a, b) => {
      const at = (a.playedAt ?? a.createdAt).getTime();
      const bt = (b.playedAt ?? b.createdAt).getTime();
      return bt - at;
    });
    const offset = filter?.offset ?? 0;
    const limit = filter?.limit ?? 50;
    return arr.slice(offset, offset + limit);
  }

  async getLibraryGame(id: number) {
    return this.libraryGames.get(id);
  }

  async getLibraryGameByHash(pgnHash: string) {
    const id = this.libraryHashIndex.get(pgnHash);
    return id == null ? undefined : this.libraryGames.get(id);
  }

  async createLibraryGame(input: InsertLibraryGame) {
    // Dedupe by hash — return existing instead of inserting twice.
    const existingId = this.libraryHashIndex.get(input.pgnHash);
    if (existingId != null) {
      const existing = this.libraryGames.get(existingId);
      if (existing) return existing;
    }
    const g: LibraryGame = {
      id: this.id(),
      pgnHash: input.pgnHash,
      source: input.source,
      tier: input.tier,
      whitePlayer: input.whitePlayer,
      blackPlayer: input.blackPlayer,
      whiteRating: input.whiteRating,
      blackRating: input.blackRating,
      avgRating: input.avgRating,
      result: input.result,
      eco: input.eco,
      opening: input.opening,
      event: input.event,
      site: input.site,
      playedAt: input.playedAt,
      timeControl: input.timeControl,
      plyCount: input.plyCount,
      pgn: input.pgn,
      epds: input.epds ?? [],
      firstSans: input.firstSans ?? [],
      firstUcis: input.firstUcis ?? [],
      createdAt: input.createdAt ?? new Date(),
    };
    this.libraryGames.set(g.id, g);
    this.libraryHashIndex.set(g.pgnHash, g.id);
    for (const epd of g.epds) {
      let s = this.libraryEpdIndex.get(epd);
      if (!s) {
        s = new Set();
        this.libraryEpdIndex.set(epd, s);
      }
      s.add(g.id);
    }
    this.schedulePersist();
    return g;
  }

  async deleteLibraryGame(id: number) {
    const g = this.libraryGames.get(id);
    if (!g) return;
    this.libraryGames.delete(id);
    this.libraryHashIndex.delete(g.pgnHash);
    for (const epd of g.epds) {
      const s = this.libraryEpdIndex.get(epd);
      if (s) {
        s.delete(id);
        if (s.size === 0) this.libraryEpdIndex.delete(epd);
      }
    }
    this.schedulePersist();
  }

  async listLibraryGamesByEpd(epd: string, limit = 20) {
    const ids = this.libraryEpdIndex.get(epd);
    if (!ids) return [];
    const out: LibraryGame[] = [];
    for (const id of ids) {
      const g = this.libraryGames.get(id);
      if (g) out.push(g);
      if (out.length >= limit) break;
    }
    return out.sort((a, b) => (b.avgRating ?? 0) - (a.avgRating ?? 0));
  }

  async getLibraryPositionStats(epd: string, tier: string) {
    return this.libraryStats.get(`${epd}|${tier}`);
  }

  async upsertLibraryPositionStats(input: InsertLibraryPositionStats) {
    const key = `${input.epd}|${input.tier}`;
    const existing = this.libraryStats.get(key);
    const s: LibraryPositionStats = {
      id: existing?.id ?? this.id(),
      epd: input.epd,
      tier: input.tier,
      whiteWins: input.whiteWins,
      draws: input.draws,
      blackWins: input.blackWins,
      totalGames: input.totalGames,
      avgRating: input.avgRating,
      moves: input.moves,
      sampleGames: input.sampleGames,
      refreshedAt: input.refreshedAt,
      createdAt: existing?.createdAt ?? input.createdAt ?? new Date(),
    };
    this.libraryStats.set(key, s);
    this.schedulePersist();
    return s;
  }

  /* scout + coach (persisted via snapshot / Neon) */
  async getScoutEntry(id: string) {
    return this.scoutEntries.get(id);
  }
  async upsertScoutEntry(entry: StoredScoutCacheEntry) {
    this.scoutEntries.set(entry.report.id, entry);
    this.schedulePersist();
  }
  async listScoutEntries() {
    return Array.from(this.scoutEntries.values());
  }
  async deleteScoutEntry(id: string) {
    this.scoutEntries.delete(id);
    this.schedulePersist();
  }

  async listCoachConversations(userId: number) {
    return Array.from(this.coachThreads.values())
      .filter((c) => c.userId === userId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }
  async getCoachConversation(id: number, userId: number) {
    const c = this.coachThreads.get(id);
    if (!c || c.userId !== userId) return undefined;
    return c;
  }
  async createCoachConversation(input: InsertCoachConversation) {
    const row: CoachConversation = {
      id: this.id(),
      userId: input.userId,
      title: input.title,
      messages: input.messages ?? [],
      updatedAt: input.updatedAt ?? new Date(),
    };
    this.coachThreads.set(row.id, row);
    this.schedulePersist();
    return row;
  }
  async appendCoachMessage(
    id: number,
    userId: number,
    message: { role: "user" | "assistant"; content: string },
  ) {
    const c = this.coachThreads.get(id);
    if (!c || c.userId !== userId) return undefined;
    const msg = { ...message, at: new Date().toISOString() };
    const next: CoachConversation = {
      ...c,
      messages: [...c.messages, msg],
      updatedAt: new Date(),
    };
    this.coachThreads.set(id, next);
    this.schedulePersist();
    return next;
  }
}

const ISO_DATE_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;

/**
 * JSON.parse reviver that turns ISO 8601 datetime strings back into Date
 * objects. Plain "YYYY-MM-DD" date strings (used by daily challenges and
 * streaks) deliberately do NOT match and stay as strings.
 */
function dateReviver(_key: string, value: unknown): unknown {
  if (typeof value === "string" && ISO_DATE_RE.test(value)) {
    return new Date(value);
  }
  return value;
}

export const storage: IStorage = new InMemoryStorage();
