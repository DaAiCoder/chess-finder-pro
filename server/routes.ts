/**
 * REST API routes.
 *
 * User identity comes from `express-session` (`currentUserId`) — see
 * `server/auth.ts` for anonymous + Passport-local register/login.
 */

import type { Express, Request } from "express";
import { Chess } from "chess.js";
import { z } from "zod";
import { storage, type StoredScoutCacheEntry } from "./storage.js";
import { personaPickMove, type PersonaId } from "./services/personaBots.js";
import { analyzeGame } from "./services/gameAnalyzer.js";
import { computeAnalytics } from "./services/analyticsComputer.js";
import { analyzeOpponent } from "./services/opponentAnalyzer.js";
import { fetchPlayerProfile } from "./services/playerProfile.js";
import { buildScoutReport, type ScoutReport } from "./services/opponentScout.js";
import { detectMotifsInGame } from "./services/motifDetector.js";
import { generateTacticsFromAnalysis } from "./services/tacticsGenerator.js";
import { generateBlunderPreventerProblems } from "./services/blunderPreventerGenerator.js";
import { generateOpeningProblems } from "./services/openingImproverGenerator.js";
import { generateAdvantageProblems } from "./services/advantageCapitalizationGenerator.js";
import { generateEndgameProblems } from "./services/endgameTrainerGenerator.js";
import {
  buildBlindTacticsFromProblem,
  buildBlindfoldQuestion,
  buildVisualizationQuestions,
} from "./services/visualizationGenerator.js";
import {
  parseNaturalLanguageQuery,
  parseMotifQuery,
  parseLineQuery,
  explainBlunder,
} from "./services/openai.js";
import { searchLines } from "./services/lineSearcher.js";
import { searchSetup } from "./services/setupSearcher.js";
import { SETUP_TEMPLATES, getSetup } from "./data/setups.js";
import {
  listOpenings,
  resolveOpeningName,
} from "./services/openingsDictionary.js";
import {
  MOTIF_KEY_TO_CATEGORY,
  motifSearchCriteriaSchema,
  lineQuerySchema,
  type LineQuery,
  type MotifInstanceData,
  type MotifSearchCriteria,
} from "../shared/schema.js";
import { findCourse, listCoursesSummary } from "./data/openingCourses.js";
import {
  findLesson,
  listCategoriesWithCounts,
  listLessonsSummary,
  type EndgameCategory,
} from "./data/endgameLessons.js";
import {
  countryLeaderboard,
  findChampion,
  listChampionsSummary,
  listEras,
  listStyles,
  type ChampionEra,
  type ChampionStyle,
} from "./data/champions.js";
import {
  getChampionGame,
  hasChampionLibrary,
  listChampionGames,
} from "./services/championGames.js";
import {
  cancel as cancelBatch,
  enqueue as enqueueBatch,
  getStatus as getBatchStatus,
} from "./services/batchAnalyzer.js";
import {
  pickOnboardingPuzzles,
  recordMotifAttempt,
  recommendModules,
} from "./services/calibration.js";
import { recordSkillRatingAttempt, moduleSkillKey } from "./services/ratingService.js";
import { pickNextTrainingProblem } from "./services/nextProblem.js";
import { iterCoachReply } from "./services/coachChatStream.js";
import { explainMistake, explainLine } from "./services/coach.js";
import { stockfish } from "./services/stockfish.js";
import { runOnce as runGeneratorCronOnce } from "./services/generatorCron.js";
import { listDue as listDueSrs, schedule as scheduleSrs } from "./services/srsScheduler.js";
import { computeWeaknesses } from "./services/weaknessProfile.js";
import { renderOpponentReportHtml } from "./services/opponentReport.js";
import { currentUserId } from "./auth.js";
import { pickCalculationProblem } from "./services/calculationLadderGenerator.js";
import { pickTimePressureProblem } from "./services/timePressureGenerator.js";
import { ingestRepertoirePgn } from "./services/repertoireBuilder.js";
import {
  VARIANT_CATALOG,
  pickVariantStartFen,
  applyVariantMove,
} from "./services/variantEngine.js";
import {
  exploreLibrary,
  EXPLORER_TIERS,
  fenToEpd,
  type ExplorerTier,
} from "./services/gameLibrary.js";
import {
  ingestPgnBlob,
  ingestLichessUser,
  ingestChessComUser,
} from "./services/libraryIngest.js";
import { generateFromLibrary } from "./services/libraryTrainingGenerator.js";
import { LIBRARY_TIER_LABELS } from "../shared/schema.js";
import {
  listChannels,
  getChannel,
  invalidateChannelCache,
} from "./services/watchChannels.js";
import { createReadStream, existsSync } from "node:fs";
import { buildTimeline } from "./services/watchTimeline.js";
import { audioFilePathForHash } from "./services/watchAudio.js";
import {
  startMatch,
  listMatches,
  getMatch,
  subscribeMatch,
  cancelMatch,
  type EngineSideOptions,
} from "./services/engineMatch.js";
import {
  enqueueRender,
  getRenderJob,
  listRenderJobs,
  getRenderJobByToken,
  streamRenderOutput,
  subscribeToRenderJob,
  checkDeps as checkRenderDeps,
} from "./services/videoRender.js";

export function registerRoutes(app: Express) {
  /* -------------------------------------------------------------------- */
  /* Health                                                                */
  /* -------------------------------------------------------------------- */
  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      ts: Date.now(),
      engine: stockfish.getEngineMode(),
      stockfishPath: stockfish.getResolvedBinary(),
    });
  });

  /** Engine diagnostics — useful on Windows to confirm UCI vs fallback mock. */
  app.get("/api/engine", async (_req, res) => {
    await stockfish.ensure();
    res.json({
      mode: stockfish.getEngineMode(),
      binary: stockfish.getResolvedBinary(),
      hint:
        stockfish.getEngineMode() === "mock"
          ? "Install Stockfish and set STOCKFISH_PATH to the executable, or add it to PATH."
          : null,
    });
  });

  /* -------------------------------------------------------------------- */
  /* Opening courses (Chessreps-style repertoire trainer)                  */
  /* -------------------------------------------------------------------- */
  app.get("/api/openings/courses", (_req, res) => {
    res.json({ courses: listCoursesSummary() });
  });

  app.get("/api/openings/courses/:slug", (req, res) => {
    const course = findCourse(req.params.slug);
    if (!course) {
      res.status(404).json({ error: "Course not found" });
      return;
    }
    res.json(course);
  });

  /* -------------------------------------------------------------------- */
  /* Endgame lessons (Capa Endgames-style trainer)                         */
  /* -------------------------------------------------------------------- */
  app.get("/api/endgames/categories", (_req, res) => {
    res.json({ categories: listCategoriesWithCounts() });
  });

  app.get("/api/endgames/lessons", (req, res) => {
    const category = req.query.category as EndgameCategory | undefined;
    res.json({ lessons: listLessonsSummary(category) });
  });

  app.get("/api/endgames/lessons/:id", (req, res) => {
    const lesson = findLesson(req.params.id);
    if (!lesson) {
      res.status(404).json({ error: "Lesson not found" });
      return;
    }
    res.json(lesson);
  });

  /* -------------------------------------------------------------------- */
  /* Champions — Hall of Fame registry                                     */
  /* -------------------------------------------------------------------- */
  app.get("/api/champions", (req, res) => {
    const era = req.query.era as ChampionEra | undefined;
    const style = req.query.style as ChampionStyle | undefined;
    const country = req.query.country as string | undefined;
    const worldChampionsOnly = req.query.worldChampionsOnly === "true";
    const search = (req.query.search as string | undefined)?.trim() || undefined;
    res.json({
      champions: listChampionsSummary({ era, style, country, worldChampionsOnly, search }),
      eras: listEras(),
      styles: listStyles(),
      countries: countryLeaderboard(),
    });
  });

  app.get("/api/champions/:id", async (req, res) => {
    const c = findChampion(req.params.id);
    if (!c) {
      res.status(404).json({ error: "Champion not found" });
      return;
    }
    const hasLibrary = await hasChampionLibrary(c.id);
    res.json({ ...c, hasLibrary });
  });

  /**
   * Paginated games library backed by bundled PGN Mentor collections.
   * `?q=` matches White/Black/Event/ECO/Date case-insensitively.
   */
  app.get("/api/champions/:id/games", async (req, res) => {
    const c = findChampion(req.params.id);
    if (!c) {
      res.status(404).json({ error: "Champion not found" });
      return;
    }
    if (!(await hasChampionLibrary(c.id))) {
      res.status(404).json({
        error: "no bundled games",
        hint: "run npm run fetch:pgn-mentor",
      });
      return;
    }
    try {
      const page = Number(req.query.page ?? 1) || 1;
      const limit = Number(req.query.limit ?? 25) || 25;
      const q = (req.query.q as string | undefined)?.trim() || undefined;
      const result = await listChampionGames(c.id, { page, limit, q });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  /** Fetch a single game's full PGN by stable index within the library. */
  app.get("/api/champions/:id/games/:gameIndex", async (req, res) => {
    const c = findChampion(req.params.id);
    if (!c) {
      res.status(404).json({ error: "Champion not found" });
      return;
    }
    if (!(await hasChampionLibrary(c.id))) {
      res.status(404).json({
        error: "no bundled games",
        hint: "run npm run fetch:pgn-mentor",
      });
      return;
    }
    const idx = Number(req.params.gameIndex);
    if (!Number.isInteger(idx) || idx < 0) {
      res.status(400).json({ error: "gameIndex must be a non-negative integer" });
      return;
    }
    try {
      const game = await getChampionGame(c.id, idx);
      if (!game) {
        res.status(404).json({ error: `game ${idx} not found` });
        return;
      }
      res.json(game);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  /* -------------------------------------------------------------------- */
  /* Position evaluation (live Stockfish)                                  */
  /* -------------------------------------------------------------------- */
  app.post("/api/position/evaluate", async (req, res) => {
    const schema = z.object({ fen: z.string(), depth: z.number().int().min(1).max(20).optional() });
    const { fen, depth } = schema.parse(req.body);
    const cached = await storage.getPositionByFen(fen);
    if (cached && (cached.depth ?? 0) >= (depth ?? 12)) {
      res.json(cached);
      return;
    }
    const evalResult = await stockfish.evaluate(fen, depth ?? 12);
    const stored = await storage.upsertPosition({
      fen,
      evaluation: evalResult.evaluation,
      bestMove: evalResult.bestMove,
      pv: evalResult.pv,
      depth: evalResult.depth,
      mateIn: evalResult.mateIn,
      data: evalResult,
    });
    res.json(stored);
  });

  /* -------------------------------------------------------------------- */
  /* Play vs computer — single move from engine                            */
  /* -------------------------------------------------------------------- */
  /**
   * Returns evaluations for **every legal move** from the given position.
   * Used by the analysis page to render per-piece eval badges (Chessfish-style).
   */
  app.post("/api/position/all-moves", async (req, res) => {
    const schema = z.object({
      fen: z.string(),
      depth: z.number().int().min(4).max(20).optional(),
    });
    const { fen, depth } = schema.parse(req.body);
    const result = await stockfish.evaluateAllMoves(fen, depth ?? 12);
    res.json({
      fen,
      depth: result.best.depth,
      bestMove: result.best.bestMove,
      bestEvaluation: result.best.evaluation,
      lines: result.lines,
      engineMode: stockfish.getEngineMode(),
    });
  });

  app.post("/api/play/move", async (req, res) => {
    const schema = z.object({
      fen: z.string(),
      level: z.number().int().min(1).max(8).default(4),
      persona: z.enum(["balanced", "capablanca", "tal", "petrosian"]).optional(),
    });
    const { fen, level, persona } = schema.parse(req.body);
    // Snappier search for Play vs computer — depth/time scale with level but cap lower than before.
    const depth = Math.min(16, 6 + level * 2);
    const timeoutMs = Math.min(28000, 4500 + level * 2200);
    const multi = await stockfish.evaluateAllMoves(fen, depth, timeoutMs);
    const bestMove = personaPickMove(multi.lines, (persona ?? "balanced") as PersonaId);
    res.json({
      bestMove,
      evaluation: multi.best.evaluation,
      pv: multi.best.pv,
      depth: multi.best.depth,
      engineMode: stockfish.getEngineMode(),
    });
  });

  /* -------------------------------------------------------------------- */
  /* Games                                                                 */
  /* -------------------------------------------------------------------- */
  app.get("/api/games", async (req, res) => {
    res.json(await storage.listGames(currentUserId(req)));
  });

  app.get("/api/games/:id", async (req, res) => {
    const id = Number(req.params.id);
    const game = await storage.getGame(id);
    if (!game) {
      res.status(404).json({ error: "not found" });
      return;
    }
    res.json(game);
  });

  app.delete("/api/games/:id", async (req, res) => {
    await storage.deleteGame(Number(req.params.id));
    res.json({ ok: true });
  });

  app.post("/api/games", async (req, res) => {
    const schema = z.object({
      pgn: z.string(),
      source: z.enum(["lichess", "chess.com", "pgn"]).default("pgn"),
    });
    const { pgn, source } = schema.parse(req.body);
    const game = await storage.createGame(parsePgnToGame(pgn, source, currentUserId(req)));
    res.json(game);
  });

  /* -------------------------------------------------------------------- */
  /* Game analysis                                                         */
  /* -------------------------------------------------------------------- */
  app.get("/api/games/:id/analysis", async (req, res) => {
    const id = Number(req.params.id);
    const cached = await storage.getAnalysisForGame(id);
    if (cached) {
      res.json(cached);
      return;
    }
    const game = await storage.getGame(id);
    if (!game) {
      res.status(404).json({ error: "not found" });
      return;
    }
    const analysis = await analyzeGame(game.pgn, 8);
    const stored = await storage.upsertGameAnalysis({ gameId: id, ...analysis });
    res.json(stored);
  });

  app.post("/api/games/:id/analyze", async (req, res) => {
    const id = Number(req.params.id);
    const game = await storage.getGame(id);
    if (!game) {
      res.status(404).json({ error: "not found" });
      return;
    }
    const depthSchema = z.object({ depth: z.number().int().min(4).max(20).optional() });
    const { depth } = depthSchema.parse(req.body ?? {});
    const analysis = await analyzeGame(game.pgn, depth ?? 8);
    const stored = await storage.upsertGameAnalysis({ gameId: id, ...analysis });
    res.json(stored);
  });

  /**
   * Manual trigger for the generator cron — useful from the dashboard
   * "Refresh my drills" button. Returns the same totals the cron
   * background pass logs.
   */
  app.post("/api/training/refresh", async (_req, res) => {
    try {
      const stats = await runGeneratorCronOnce(storage);
      res.json(stats);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  /* -------------------------------------------------------------------- */
  /* Game generation (training problems from a specific game)              */
  /* -------------------------------------------------------------------- */
  app.post("/api/games/:id/generate/:module", async (req, res) => {
    const id = Number(req.params.id);
    const module = req.params.module;
    const game = await storage.getGame(id);
    if (!game) {
      res.status(404).json({ error: "not found" });
      return;
    }
    let analysis = await storage.getAnalysisForGame(id);
    if (!analysis) {
      const computed = await analyzeGame(game.pgn);
      analysis = await storage.upsertGameAnalysis({ gameId: id, ...computed });
    }

    let inserts: Awaited<ReturnType<typeof storage.createTrainingProblem>>[] = [];
    const args = { pgn: game.pgn, analysis, gameId: id };
    let candidates;
    switch (module) {
      case "tactics":
        candidates = generateTacticsFromAnalysis({ ...args, module: "tactics" });
        break;
      case "blunder-preventer":
        candidates = generateBlunderPreventerProblems(args);
        break;
      case "opening-improver":
        candidates = generateOpeningProblems(args);
        break;
      case "advantage-capitalization":
        candidates = generateAdvantageProblems(args);
        break;
      case "endgame":
        candidates = generateEndgameProblems(args);
        break;
      default:
        res.status(400).json({ error: "unknown module" });
        return;
    }
    for (const c of candidates) {
      inserts.push(await storage.createTrainingProblem(c));
    }
    res.json({ created: inserts.length, problems: inserts });
  });

  /* -------------------------------------------------------------------- */
  /* Import: Chess.com                                                     */
  /* -------------------------------------------------------------------- */
  app.post("/api/import/chess-com", async (req, res) => {
    const schema = z.object({
      username: z.string(),
      timeClass: z.enum(["bullet", "blitz", "rapid", "classical"]).optional(),
      max: z.number().int().min(1).max(1000).default(40),
    });
    try {
      const { username, timeClass, max } = schema.parse(req.body);
      const games = await fetchChessComGames(username, max, timeClass);
      const saved = [];
      for (const g of games) saved.push(await storage.createGame({ ...g, userId: currentUserId(req) }));
      res.json({ count: saved.length, games: saved });
    } catch (err) {
      const e = err as Error;
      const status = e.name === "ZodError" ? 400 : 502;
      res.status(status).json({ error: `Chess.com import failed: ${e.message}` });
    }
  });

  /* -------------------------------------------------------------------- */
  /* Import: Lichess                                                       */
  /* -------------------------------------------------------------------- */
  app.post("/api/import/lichess", async (req, res) => {
    const schema = z.object({
      username: z.string(),
      perfType: z.enum(["bullet", "blitz", "rapid", "classical"]).optional(),
      max: z.number().int().min(1).max(1000).default(40),
    });
    try {
      const { username, perfType, max } = schema.parse(req.body);
      const games = await fetchLichessGames(username, max, perfType);
      const saved = [];
      for (const g of games) saved.push(await storage.createGame({ ...g, userId: currentUserId(req) }));
      res.json({ count: saved.length, games: saved });
    } catch (err) {
      const e = err as Error;
      const status = e.name === "ZodError" ? 400 : 502;
      res.status(status).json({ error: `Lichess import failed: ${e.message}` });
    }
  });

  /* -------------------------------------------------------------------- */
  /* Import: raw PGN paste                                                 */
  /* -------------------------------------------------------------------- */
  app.post("/api/import/pgn", async (req, res) => {
    const schema = z.object({ pgn: z.string() });
    const { pgn } = schema.parse(req.body);
    const games = splitPgnDocument(pgn).map((p) =>
      parsePgnToGame(p, "pgn", currentUserId(req)),
    );
    const saved = [];
    for (const g of games) saved.push(await storage.createGame(g));
    res.json({ count: saved.length, games: saved });
  });

  /* -------------------------------------------------------------------- */
  /* Analytics dashboard                                                   */
  /* -------------------------------------------------------------------- */
  app.get("/api/analytics", async (req, res) => {
    const username = String(req.query.username ?? "");
    if (!username) {
      res.status(400).json({ error: "username required" });
      return;
    }
    const allGames = await storage.listGames(currentUserId(req));
    const lower = username.toLowerCase();
    const myGames = allGames.filter(
      (g) =>
        (g.whitePlayer ?? "").toLowerCase() === lower ||
        (g.blackPlayer ?? "").toLowerCase() === lower,
    );
    const analyses = new Map<number, NonNullable<Awaited<ReturnType<typeof storage.getAnalysisForGame>>>>();
    for (const g of myGames) {
      const a = await storage.getAnalysisForGame(g.id);
      if (a) analyses.set(g.id, a);
    }
    const summary = computeAnalytics({ username, games: myGames, analyses });
    res.json({ ...summary, games: myGames.slice(0, 20) });
  });

  /**
   * Kick off background Stockfish analysis for every imported game that
   * doesn't yet have a `game_analysis` row. Returns immediately with the
   * job snapshot so the client can start polling the status endpoint.
   * Capped at `max` games (default 40) to bound work per click.
   */
  app.post("/api/analytics/analyze-batch", async (req, res) => {
    const schema = z.object({
      username: z.string().min(1),
      max: z.number().int().min(1).max(200).optional(),
    });
    const { username, max } = schema.parse(req.body);
    const userId = currentUserId(req);

    const allGames = await storage.listGames(userId);
    const lower = username.toLowerCase();
    const myGames = allGames.filter(
      (g) =>
        (g.whitePlayer ?? "").toLowerCase() === lower ||
        (g.blackPlayer ?? "").toLowerCase() === lower,
    );

    const missing: number[] = [];
    for (const g of myGames) {
      const a = await storage.getAnalysisForGame(g.id);
      if (!a) missing.push(g.id);
      if (missing.length >= (max ?? 40)) break;
    }

    const job = enqueueBatch({ userId, username, gameIds: missing });
    res.status(202).json({ queued: missing.length, job });
  });

  app.get("/api/analytics/analyze-batch/status", (req, res) => {
    const userId = currentUserId(req);
    const job = getBatchStatus(userId);
    res.json(job ?? { status: "idle" });
  });

  app.post("/api/analytics/analyze-batch/cancel", (req, res) => {
    const userId = currentUserId(req);
    const job = cancelBatch(userId);
    res.json(job ?? { status: "idle" });
  });

  /* -------------------------------------------------------------------- */
  /* Opponent prep                                                         */
  /* -------------------------------------------------------------------- */
  // Legacy endpoint — keep for any existing client code that still hits it.
  app.post("/api/opponent-prep", async (req, res) => {
    const schema = z.object({
      username: z.string(),
      platform: z.enum(["lichess", "chess.com"]),
      max: z.number().int().min(1).max(200).default(40),
    });
    const { username, platform, max } = schema.parse(req.body);
    let games;
    try {
      games =
        platform === "chess.com"
          ? await fetchChessComGames(username, max)
          : await fetchLichessGames(username, max);
    } catch (err) {
      const e = err as Error;
      res.status(502).json({ error: `Could not fetch ${platform} games: ${e.message}` });
      return;
    }
    const persisted = [];
    for (const g of games) persisted.push(await storage.createGame(g));
    const report = analyzeOpponent({ username, platform, games: persisted });
    await storage.upsertOpponentProfile({
      username,
      platform,
      openingTree: { white: report.openingTreeWhite, black: report.openingTreeBlack },
      weaknesses: report.weaknesses,
      tacticalPatterns: null,
      averageRating: report.averageRating,
      gamesAnalyzed: report.gamesAnalyzed,
    });
    res.json(report);
  });

  /* -------------------------------------------------------------------- */
  /* Opponent scouting v2 (comprehensive)                                  */
  /* -------------------------------------------------------------------- */

  // Profile only — for the scout form's autocomplete / preview.
  app.get("/api/opponent-prep/profile", async (req, res) => {
    const username = String(req.query.username ?? "").trim();
    const platform = String(req.query.platform ?? "");
    if (!username || (platform !== "chess.com" && platform !== "lichess")) {
      res.status(400).json({ error: "username and platform required" });
      return;
    }
    try {
      const profile = await fetchPlayerProfile(username, platform);
      res.json(profile);
    } catch (err) {
      const e = err as Error;
      res.status(502).json({ error: e.message });
    }
  });

  // The big one — comprehensive scout report.
  app.post("/api/opponent-prep/scout", async (req, res) => {
    const schema = z.object({
      username: z.string().min(1),
      platform: z.enum(["lichess", "chess.com"]),
      maxGames: z.number().int().min(10).max(1000).default(200),
      timeControl: z
        .enum(["bullet", "blitz", "rapid", "classical"])
        .optional(),
      sinceMonth: z
        .string()
        .regex(/^\d{4}-\d{2}$/)
        .optional(), // YYYY-MM, used by chess.com
      sinceMs: z.number().int().optional(), // unix ms, used by lichess
      forceRefresh: z.boolean().default(false),
    });
    const opts = schema.parse(req.body);
    const cacheKey = scoutCacheKey(opts);

    try {
      let entry = await storage.getScoutEntry(cacheKey);
      const cacheStale =
        !entry ||
        opts.forceRefresh ||
        Date.now() - entry.fetchedAt > 1000 * 60 * 30; // 30 min freshness

      if (cacheStale) {
        const profile = await fetchPlayerProfile(opts.username, opts.platform);
        if (profile.notFound) {
          res
            .status(404)
            .json({ error: `${opts.platform}: '${opts.username}' not found` });
          return;
        }
        const games =
          opts.platform === "chess.com"
            ? await fetchChessComGames(opts.username, opts.maxGames, opts.timeControl, {
                sinceMonth: opts.sinceMonth,
              })
            : await fetchLichessGames(opts.username, opts.maxGames, opts.timeControl, {
                sinceMs: opts.sinceMs,
              });
        // Hydrate playedAt + opening etc. via parsePgnToGame (already done).
        const hydrated = games.map((g) => ({
          ...g,
          // Make Game-like objects with synthetic ids so the analyzer can
          // reference them. We don't persist to storage to avoid polluting
          // the user's game list.
          id: nextScoutGameId(),
          createdAt: new Date(),
          userId: null,
        }));
        const reportRaw = buildScoutReport({ profile, games: hydrated as never });
        const report: ScoutReport = { ...reportRaw, id: cacheKey };
        entry = { report, games: hydrated as never, fetchedAt: Date.now() };
        await storage.upsertScoutEntry(entry);
      }
      res.json(entry!.report);
    } catch (err) {
      const e = err as Error;
      res.status(502).json({ error: e.message });
    }
  });

  // List saved scout reports.
  app.get("/api/opponent-prep/reports", async (_req, res) => {
    const entries = await storage.listScoutEntries();
    res.json({
      reports: entries.map((e) => ({
        id: e.report.id,
        platform: e.report.profile.platform,
        username: e.report.profile.username,
        displayName: e.report.profile.displayName,
        title: e.report.profile.title,
        avatarUrl: e.report.profile.avatarUrl,
        gamesAnalyzed: e.report.sample.total,
        generatedAt: e.report.generatedAt,
      })),
    });
  });

  app.get("/api/opponent-prep/reports/:id", async (req, res) => {
    const entry = await storage.getScoutEntry(req.params.id);
    if (!entry) {
      res.status(404).json({ error: "report not found" });
      return;
    }
    res.json(entry.report);
  });

  app.delete("/api/opponent-prep/reports/:id", async (req, res) => {
    await storage.deleteScoutEntry(req.params.id);
    res.json({ ok: true });
  });

  // Compare two scouted opponents side-by-side. Both must already be cached.
  app.post("/api/opponent-prep/compare", async (req, res) => {
    const schema = z.object({ aId: z.string(), bId: z.string() });
    const { aId, bId } = schema.parse(req.body);
    const a = await storage.getScoutEntry(aId);
    const b = await storage.getScoutEntry(bId);
    if (!a || !b) {
      res.status(404).json({ error: "one or both reports not found in cache" });
      return;
    }
    res.json({ a: a.report, b: b.report });
  });

  // PGN dump of all games in a report that match a move-prefix path.
  // Useful for "give me all the games where he played 1.e4 e5 2.Nf3 Nc6 3.Bb5".
  app.get("/api/opponent-prep/reports/:id/pgn", async (req, res) => {
    const entry = await storage.getScoutEntry(req.params.id);
    if (!entry) {
      res.status(404).json({ error: "report not found" });
      return;
    }
    const movesParam = String(req.query.moves ?? "").trim();
    const wanted = movesParam ? movesParam.split(",").map((m) => m.trim()) : [];
    const matched: string[] = [];
    const games = entry.games as { pgn?: string }[];
    for (const g of games) {
      const pgn = g.pgn ?? "";
      if (wanted.length === 0) {
        matched.push(pgn);
        continue;
      }
      try {
        const c = new Chess();
        c.loadPgn(pgn);
        const hist = c.history().slice(0, wanted.length);
        if (hist.length === wanted.length && hist.every((m, i) => m === wanted[i])) {
          matched.push(pgn);
        }
      } catch {
        /* skip */
      }
    }
    res.type("application/x-chess-pgn");
    res.send(matched.join("\n\n"));
  });

  /* -------------------------------------------------------------------- */
  /* Motifs                                                                */
  /* -------------------------------------------------------------------- */
  app.get("/api/motifs/definitions", async (_req, res) => {
    res.json(await storage.listMotifDefinitions());
  });

  app.get("/api/motifs/instances", async (req, res) => {
    const filter: { motifKey?: string; gameId?: number } = {};
    if (typeof req.query.motifKey === "string") filter.motifKey = req.query.motifKey;
    if (typeof req.query.gameId === "string") filter.gameId = Number(req.query.gameId);
    res.json(await storage.listMotifInstances(filter));
  });

  app.post("/api/motifs/detect/:gameId", async (req, res) => {
    const id = Number(req.params.gameId);
    const game = await storage.getGame(id);
    if (!game) {
      res.status(404).json({ error: "not found" });
      return;
    }
    const detected = detectMotifsInGame(game.pgn, id, { gameResult: game.result });
    const stored = [];
    for (const d of detected) stored.push(await storage.recordMotifInstance(d));
    res.json({ count: stored.length, motifs: stored });
  });

  /**
   * Run detection across every imported game that doesn't yet have any
   * motif instances. Idempotent — safe to call repeatedly. Useful one-shot
   * after importing a batch from Chess.com / Lichess.
   */
  app.post("/api/motifs/detect-all", async (req, res) => {
    const userId = currentUserId(req);
    const force = req.body?.force === true;
    const games = await storage.listGames(userId);
    const existing = await storage.listMotifInstances();
    const seen = new Set(existing.map((m) => m.gameId).filter((g): g is number => g != null));
    let scanned = 0;
    let stored = 0;
    for (const g of games) {
      if (!force && seen.has(g.id)) continue;
      scanned++;
      const detected = detectMotifsInGame(g.pgn, g.id, { gameResult: g.result });
      for (const d of detected) {
        await storage.recordMotifInstance(d);
        stored++;
      }
    }
    res.json({ scanned, stored, totalGames: games.length });
  });

  /**
   * Structured search across motif instances. Accepts the shared
   * `MotifSearchCriteria` shape and returns hydrated records (instance +
   * game metadata) so the Pattern Finder UI can render previews without
   * extra fetches.
   */
  app.post("/api/motifs/search", async (req, res) => {
    let criteria: MotifSearchCriteria;
    try {
      criteria = motifSearchCriteriaSchema.parse(req.body ?? {});
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
      return;
    }
    const result = await runMotifSearch(criteria, currentUserId(req));
    res.json(result);
  });

  /**
   * Natural-language entry point. Parses the query into a
   * `MotifSearchCriteria`, runs the same search pipeline, and records the
   * query for the user's history.
   */
  app.post("/api/motifs/query", async (req, res) => {
    const schema = z.object({ query: z.string().min(1).max(500) });
    const data = schema.parse(req.body);
    const criteria = await parseMotifQuery(data.query);
    const result = await runMotifSearch(criteria, currentUserId(req));
    try {
      await storage.recordMotifQuery({
        userId: currentUserId(req),
        query: data.query,
        results: { criteria, resultCount: result.results.length },
      });
    } catch {
      /* non-fatal — telemetry only */
    }
    res.json({ query: data.query, ...result });
  });

  app.get("/api/motifs/metrics", async (req, res) => {
    const userId = currentUserId(req);
    const metrics = await storage.listMotifMetrics(userId);

    // Augment with totals computed from this user's motif_instances so the
    // page shows useful numbers even before any training attempts.
    const games = await storage.listGames(userId);
    const myGameIds = new Set(games.map((g) => g.id));
    const insts = await storage.listMotifInstances();
    const counts = new Map<string, { total: number; missed: number }>();
    for (const m of insts) {
      if (m.gameId == null || !myGameIds.has(m.gameId)) continue;
      const entry = counts.get(m.motifKey) ?? { total: 0, missed: 0 };
      entry.total++;
      const d = (m.data ?? {}) as MotifInstanceData;
      if (d.missed) entry.missed++;
      counts.set(m.motifKey, entry);
    }
    res.json({
      metrics,
      counts: Array.from(counts.entries()).map(([motifKey, c]) => ({
        motifKey,
        ...c,
      })),
    });
  });

  /* -------------------------------------------------------------------- */
  /* Unified Pattern Finder                                                */
  /*                                                                       */
  /* `/api/finder/query`  → natural-language input, parses then searches.  */
  /* `/api/finder/search` → structured LineQuery, runs the same pipeline.  */
  /* `/api/finder/openings` → dictionary listing for the autocomplete UI.  */
  /* -------------------------------------------------------------------- */
  app.get("/api/finder/openings", async (_req, res) => {
    const all = await listOpenings();
    res.json(
      all
        .map((o) => ({ id: o.id, name: o.name, eco: o.eco }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
  });

  app.get("/api/finder/setups", (_req, res) => {
    res.json(
      SETUP_TEMPLATES.map((s) => ({
        id: s.id,
        name: s.name,
        side: s.side,
        description: s.description,
      })),
    );
  });

  app.post("/api/finder/search", async (req, res) => {
    let query: LineQuery;
    try {
      query = lineQuerySchema.parse(req.body ?? {});
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
      return;
    }
    const result = await runFinderSearch(query, currentUserId(req));
    res.json(result);
  });

  app.post("/api/finder/query", async (req, res) => {
    const schema = z.object({ query: z.string().min(1).max(500) });
    let parsed: { query: string };
    try {
      parsed = schema.parse(req.body);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
      return;
    }
    const query = await parseLineQuery(parsed.query);
    const result = await runFinderSearch(query, currentUserId(req));
    try {
      await storage.recordMotifQuery({
        userId: currentUserId(req),
        query: parsed.query,
        results: { query, gameCount: result.games.length, lineCount: result.lines.length },
      });
    } catch {
      /* non-fatal — telemetry only */
    }
    res.json({ raw: parsed.query, ...result });
  });

  /* -------------------------------------------------------------------- */
  /* Training problems                                                     */
  /* -------------------------------------------------------------------- */
  app.get("/api/training/problems", async (req, res) => {
    const filter: { module?: string; tacticType?: string; difficulty?: number } = {};
    if (typeof req.query.module === "string") filter.module = req.query.module;
    if (typeof req.query.tacticType === "string") filter.tacticType = req.query.tacticType;
    if (typeof req.query.difficulty === "string") filter.difficulty = Number(req.query.difficulty);

    const problems = await storage.listTrainingProblems(filter);

    // Optional: when called from the Analytics deep links, surface problems
    // built from this user's own imported games first so practice feels
    // personal. Falls back to the full pool order otherwise.
    const prioritize = req.query.prioritizeUserGames === "true";
    const sourceUserId = Number(req.query.sourceUserId);
    if (prioritize && Number.isFinite(sourceUserId)) {
      const myGames = await storage.listGames(sourceUserId);
      const myGameIds = new Set(myGames.map((g) => g.id));
      const mine: typeof problems = [];
      const rest: typeof problems = [];
      for (const p of problems) {
        if (p.sourceGameId != null && myGameIds.has(p.sourceGameId)) mine.push(p);
        else rest.push(p);
      }
      // Newest user-game problems first.
      mine.sort((a, b) => (b.id ?? 0) - (a.id ?? 0));
      res.json([...mine, ...rest]);
      return;
    }
    res.json(problems);
  });

  app.get("/api/training/problems/:id", async (req, res) => {
    const p = await storage.getTrainingProblem(Number(req.params.id));
    if (!p) {
      res.status(404).json({ error: "not found" });
      return;
    }
    res.json(p);
  });

  app.get("/api/training/visualization/:id/questions", async (req, res) => {
    const p = await storage.getTrainingProblem(Number(req.params.id));
    if (!p) {
      res.status(404).json({ error: "not found" });
      return;
    }
    res.json(buildVisualizationQuestions(p.fen));
  });

  app.post("/api/training/visualization/derive-blind/:id", async (req, res) => {
    const p = await storage.getTrainingProblem(Number(req.params.id));
    if (!p) {
      res.status(404).json({ error: "not found" });
      return;
    }
    const created = await storage.createTrainingProblem(buildBlindTacticsFromProblem(p));
    res.json(created);
  });

  // Phase 3.4: Blindfold visualization (no board, text-only moves).
  app.get("/api/training/visualization/blindfold", async (req, res) => {
    try {
      const startFen =
        (req.query.fen as string | undefined) ??
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
      const moveCount = Math.max(2, Math.min(8, Number(req.query.moves ?? 4)));
      const q = buildBlindfoldQuestion(startFen, moveCount);
      // Don't leak endFen to the client — the user must visualise.
      res.json({
        startFen: q.startFen,
        moves: q.moves,
        question: q.question,
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Listudy-style blind tactics. The client receives a frozen position and a
  // list of plies played since. The user must mentally apply those plies and
  // find the solving move in the imagined current position.
  app.get("/api/training/visualization/blind-tactics", async (_req, res) => {
    try {
      const { listBlindTactics } = await import("./data/blindTactics.js");
      const tactics = listBlindTactics();
      // Augment each entry with the side to move at the *imagined* position so
      // the client can display "White/Black to play and win" without having to
      // compute it itself.
      const enriched = tactics.map((t) => {
        const ch = new Chess(t.startFen);
        for (const san of t.playedMoves) ch.move(san);
        return {
          id: t.id,
          startFen: t.startFen,
          playedMoves: t.playedMoves,
          solution: t.solution,
          theme: t.theme,
          description: t.description,
          difficulty: t.difficulty,
          sideToMove: ch.turn() === "w" ? "white" : "black",
        };
      });
      res.json(enriched);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Pawn-structure catalogue: overview / plans / breaks / drills per structure.
  app.get("/api/training/pawn-structures", async (_req, res) => {
    try {
      const { listPawnStructures } = await import("./data/pawnStructures.js");
      res.json(listPawnStructures());
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get("/api/training/pawn-structures/:id", async (req, res) => {
    try {
      const { findPawnStructure } = await import("./data/pawnStructures.js");
      const s = findPawnStructure(req.params.id);
      if (!s) return res.status(404).json({ error: "not_found" });
      res.json(s);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Strategic-plan catalogue: MCQ + canonical play-out.
  app.get("/api/training/plans", async (_req, res) => {
    try {
      const { listStrategicPlans } = await import("./data/strategicPlans.js");
      res.json(listStrategicPlans());
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get("/api/training/plans/:id", async (req, res) => {
    try {
      const { findStrategicPlan } = await import("./data/strategicPlans.js");
      const p = findStrategicPlan(req.params.id);
      if (!p) return res.status(404).json({ error: "not_found" });
      res.json(p);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Calculation Studio — multi-move forcing lines (blind sequence entry).
  app.get("/api/training/calculation-studio", async (_req, res) => {
    try {
      const { listCalculationStudio } = await import("./data/calculationStudio.js");
      res.json(listCalculationStudio());
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get("/api/training/calculation-studio/:id", async (req, res) => {
    try {
      const { findCalculationStudy } = await import("./data/calculationStudio.js");
      const s = findCalculationStudy(req.params.id);
      if (!s) return res.status(404).json({ error: "not_found" });
      res.json(s);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Endgame studies (Réti / Saavedra / Troitsky / etc.) catalogue.
  app.get("/api/training/endgame-studies", async (_req, res) => {
    try {
      const { listEndgameStudies } = await import("./data/endgameStudies.js");
      res.json(listEndgameStudies());
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get("/api/training/endgame-studies/:id", async (req, res) => {
    try {
      const { findEndgameStudy } = await import("./data/endgameStudies.js");
      const s = findEndgameStudy(req.params.id);
      if (!s) return res.status(404).json({ error: "not_found" });
      res.json(s);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get("/api/training/next", async (req, res) => {
    const module = typeof req.query.module === "string" ? req.query.module : "tactics";
    const userId = currentUserId(req);
    const p = await pickNextTrainingProblem(userId, module);
    if (!p) {
      res.status(404).json({ error: "empty_pool" });
      return;
    }
    res.json(p);
  });

  app.post("/api/training/attempt", async (req, res) => {
    const schema = z.object({
      problemId: z.number().int(),
      solved: z.boolean(),
      timeSpent: z.number().int(),
      movesPlayed: z.array(z.string()).optional(),
    });
    const data = schema.parse(req.body);
    const userId = currentUserId(req);
    const attempt = await storage.recordAttempt({ ...data, userId });

    let levelUp = false;
    let userLevel = 1;
    let userXp = 0;

    // Streak + XP bookkeeping (calendar streak + gamification).
    try {
      const today = new Date().toISOString().slice(0, 10);
      const existing = await storage.getStreak(userId);
      const last = existing?.lastActivityDate ?? null;
      const lastStr = last
        ? typeof last === "string"
          ? last
          : new Date(last).toISOString().slice(0, 10)
        : null;

      let currentStreak = existing?.currentStreak ?? 0;
      let longestStreak = existing?.longestStreak ?? 0;

      if (lastStr !== today) {
        let next = 1;
        if (lastStr) {
          const ms = new Date(today).getTime() - new Date(lastStr).getTime();
          const days = Math.round(ms / (1000 * 60 * 60 * 24));
          next = days === 1 ? (existing?.currentStreak ?? 0) + 1 : 1;
        }
        currentStreak = next;
        longestStreak = Math.max(existing?.longestStreak ?? 0, next);
      }

      const xpGain = data.solved ? 10 : 2;
      const prevXp = existing?.xp ?? 0;
      userXp = prevXp + xpGain;
      const prevLevel = existing?.level ?? Math.max(1, 1 + Math.floor(prevXp / 500));
      userLevel = Math.max(1, 1 + Math.floor(userXp / 500));
      levelUp = userLevel > prevLevel;

      await storage.upsertStreak({
        userId,
        currentStreak,
        longestStreak,
        lastActivityDate: today,
        xp: userXp,
        level: userLevel,
        weeklyXp: (existing?.weeklyXp ?? 0) + xpGain,
      });
    } catch (err) {
      console.warn("[training/attempt] streak bookkeeping failed:", (err as Error).message);
    }

    const problem = await storage.getTrainingProblem(data.problemId);
    if (problem) {
      const cur =
        (await storage.getProgress(userId, problem.module)) ?? {
          rating: 1200,
          problemsSolved: 0,
          totalAttempts: 0,
          accuracy: 0,
        };
      const totalAttempts = cur.totalAttempts + 1;
      const problemsSolved = cur.problemsSolved + (data.solved ? 1 : 0);
      const accuracy = problemsSolved / totalAttempts;
      const ratingDelta = data.solved ? 8 : -8;
      const rating = Math.max(400, Math.min(3000, cur.rating + ratingDelta));
      await storage.upsertProgress({
        userId,
        module: problem.module,
        rating,
        problemsSolved,
        totalAttempts,
        accuracy,
        lastPracticed: new Date(),
      });

      // Phase 1.3 — schedule into SRS. Every attempt = one update.
      try {
        await scheduleSrs(userId, problem.id, data.solved ? "pass" : "fail");
      } catch (err) {
        console.warn("[srs] schedule failed:", (err as Error).message);
      }

      // Phase 1.1 — update motif skill if the problem has a tacticType.
      if (problem.tacticType) {
        try {
          await recordMotifAttempt(
            userId,
            problem.tacticType,
            problem.difficulty,
            data.solved,
          );
        } catch (err) {
          console.warn("[motif-skill] update failed:", (err as Error).message);
        }
      }

      try {
        await recordSkillRatingAttempt(
          userId,
          moduleSkillKey(problem.module),
          problem.difficulty,
          data.solved,
        );
      } catch (err) {
        console.warn("[skill-rating] update failed:", (err as Error).message);
      }
    }
    res.json({ ...attempt, levelUp, userLevel, userXp });
  });

  app.get("/api/training/progress", async (req, res) => {
    res.json(await storage.listProgress(currentUserId(req)));
  });

  /* -------------------------------------------------------------------- */
  /* Retry queue — surfaces problems the user got wrong and hasn't       */
  /* re-solved. Latest attempt per problem wins, so a subsequent solve   */
  /* removes it from the queue.                                           */
  /* -------------------------------------------------------------------- */
  app.get("/api/training/retry", async (req, res) => {
    const userId = req.query.userId
      ? Number(req.query.userId)
      : currentUserId(req);
    const limit = req.query.limit
      ? Math.max(1, Math.min(200, Number(req.query.limit)))
      : 50;

    const attempts = await storage.listAttempts(userId);
    // Latest attempt per problemId.
    const byProblem = new Map<number, (typeof attempts)[number]>();
    for (const a of attempts) {
      const prev = byProblem.get(a.problemId);
      if (!prev || a.createdAt.getTime() > prev.createdAt.getTime()) {
        byProblem.set(a.problemId, a);
      }
    }
    const unsolvedIds = Array.from(byProblem.values())
      .filter((a) => !a.solved)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((a) => a.problemId)
      .slice(0, limit);

    const problems = (
      await Promise.all(unsolvedIds.map((id) => storage.getTrainingProblem(id)))
    ).filter((p): p is NonNullable<typeof p> => Boolean(p));
    res.json(problems);
  });

  /* -------------------------------------------------------------------- */
  /* 360 Trainer — interleaves five buckets so the user gets a mixed     */
  /* deck instead of grinding one module at a time.                       */
  /* -------------------------------------------------------------------- */
  app.get("/api/training/360", async (req, res) => {
    const userId = req.query.userId
      ? Number(req.query.userId)
      : currentUserId(req);
    const perBucket = req.query.perBucket
      ? Math.max(1, Math.min(20, Number(req.query.perBucket)))
      : 5;

    type Bucket =
      | "tactics"
      | "advantage-capitalization"
      | "endgame"
      | "defender"
      | "retry";

    async function pull(module: string) {
      const all = await storage.listTrainingProblems({ module });
      // Random sample without replacement.
      const shuffled = [...all].sort(() => Math.random() - 0.5);
      return shuffled.slice(0, perBucket);
    }

    const [tactics, advantage, endgame, defender] = await Promise.all([
      pull("tactics"),
      pull("advantage-capitalization"),
      pull("endgame"),
      pull("defender"),
    ]);

    // Retry queue: latest unsolved for this user, deduped.
    const attempts = await storage.listAttempts(userId);
    const byProblem = new Map<number, (typeof attempts)[number]>();
    for (const a of attempts) {
      const prev = byProblem.get(a.problemId);
      if (!prev || a.createdAt.getTime() > prev.createdAt.getTime()) {
        byProblem.set(a.problemId, a);
      }
    }
    const retryIds = Array.from(byProblem.values())
      .filter((a) => !a.solved)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, perBucket)
      .map((a) => a.problemId);
    const retry = (
      await Promise.all(retryIds.map((id) => storage.getTrainingProblem(id)))
    ).filter((p): p is NonNullable<typeof p> => Boolean(p));

    type Tagged = { bucket: Bucket; problem: (typeof tactics)[number] };
    const tagged: Tagged[] = [
      ...tactics.map((p) => ({ bucket: "tactics" as Bucket, problem: p })),
      ...advantage.map((p) => ({
        bucket: "advantage-capitalization" as Bucket,
        problem: p,
      })),
      ...endgame.map((p) => ({ bucket: "endgame" as Bucket, problem: p })),
      ...defender.map((p) => ({ bucket: "defender" as Bucket, problem: p })),
      ...retry.map((p) => ({ bucket: "retry" as Bucket, problem: p })),
    ];

    // Round-robin shuffle so consecutive cards come from different buckets.
    const buckets: Record<Bucket, Tagged[]> = {
      tactics: [],
      "advantage-capitalization": [],
      endgame: [],
      defender: [],
      retry: [],
    };
    for (const t of tagged) buckets[t.bucket].push(t);

    const order: Bucket[] = [
      "tactics",
      "defender",
      "endgame",
      "advantage-capitalization",
      "retry",
    ];
    const stream: Array<(typeof tactics)[number] & { metadata: Record<string, unknown> }> = [];
    let drained = false;
    while (!drained) {
      drained = true;
      for (const b of order) {
        const next = buckets[b].shift();
        if (!next) continue;
        drained = false;
        const meta = (next.problem.metadata as Record<string, unknown> | null) ?? {};
        // Inject bucket label into metadata so the client can show a badge
        // without an extra round-trip.
        stream.push({
          ...next.problem,
          metadata: { ...meta, bucket: b },
        });
      }
    }

    res.json(stream);
  });

  /* -------------------------------------------------------------------- */
  /* Daily / streaks                                                       */
  /* -------------------------------------------------------------------- */
  app.get("/api/daily", async (_req, res) => {
    const today = new Date().toISOString().slice(0, 10);
    let challenge = await storage.getDailyChallenge(today);
    if (!challenge) {
      const all = await storage.listTrainingProblems({ module: "tactics" });
      if (all.length > 0) {
        const pick = all[Math.floor(Math.random() * all.length)];
        challenge = await storage.setDailyChallenge({ problemId: pick.id, date: today });
      }
    }
    if (!challenge) {
      res.json(null);
      return;
    }
    const problem = await storage.getTrainingProblem(challenge.problemId);
    res.json({ challenge, problem });
  });

  app.get("/api/streak", async (req, res) => {
    res.json((await storage.getStreak(currentUserId(req))) ?? null);
  });

  app.get("/api/training/skill-rating", async (req, res) => {
    const module = String(req.query.module ?? "tactics");
    const row = await storage.getUserMotifSkill(
      currentUserId(req),
      moduleSkillKey(module),
    );
    res.json({ rating: row?.rating ?? 1200, rd: row?.rd ?? 350, module });
  });

  app.patch("/api/users/me/preferences", async (req, res) => {
    const parsed = z.record(z.unknown()).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_body" });
      return;
    }
    const u = await storage.updateUserPreferences(
      currentUserId(req),
      parsed.data as Record<string, unknown>,
    );
    if (!u) {
      res.status(404).json({ error: "no_user" });
      return;
    }
    res.json({ preferences: u.preferences ?? {} });
  });

  /* -------------------------------------------------------------------- */
  /* My Statistics — single endpoint that powers /statistics. Aggregates  */
  /* analytics buckets + training attempts + per-module progress so the   */
  /* page can render with one round-trip.                                 */
  /* -------------------------------------------------------------------- */
  app.get("/api/statistics", async (req, res) => {
    const userId = req.query.userId
      ? Number(req.query.userId)
      : currentUserId(req);
    const username = String(req.query.username ?? "").trim();

    // Optional analytics rollup if a username is supplied. Without one
    // we still return totals/per-module so the page is useful for users
    // who haven't imported any games yet.
    let skills: Record<
      string,
      { history: { date: string; value: number }[]; current: number; baseline: number }
    > = {};
    if (username) {
      const allGames = await storage.listGames(userId);
      const lower = username.toLowerCase();
      const myGames = allGames.filter(
        (g) =>
          (g.whitePlayer ?? "").toLowerCase() === lower ||
          (g.blackPlayer ?? "").toLowerCase() === lower,
      );
      const analyses = new Map<
        number,
        NonNullable<Awaited<ReturnType<typeof storage.getAnalysisForGame>>>
      >();
      for (const g of myGames) {
        const a = await storage.getAnalysisForGame(g.id);
        if (a) analyses.set(g.id, a);
      }
      const summary = computeAnalytics({ username, games: myGames, analyses });
      const skillKeys = [
        "advantageCapitalization",
        "opening",
        "tactics",
        "timeManagement",
        "resourcefulness",
        "endgame",
      ] as const;
      for (const key of skillKeys) {
        skills[key] = {
          history: summary.buckets.map((b) => ({
            date: b.date,
            value: b.scores[key],
          })),
          current: summary.current[key],
          baseline: summary.baseline[key],
        };
      }
    }

    const attempts = await storage.listAttempts(userId);
    const solved = attempts.filter((a) => a.solved).length;
    const accuracy = attempts.length ? solved / attempts.length : 0;

    const streak = await storage.getStreak(userId);
    const perModule = await storage.listProgress(userId);

    res.json({
      skills,
      totals: {
        solved,
        attempts: attempts.length,
        accuracy,
        streak: streak?.currentStreak ?? 0,
        bestStreak: streak?.longestStreak ?? 0,
      },
      perModule,
    });
  });

  /* -------------------------------------------------------------------- */
  /* Natural language query                                                */
  /* -------------------------------------------------------------------- */
  app.post("/api/query", async (req, res) => {
    const schema = z.object({ query: z.string() });
    const { query } = schema.parse(req.body);
    const parsed = await parseNaturalLanguageQuery(query);
    const all = await storage.listGames(currentUserId(req));
    const filtered = filterGamesByCriteria(all, parsed);
    const stored = await storage.createChessQuery({
      userId: currentUserId(req),
      query,
      parsedCriteria: parsed,
      results: filtered.map((g) => g.id),
    });
    res.json({ query: stored, results: filtered });
  });

  app.post("/api/explain-blunder", async (req, res) => {
    const schema = z.object({
      fenBefore: z.string(),
      san: z.string(),
      bestMove: z.string().nullable(),
      cpl: z.number(),
    });
    const data = schema.parse(req.body);
    const text = await explainBlunder(data);
    res.json({ text });
  });

  registerPhase1Routes(app);
  registerPhase2Routes(app);
  registerPhase3Routes(app);
  registerPhase4Routes(app);
  registerPhase5Routes(app);
  registerWatchRoutes(app);
}

/* ====================================================================== */
/* Phase 1: onboarding, coach, SRS, weakness                              */
/* ====================================================================== */

function registerPhase1Routes(app: Express) {
  /* ---- 1.1 Onboarding calibration ---- */
  app.get("/api/onboarding/puzzles", async (_req, res) => {
    try {
      const puzzles = await pickOnboardingPuzzles(10);
      res.json({ puzzles });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post("/api/onboarding/submit", async (req, res) => {
    try {
      const schema = z.object({
        results: z.array(
          z.object({
            motifKey: z.string(),
            difficulty: z.number().int().min(1).max(5),
            success: z.boolean(),
          }),
        ),
      });
      const { results } = schema.parse(req.body);
      const userId = currentUserId(req);
      for (const r of results) {
        await recordMotifAttempt(userId, r.motifKey, r.difficulty, r.success);
      }
      const recommendations = await recommendModules(userId);
      res.json({ recommendations });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  /* ---- 1.2 AI coach ---- */
  app.post("/api/coach/explain", async (req, res) => {
    try {
      const schema = z.object({
        fen: z.string(),
        userMove: z.string(),
        correctMove: z.string().nullable().optional(),
        motif: z.string().nullable().optional(),
      });
      const data = schema.parse(req.body);
      const out = await explainMistake(data);
      res.json(out);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post("/api/coach/line-question", async (req, res) => {
    try {
      const schema = z.object({
        fen: z.string(),
        moves: z.array(z.string()),
        openingName: z.string().optional(),
        question: z.string().min(3),
      });
      const data = schema.parse(req.body);
      const text = await explainLine(data);
      res.json({ text });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.get("/api/coach/conversations", async (req, res) => {
    try {
      const userId = currentUserId(req);
      const items = await storage.listCoachConversations(userId);
      res.json(
        items.map((c) => ({
          id: c.id,
          title: c.title,
          updatedAt: c.updatedAt,
          preview:
            Array.isArray(c.messages) && c.messages.length > 0
              ? String((c.messages[c.messages.length - 1] as { content?: string })?.content ?? "")
                  .slice(0, 120)
              : "",
        })),
      );
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get("/api/coach/conversations/:id", async (req, res) => {
    try {
      const userId = currentUserId(req);
      const id = Number(req.params.id);
      const conv = await storage.getCoachConversation(id, userId);
      if (!conv) return res.status(404).json({ error: "not_found" });
      res.json(conv);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post("/api/coach/chat", async (req, res) => {
    const schema = z.object({
      message: z.string().min(1).max(8000),
      conversationId: z.number().int().optional(),
      fen: z.string().optional(),
      /** Explicit SAN for offline/engine coach (Play page: user or engine reply). */
      targetSan: z.string().min(1).max(12).optional(),
      /** Play vs computer: concise first-person move notes only (no weakness / engine essays). */
      context: z.enum(["play", "chat"]).optional(),
      /** Human seat on Play page — aligns offline copy with "you". */
      playerColor: z.enum(["white", "black"]).optional(),
    });
    const data = schema.parse(req.body);
    const userId = currentUserId(req);
    let conv = data.conversationId
      ? await storage.getCoachConversation(data.conversationId, userId)
      : undefined;
    if (!conv) {
      conv = await storage.createCoachConversation({
        userId,
        title: data.message.slice(0, 48),
        messages: [],
      });
    }
    await storage.appendCoachMessage(conv.id, userId, { role: "user", content: data.message });

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("X-CFP-Coach-Api", "2");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    let assistant = "";
    try {
      for await (const delta of iterCoachReply({
        userId,
        userMessage: data.message,
        fen: data.fen,
        targetSan: data.targetSan,
        context: data.context ?? "chat",
        playerColor: data.playerColor,
      })) {
        assistant += delta;
        res.write(`data: ${JSON.stringify({ delta, conversationId: conv!.id })}\n\n`);
      }
      await storage.appendCoachMessage(conv!.id, userId, {
        role: "assistant",
        content: assistant || "(empty)",
      });
      res.write(`data: ${JSON.stringify({ done: true, conversationId: conv!.id })}\n\n`);
      res.end();
    } catch (err) {
      res.write(
        `data: ${JSON.stringify({ error: (err as Error).message, conversationId: conv!.id })}\n\n`,
      );
      res.end();
    }
  });

  /* ---- 1.3 SRS ---- */
  app.get("/api/srs/due", async (req, res) => {
    try {
      const userId = currentUserId(req);
      const limit = Math.min(50, Number(req.query.limit ?? 25));
      const cards = await listDueSrs(userId, limit);
      const hydrated = await Promise.all(
        cards.map(async (card) => ({
          card,
          problem: await storage.getTrainingProblem(card.problemId),
        })),
      );
      res.json({ cards: hydrated.filter((h) => h.problem) });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post("/api/srs/review", async (req, res) => {
    try {
      const schema = z.object({
        problemId: z.number().int(),
        quality: z.enum(["fail", "hint-pass", "pass"]),
      });
      const data = schema.parse(req.body);
      const userId = currentUserId(req);
      const card = await scheduleSrs(userId, data.problemId, data.quality);
      res.json({ card });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  /* ---- 1.4 Weakness map ---- */
  app.get("/api/weaknesses", async (req, res) => {
    try {
      const userId = currentUserId(req);
      const limit = Math.min(10, Number(req.query.limit ?? 3));
      const rows = await computeWeaknesses(userId, limit);
      res.json({ weaknesses: rows });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });
}

/* ====================================================================== */
/* Phase 2: timeline data, saved searches, opponent report                */
/* ====================================================================== */

function registerPhase2Routes(app: Express) {
  /* ---- 2.2 saved searches ---- */
  app.get("/api/finder/saved", async (req, res) => {
    const userId = currentUserId(req);
    const list = await storage.listSavedSearches(userId);
    res.json({ searches: list });
  });

  app.post("/api/finder/saved", async (req, res) => {
    try {
      const schema = z.object({ name: z.string().min(1), query: z.any() });
      const data = schema.parse(req.body);
      const userId = currentUserId(req);
      const created = await storage.createSavedSearch({
        userId,
        name: data.name,
        query: data.query,
      });
      res.json({ search: created });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.delete("/api/finder/saved/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "bad id" });
    await storage.deleteSavedSearch(id);
    res.json({ ok: true });
  });

  /* ---- 2.3 opponent one-pager ---- */
  app.get("/api/opponent/:username/report", async (req, res) => {
    try {
      const username = req.params.username;
      const platform = (req.query.platform as string) ?? "chess.com";
      const html = await renderOpponentReportHtml({ username, platform });
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(html);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });
}

/* ====================================================================== */
/* Phase 3: calculation ladder, time-pressure, repertoire                 */
/* ====================================================================== */

function registerPhase3Routes(app: Express) {
  /* ---- 3.1 calculation ladder ---- */
  app.get("/api/training/calculation-ladder", async (req, res) => {
    try {
      const userId = currentUserId(req);
      const rung = Math.max(1, Math.min(10, Number(req.query.rung ?? 1)));
      const problem = await pickCalculationProblem(userId, rung);
      res.json({ rung, problem });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  /* ---- 3.2 time pressure ---- */
  app.get("/api/training/time-pressure", async (req, res) => {
    try {
      const userId = currentUserId(req);
      const problem = await pickTimePressureProblem(userId);
      res.json({ problem });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  /* ---- 3.3 repertoire ---- */
  app.get("/api/repertoires", async (req, res) => {
    const userId = currentUserId(req);
    const list = await storage.listRepertoires(userId);
    res.json({ repertoires: list });
  });

  app.post("/api/repertoires", async (req, res) => {
    try {
      const schema = z.object({
        name: z.string().min(1),
        color: z.enum(["white", "black"]),
      });
      const data = schema.parse(req.body);
      const userId = currentUserId(req);
      const r = await storage.createRepertoire({
        userId,
        name: data.name,
        color: data.color,
      });
      res.json({ repertoire: r });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.delete("/api/repertoires/:id", async (req, res) => {
    await storage.deleteRepertoire(Number(req.params.id));
    res.json({ ok: true });
  });

  app.get("/api/repertoires/:id/nodes", async (req, res) => {
    const nodes = await storage.listRepertoireNodes(Number(req.params.id));
    res.json({ nodes });
  });

  app.post("/api/repertoires/:id/upload-pgn", async (req, res) => {
    try {
      const schema = z.object({ pgn: z.string() });
      const { pgn } = schema.parse(req.body);
      const id = Number(req.params.id);
      const rep = await storage.getRepertoire(id);
      if (!rep) return res.status(404).json({ error: "not found" });
      const nodeCount = await ingestRepertoirePgn(rep, pgn);
      res.json({ ok: true, nodeCount });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post("/api/repertoires/:id/deviation", async (req, res) => {
    try {
      const schema = z.object({
        fen: z.string(),
        san: z.string(),
        side: z.enum(["white", "black"]),
        source: z.enum(["drill", "game"]),
        gameId: z.number().int().nullable().optional(),
      });
      const data = schema.parse(req.body);
      const userId = currentUserId(req);
      const d = await storage.recordRepertoireDeviation({
        repertoireId: Number(req.params.id),
        userId,
        fen: data.fen,
        san: data.san,
        side: data.side,
        source: data.source,
        gameId: data.gameId ?? null,
      });
      res.json({ deviation: d });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.get("/api/repertoires/:id/deviations", async (req, res) => {
    const list = await storage.listRepertoireDeviations(Number(req.params.id));
    res.json({ deviations: list });
  });
}

/* ====================================================================== */
/* Phase 4: variants                                                       */
/* ====================================================================== */

function registerPhase4Routes(app: Express) {
  app.get("/api/variants", (_req, res) => {
    res.json({ variants: VARIANT_CATALOG });
  });

  app.post("/api/variants/new-game", async (req, res) => {
    try {
      const schema = z.object({
        variant: z.string(),
        persona: z.string().optional(),
        timeControl: z.string().optional(),
        color: z.enum(["white", "black", "random"]).optional(),
      });
      const { variant, persona, timeControl, color } = schema.parse(req.body);
      const def = VARIANT_CATALOG.find((v) => v.id === variant);
      if (!def) return res.status(400).json({ error: "unknown variant" });
      const startFen = await pickVariantStartFen(def.id, persona);
      const userId = currentUserId(req);
      const resolvedColor: "white" | "black" =
        color === "random" || !color
          ? Math.random() < 0.5
            ? "white"
            : "black"
          : color;
      const game = await storage.createVariantGame({
        userId,
        variant: def.id,
        persona: persona ?? null,
        startFen,
        pgn: "",
        result: "*",
        timeControl: timeControl ?? null,
        playerColor: resolvedColor,
        finishedAt: null,
      });
      res.json({ game });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post("/api/variants/:id/move", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const schema = z.object({ uci: z.string() });
      const { uci } = schema.parse(req.body);
      const game = await storage.getVariantGame(id);
      if (!game) return res.status(404).json({ error: "not found" });
      const updated = await applyVariantMove(game, uci);
      res.json({ game: updated });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.get("/api/variants/:id", async (req, res) => {
    const g = await storage.getVariantGame(Number(req.params.id));
    if (!g) return res.status(404).json({ error: "not found" });
    res.json({ game: g });
  });
}

/* ====================================================================== */
/* Phase 5: giant Game Library — position explorer, ingest, training mix  */
/* ====================================================================== */

function registerPhase5Routes(app: Express) {
  /**
   * Position explorer — returns per-tier stats for a FEN.
   * Body: { fen: string, tiers?: ExplorerTier[] }
   */
  app.post("/api/library/explore", async (req, res) => {
    try {
      const schema = z.object({
        fen: z.string(),
        tiers: z
          .array(z.enum(EXPLORER_TIERS as unknown as [ExplorerTier, ...ExplorerTier[]]))
          .optional(),
      });
      const { fen, tiers } = schema.parse(req.body);
      const results = await exploreLibrary(fen, tiers);
      res.json({
        fen,
        epd: fenToEpd(fen),
        tiers: results,
      });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  /**
   * Quick GET variant of /api/library/explore for share links.
   * `?fen=...&tier=masters`
   */
  app.get("/api/library/explore", async (req, res) => {
    try {
      const fen = String(req.query.fen ?? "");
      if (!fen) return res.status(400).json({ error: "fen required" });
      const tierParam = req.query.tier as string | undefined;
      const tiers = tierParam ? [tierParam as ExplorerTier] : undefined;
      const results = await exploreLibrary(fen, tiers as readonly ExplorerTier[] | undefined);
      res.json({ fen, epd: fenToEpd(fen), tiers: results });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  /**
   * Catalog of tier labels for the UI dropdown.
   */
  app.get("/api/library/tiers", (_req, res) => {
    res.json({
      tiers: EXPLORER_TIERS.map((id) => ({
        id,
        label: LIBRARY_TIER_LABELS[id] ?? id,
      })),
    });
  });

  /**
   * Browse library games. Supports paging + filtering by tier, source,
   * rating band, year, ECO, player.
   */
  app.get("/api/library/games", async (req, res) => {
    try {
      const tier = (req.query.tier as string | undefined) ?? undefined;
      const source = (req.query.source as string | undefined) ?? undefined;
      const player = (req.query.player as string | undefined) ?? undefined;
      const eco = (req.query.eco as string | undefined) ?? undefined;
      const minRating = req.query.minRating ? Number(req.query.minRating) : undefined;
      const maxRating = req.query.maxRating ? Number(req.query.maxRating) : undefined;
      const yearFrom = req.query.yearFrom ? Number(req.query.yearFrom) : undefined;
      const yearTo = req.query.yearTo ? Number(req.query.yearTo) : undefined;
      const limit = req.query.limit ? Math.min(200, Number(req.query.limit)) : 50;
      const offset = req.query.offset ? Number(req.query.offset) : 0;

      const [games, total] = await Promise.all([
        storage.listLibraryGames({
          tier,
          source,
          player,
          eco,
          minRating,
          maxRating,
          yearFrom,
          yearTo,
          limit,
          offset,
        }),
        storage.countLibraryGames({ tier, source }),
      ]);
      // Trim the heavy fields off the list view — clients only need PGN
      // on the single-game endpoint.
      const summaries = games.map((g) => ({
        id: g.id,
        source: g.source,
        tier: g.tier,
        whitePlayer: g.whitePlayer,
        blackPlayer: g.blackPlayer,
        whiteRating: g.whiteRating,
        blackRating: g.blackRating,
        avgRating: g.avgRating,
        result: g.result,
        eco: g.eco,
        opening: g.opening,
        event: g.event,
        playedAt: g.playedAt,
        plyCount: g.plyCount,
        timeControl: g.timeControl,
      }));
      res.json({
        total,
        offset,
        limit,
        games: summaries,
      });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  /** Single library game including PGN. */
  app.get("/api/library/games/:id", async (req, res) => {
    const g = await storage.getLibraryGame(Number(req.params.id));
    if (!g) return res.status(404).json({ error: "not found" });
    res.json({ game: g });
  });

  /**
   * Library overview — counts per tier + per source, used by the
   * Game Library home tile.
   */
  app.get("/api/library/overview", async (_req, res) => {
    try {
      const tiers = await Promise.all(
        ["masters", "titled", "expert", "intermediate", "amateur", "engine", "broadcast"].map(
          async (tier) => ({
            tier,
            label: LIBRARY_TIER_LABELS[tier] ?? tier,
            count: await storage.countLibraryGames({ tier }),
          }),
        ),
      );
      const sources = await Promise.all(
        ["lichess", "chess.com", "chessbase", "pgn", "broadcast"].map(async (source) => ({
          source,
          count: await storage.countLibraryGames({ source }),
        })),
      );
      res.json({
        total: tiers.reduce((sum, t) => sum + t.count, 0),
        tiers,
        sources,
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  /**
   * Ingest a raw PGN blob into the library (multi-game supported).
   * Body: { pgn: string, source?: "pgn"|"chessbase"|..., tier?: string }
   */
  app.post("/api/library/ingest/pgn", async (req, res) => {
    try {
      const schema = z.object({
        pgn: z.string().min(10),
        source: z
          .enum([
            "pgn",
            "chessbase",
            "broadcast",
            "lichess",
            "chess.com",
            "engine-match",
          ])
          .optional(),
        tier: z
          .enum([
            "masters",
            "titled",
            "expert",
            "intermediate",
            "amateur",
            "engine",
            "broadcast",
          ])
          .optional(),
        maxGames: z.number().int().min(1).max(50_000).optional(),
      });
      const { pgn, source, tier, maxGames } = schema.parse(req.body);
      const summary = await ingestPgnBlob(pgn, {
        source: source ?? "pgn",
        forceTier: tier,
        maxGames,
      });
      res.json({ summary });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  /**
   * Pull a Lichess user's games into the library.
   * Body: { username, max?, perfType?, tier? }
   */
  app.post("/api/library/ingest/lichess", async (req, res) => {
    try {
      const schema = z.object({
        username: z.string().min(1),
        max: z.number().int().min(1).max(1000).optional(),
        perfType: z.enum(["bullet", "blitz", "rapid", "classical"]).optional(),
        tier: z
          .enum([
            "masters",
            "titled",
            "expert",
            "intermediate",
            "amateur",
            "broadcast",
          ])
          .optional(),
      });
      const data = schema.parse(req.body);
      const summary = await ingestLichessUser(data.username, data.max ?? 100, {
        perfType: data.perfType,
        tier: data.tier,
      });
      res.json({ summary });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  /**
   * Pull a Chess.com user's recent months into the library.
   * Body: { username, monthsBack?, timeClass?, tier? }
   */
  app.post("/api/library/ingest/chess-com", async (req, res) => {
    try {
      const schema = z.object({
        username: z.string().min(1),
        monthsBack: z.number().int().min(1).max(24).optional(),
        timeClass: z.enum(["bullet", "blitz", "rapid", "daily"]).optional(),
        tier: z
          .enum([
            "masters",
            "titled",
            "expert",
            "intermediate",
            "amateur",
            "broadcast",
          ])
          .optional(),
        max: z.number().int().min(1).max(5000).optional(),
      });
      const data = schema.parse(req.body);
      const summary = await ingestChessComUser(data.username, data.monthsBack ?? 3, {
        timeClass: data.timeClass,
        tier: data.tier,
        max: data.max,
      });
      res.json({ summary });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  /**
   * Delete a single library game.
   */
  app.delete("/api/library/games/:id", async (req, res) => {
    try {
      await storage.deleteLibraryGame(Number(req.params.id));
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  /**
   * Generate training problems from the library for a given module.
   * Body: { module, count?, tier?, player?, depth?, persist? }
   *
   * Used by the Training Hub's "From Library" button — every module
   * (tactics, blunder-preventer, advantage, defender, opening-improver,
   * visualization, checkmate-patterns, 360, retry) routes through this.
   */
  app.post("/api/library/generate-training", async (req, res) => {
    try {
      const schema = z.object({
        module: z.enum([
          "tactics",
          "blunder-preventer",
          "retry-mistakes",
          "opening-improver",
          "advantage-capitalization",
          "defender",
          "visualization",
          "checkmate-patterns",
          "360",
        ]),
        count: z.number().int().min(1).max(50).optional(),
        tier: z.string().optional(),
        player: z.string().optional(),
        depth: z.number().int().min(6).max(20).optional(),
        persist: z.boolean().optional(),
      });
      const data = schema.parse(req.body);
      const problems = await generateFromLibrary({
        module: data.module,
        count: data.count,
        tier: data.tier,
        player: data.player,
        depth: data.depth,
        persist: data.persist,
      });
      res.json({ problems });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });
}

/* ====================================================================== */
/* Watch: channels, timeline, CvC live, MP4 studio                        */
/* ====================================================================== */

function registerWatchRoutes(app: Express) {
  /* ---- Channels ---- */
  app.get("/api/watch/channels", async (_req, res) => {
    try {
      const channels = await listChannels();
      res.json({ channels });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get("/api/watch/channels/:slug", async (req, res) => {
    try {
      const slug = String(req.params.slug);
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const offset = req.query.offset ? Number(req.query.offset) : undefined;
      const channel = await getChannel(slug, { limit, offset });
      if (!channel) return res.status(404).json({ error: "channel not found" });
      res.json(channel);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post("/api/watch/channels/invalidate", (req, res) => {
    const slug = req.body?.slug as string | undefined;
    invalidateChannelCache(slug);
    res.json({ ok: true });
  });

  /* ---- Pre-rendered narration MP3 (edge-tts cache) ---- */
  app.get("/api/watch/audio/:filename", (req, res) => {
    const filename = String(req.params.filename ?? "");
    if (!/^[\da-f]{24}\.mp3$/i.test(filename)) {
      return res.status(400).json({ error: "invalid audio id" });
    }
    const hash = filename.replace(/\.mp3$/i, "");
    const p = audioFilePathForHash(hash);
    if (!existsSync(p)) return res.status(404).end();
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    createReadStream(p).pipe(res);
  });

  /* ---- Game timeline (shared by player + render) ---- */
  app.get("/api/watch/games/:id/timeline", async (req, res) => {
    try {
      const gameId = Number(req.params.id);
      if (!Number.isFinite(gameId)) {
        return res.status(400).json({ error: "invalid game id" });
      }
      const llmPolish = req.query.llmPolish === "1" || req.query.llmPolish === "true";
      const targetRaw = req.query.targetSeconds ?? req.query.targetDuration;
      const targetDurationS =
        targetRaw != null && String(targetRaw).trim() !== ""
          ? Number(targetRaw)
          : undefined;
      const voiceRaw = req.query.voice;
      const voice =
        typeof voiceRaw === "string" && voiceRaw.trim() !== "" ? voiceRaw.trim() : undefined;
      const timeline = await buildTimeline(gameId, {
        llmPolish,
        targetDurationS:
          targetDurationS != null && Number.isFinite(targetDurationS)
            ? targetDurationS
            : undefined,
        voice,
      });
      if (!timeline) return res.status(404).json({ error: "game not found" });
      res.json({ timeline });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  /* ---- Engine match (CvC) ---- */
  const engineSideSchema = z.object({
    name: z.string().min(1),
    skill: z.number().int().min(0).max(20).optional(),
    depth: z.number().int().min(2).max(22).optional(),
    movetimeMs: z.number().int().min(50).max(60_000).optional(),
    elo: z.number().int().min(1320).max(3190).optional(),
    contempt: z.number().int().min(-100).max(100).optional(),
  });
  const matchStartSchema = z.object({
    white: engineSideSchema,
    black: engineSideSchema,
    maxPlies: z.number().int().min(20).max(400).optional(),
    event: z.string().optional(),
    binary: z.string().optional(),
  });

  app.post("/api/engines/match", (req, res) => {
    try {
      const parsed = matchStartSchema.parse(req.body) as {
        white: EngineSideOptions;
        black: EngineSideOptions;
        maxPlies?: number;
        event?: string;
        binary?: string;
      };
      const match = startMatch(parsed);
      // Invalidate the engine-matches channel so the new match appears.
      invalidateChannelCache("engine-matches-mine");
      res.json({ match });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.get("/api/engines/match", (_req, res) => {
    res.json({ matches: listMatches() });
  });

  app.get("/api/engines/match/:id", (req, res) => {
    const m = getMatch(req.params.id);
    if (!m) return res.status(404).json({ error: "match not found" });
    res.json({ match: m });
  });

  app.post("/api/engines/match/:id/cancel", (req, res) => {
    const ok = cancelMatch(req.params.id);
    if (!ok) return res.status(404).json({ error: "match not found" });
    res.json({ ok: true });
  });

  app.get("/api/engines/match/:id/stream", (req, res) => {
    const id = req.params.id;
    const m = getMatch(id);
    if (!m) return res.status(404).json({ error: "match not found" });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const send = (data: unknown) => {
      try {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      } catch {
        /* connection closed */
      }
    };
    // Heartbeat so reverse proxies don't kill idle SSE connections.
    const heartbeat = setInterval(() => {
      try {
        res.write(`: hb\n\n`);
      } catch {
        /* ignore */
      }
    }, 15_000);

    const unsub = subscribeMatch(id, send);

    req.on("close", () => {
      clearInterval(heartbeat);
      unsub();
    });
  });

  /* ---- Studio MP4 export ---- */
  app.get("/api/watch/studio/deps", async (_req, res) => {
    try {
      const deps = await checkRenderDeps();
      res.json(deps);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get("/api/watch/studio/render", (_req, res) => {
    res.json({ jobs: listRenderJobs() });
  });

  const renderSchema = z.object({
    gameId: z.number().int().positive(),
    fps: z.number().int().min(15).max(60).optional(),
    boardSize: z.number().int().min(360).max(1440).optional(),
    width: z.number().int().min(640).max(3840).optional(),
    height: z.number().int().min(360).max(2160).optional(),
    theme: z.enum(["green", "wood"]).optional(),
    mute: z.boolean().optional(),
    includeIntro: z.boolean().optional(),
    llmPolish: z.boolean().optional(),
    voice: z
      .object({
        provider: z.enum(["piper", "openai", "elevenlabs", "silent"]).optional(),
        voice: z.string().optional(),
        rate: z.number().min(0.5).max(2).optional(),
      })
      .optional(),
  });

  app.post("/api/watch/studio/render", async (req, res) => {
    try {
      const data = renderSchema.parse(req.body);
      const job = await enqueueRender(data.gameId, {
        fps: data.fps,
        boardSize: data.boardSize,
        width: data.width,
        height: data.height,
        theme: data.theme,
        mute: data.mute,
        includeIntro: data.includeIntro,
        llmPolish: data.llmPolish,
        voice: data.voice,
      });
      res.json({ job });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.get("/api/watch/studio/render/:id", (req, res) => {
    const job = getRenderJob(req.params.id);
    if (!job) return res.status(404).json({ error: "render not found" });
    res.json({ job });
  });

  app.get("/api/watch/studio/render/:id/stream", (req, res) => {
    const job = getRenderJob(req.params.id);
    if (!job) return res.status(404).json({ error: "render not found" });
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();
    const send = (j: typeof job) => {
      try {
        res.write(`data: ${JSON.stringify(j)}\n\n`);
      } catch {
        /* closed */
      }
    };
    send(job);
    const unsub = subscribeToRenderJob(req.params.id, send);
    req.on("close", () => unsub());
  });

  app.get("/api/watch/studio/render/:id/download", async (req, res) => {
    const job = getRenderJob(req.params.id);
    if (!job) return res.status(404).json({ error: "render not found" });
    const info = await streamRenderOutput(job);
    if (!info) {
      return res
        .status(409)
        .json({ error: `render not ready (state=${job.state})` });
    }
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="chessfinderpro-${job.id}.mp4"`,
    );
    res.setHeader("Content-Length", String(info.size));
    const { createReadStream } = await import("node:fs");
    createReadStream(info.path).pipe(res);
  });

  /**
   * Internal: used by the headless renderer to pull its timeline by
   * one-shot token. Returns the same shape as the public timeline
   * endpoint plus the render options baked into the job.
   */
  app.get("/api/watch/studio/render/by-token/:token", async (req, res) => {
    const job = getRenderJobByToken(req.params.token);
    if (!job) return res.status(404).json({ error: "token not found" });
    if (!job.timeline) {
      const timeline = await buildTimeline(job.gameId, {
        llmPolish: job.options.llmPolish,
        voice: job.options.watchVoice,
      });
      if (!timeline) return res.status(404).json({ error: "game not found" });
      job.timeline = timeline;
    }
    res.json({
      timeline: job.timeline,
      options: job.options,
    });
  });
}

/* ====================================================================== */
/* Helpers                                                                */
/* ====================================================================== */

/**
 * Core motif search — filters stored instances using the shared criteria,
 * scopes to the user's imported games, and hydrates each row with a short
 * summary of the parent game (white/black/result/eco) for the UI.
 */
async function runMotifSearch(
  criteria: MotifSearchCriteria,
  userId: number,
): Promise<{
  criteria: MotifSearchCriteria;
  total: number;
  results: Array<{
    id: number;
    motifKey: string;
    ply: number | null;
    fen: string | null;
    data: MotifInstanceData;
    gameId: number | null;
    createdAt: Date;
    game: {
      id: number;
      white: string | null;
      black: string | null;
      result: string | null;
      eco: string | null;
      opening: string | null;
    } | null;
  }>;
}> {
  const limit = Math.max(1, Math.min(500, criteria.limit ?? 50));
  const offset = Math.max(0, criteria.offset ?? 0);

  const games = await storage.listGames(userId);
  const myGameIds = new Set(games.map((g) => g.id));
  const gameById = new Map(games.map((g) => [g.id, g] as const));

  const requestedKeys = new Set(criteria.motifKeys ?? []);
  const requestedCategory = criteria.category;

  const all = await storage.listMotifInstances(
    criteria.gameId ? { gameId: criteria.gameId } : undefined,
  );

  const filtered = all.filter((row) => {
    if (row.gameId != null && !myGameIds.has(row.gameId)) return false;

    if (requestedKeys.size > 0 && !requestedKeys.has(row.motifKey)) return false;
    if (requestedCategory && MOTIF_KEY_TO_CATEGORY[row.motifKey] !== requestedCategory) {
      return false;
    }

    const data = (row.data ?? {}) as MotifInstanceData;
    if (criteria.side && data.side && data.side !== criteria.side) return false;
    if (criteria.missed === true && !data.missed) return false;

    if (criteria.minEvalSwing != null) {
      const swing = data.evalSwing ?? 0;
      if (Math.abs(swing) < criteria.minEvalSwing) return false;
    }

    if (criteria.result) {
      // Map PGN result + side preference into win/loss/draw bucket.
      const gameResult = data.gameResult ?? (row.gameId ? gameById.get(row.gameId)?.result : null);
      if (!gameResult) return false;
      const side = criteria.side ?? data.side ?? null;
      const bucket = bucketResult(gameResult, side);
      if (bucket !== criteria.result) return false;
    }
    return true;
  });

  // Newest first.
  filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const slice = filtered.slice(offset, offset + limit).map((row) => {
    const game = row.gameId ? gameById.get(row.gameId) : undefined;
    return {
      id: row.id,
      motifKey: row.motifKey,
      ply: row.ply,
      fen: row.fen,
      data: (row.data ?? {}) as MotifInstanceData,
      gameId: row.gameId,
      createdAt: row.createdAt,
      game: game
        ? {
            id: game.id,
            white: game.whitePlayer,
            black: game.blackPlayer,
            result: game.result,
            eco: game.eco,
            opening: game.opening,
          }
        : null,
    };
  });

  return { criteria, total: filtered.length, results: slice };
}

/** Map "1-0" / "0-1" / "1/2-1/2" → win/loss/draw from `side`'s perspective. */
function bucketResult(
  result: string,
  side: "white" | "black" | null,
): "win" | "loss" | "draw" | null {
  const r = result.trim();
  if (r === "1/2-1/2") return "draw";
  if (!side) return null;
  if (r === "1-0") return side === "white" ? "win" : "loss";
  if (r === "0-1") return side === "black" ? "win" : "loss";
  return null;
}

/**
 * Run both halves of the Pattern Finder pipeline:
 *   - `games` — motif instances filtered against the user's imported corpus
 *               (re-used from `runMotifSearch`).
 *   - `lines` — engine-driven line discovery starting from the resolved
 *               opening, filtered by the query's predicate.
 * The `scope` field in the query decides which halves to actually run, so
 * "in my games" stays cheap and "find lines" stays focused.
 */
async function runFinderSearch(
  query: LineQuery,
  userId: number,
): Promise<{
  query: LineQuery;
  opening: { id: string; name: string; eco?: string } | null;
  games: Awaited<ReturnType<typeof runMotifSearch>>["results"];
  lines: import("../shared/schema.js").DiscoveredLine[];
}> {
  const scope = query.scope ?? "both";

  // Game-side results re-use the motif pipeline.
  let games: Awaited<ReturnType<typeof runMotifSearch>>["results"] = [];
  if (scope !== "lines") {
    const motifCriteria: MotifSearchCriteria = {
      motifKeys: query.motifs,
      side: query.side,
      result: query.result,
      missed: query.missed,
      limit: query.limit ?? 30,
    };
    const r = await runMotifSearch(motifCriteria, userId);
    games = r.results;
  }

  // Line discovery — engine tree walk from the resolved opening or
  // (when a setup is named) a per-opponent-first-move walk.
  let lines: import("../shared/schema.js").DiscoveredLine[] = [];
  let opening: { id: string; name: string; eco?: string } | null = null;
  if (scope !== "games") {
    try {
      if (query.setupId) {
        const setup = getSetup(query.setupId);
        if (setup) {
          lines = await searchSetup(setup, query);
          opening = { id: setup.id, name: setup.name };
        }
      } else if (query.openingId || query.openingHint || query.raw) {
        lines = await searchLines({ ...query, maxResults: query.limit ?? 12 });
        if (lines.length > 0) opening = lines[0].opening;
        if (!opening && query.openingHint) {
          const e = await resolveOpeningName(query.openingHint);
          if (e) opening = { id: e.id, name: e.name, eco: e.eco };
        }
      } else if (query.side) {
        // No opening or setup hinted, but a side preference → any-opening
        // sweep (handled inside `searchLines` when `openingId` is unset).
        lines = await searchLines({ ...query, maxResults: query.limit ?? 12 });
      }
    } catch (err) {
      console.warn(`[finder] line search failed: ${(err as Error).message}`);
    }
  }

  return { query, opening, games, lines };
}

function scoutCacheKey(opts: {
  platform: string;
  username: string;
  maxGames: number;
  timeControl?: "bullet" | "blitz" | "rapid" | "classical";
  sinceMonth?: string;
  sinceMs?: number;
}): string {
  return [
    opts.platform,
    opts.username.toLowerCase(),
    String(opts.maxGames),
    opts.timeControl ?? "any",
    opts.sinceMonth ?? "",
    String(opts.sinceMs ?? ""),
  ].join("::");
}

function parsePgnToGame(pgn: string, source: string, userId: number) {
  const headers = parsePgnHeaders(pgn);
  const openingFromHeader = headers.Opening?.trim() || null;
  const eco = headers.ECO?.trim() || null;
  return {
    pgn,
    userId,
    whitePlayer: headers.White ?? null,
    blackPlayer: headers.Black ?? null,
    whiteRating: numOrNull(headers.WhiteElo),
    blackRating: numOrNull(headers.BlackElo),
    result: headers.Result ?? null,
    source,
    timeControl: classifyTimeControl(headers.TimeControl),
    eco,
    opening: openingFromHeader ?? deriveOpeningLabelFromPgn(pgn, eco),
    playedAt: dateOrNull(headers.UTCDate ?? headers.Date),
  };
}

/** When [Opening "..."] is missing (common on chess.com API PGNs), show first plies as a readable label. */
function deriveOpeningLabelFromPgn(pgn: string, eco: string | null): string | null {
  try {
    const chess = new Chess();
    chess.loadPgn(pgn);
    const moves = chess.history();
    if (moves.length === 0) return eco ? `ECO ${eco}` : null;
    const slice = moves.slice(0, 8).join(" ");
    return eco ? `${eco}: ${slice}` : slice;
  } catch {
    return eco ? `ECO ${eco}` : null;
  }
}

function parsePgnHeaders(pgn: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /\[(\w+)\s+"([^"]*)"\]/g;
  let m;
  while ((m = re.exec(pgn))) out[m[1]] = m[2];
  return out;
}

function numOrNull(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function dateOrNull(v: string | undefined): Date | null {
  if (!v) return null;
  const norm = v.replace(/\./g, "-");
  const d = new Date(norm);
  return Number.isNaN(d.getTime()) ? null : d;
}

function classifyTimeControl(tc: string | undefined): string {
  if (!tc) return "unknown";
  const trimmed = tc.trim();
  // chess.com daily / correspondence: "1/86400", "1/259200" (increment style)
  if (/^\d+\/\d+$/.test(trimmed)) return "daily";
  const base = trimmed.split("+")[0]?.trim() ?? trimmed;
  const seconds = Number(base);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return trimmed.length > 24 ? `${trimmed.slice(0, 21)}…` : trimmed;
  }
  if (seconds < 180) return "bullet";
  if (seconds < 600) return "blitz";
  if (seconds < 1800) return "rapid";
  return "classical";
}

function splitPgnDocument(pgn: string): string[] {
  // Each game starts with [Event "..."]; split on that header boundary.
  const parts = pgn
    .split(/\n(?=\[Event\s)/g)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [pgn];
}

async function fetchChessComGames(
  username: string,
  max: number,
  timeClass?: "bullet" | "blitz" | "rapid" | "classical",
  opts?: { sinceMonth?: string /* YYYY-MM */; untilMonth?: string },
): Promise<ReturnType<typeof parsePgnToGame>[]> {
  // Walk the full archive INDEX so we can pull >40 games. The /archives
  // endpoint returns every monthly URL the player has ever had.
  const ua = { "User-Agent": "ChessFinderPro/0.1 (+https://github.com/)" };
  const archivesRes = await fetch(
    `https://api.chess.com/pub/player/${encodeURIComponent(username)}/games/archives`,
    { headers: ua },
  );
  if (archivesRes.status === 404) {
    throw new Error(`chess.com: user '${username}' not found`);
  }
  if (!archivesRes.ok) {
    throw new Error(`chess.com archives HTTP ${archivesRes.status}`);
  }
  const archives = ((await archivesRes.json()) as { archives?: string[] }).archives ?? [];
  // Newest first.
  archives.sort();
  archives.reverse();

  const filtered = archives.filter((u) => {
    const m = u.match(/\/(\d{4})\/(\d{2})$/);
    if (!m) return true;
    const ym = `${m[1]}-${m[2]}`;
    if (opts?.sinceMonth && ym < opts.sinceMonth) return false;
    if (opts?.untilMonth && ym > opts.untilMonth) return false;
    return true;
  });

  const games: ReturnType<typeof parsePgnToGame>[] = [];
  for (const url of filtered) {
    if (games.length >= max) break;
    const r = await fetch(url, { headers: ua });
    if (!r.ok) {
      if (r.status === 404) continue;
      throw new Error(`chess.com month HTTP ${r.status}`);
    }
    const json = (await r.json()) as {
      games?: { pgn: string; time_class?: string; rules?: string }[];
    };
    const monthly = (json.games ?? [])
      .filter((g) => g.rules === "chess" || g.rules == null)
      .filter((g) => !timeClass || g.time_class === timeClass);
    // Newest within the month first.
    for (const g of monthly.reverse()) {
      if (games.length >= max) break;
      if (g.pgn) games.push(parsePgnToGame(g.pgn, "chess.com", 1));
    }
  }
  return games;
}

async function fetchLichessGames(
  username: string,
  max: number,
  perfType?: "bullet" | "blitz" | "rapid" | "classical",
  opts?: { sinceMs?: number; untilMs?: number },
): Promise<ReturnType<typeof parsePgnToGame>[]> {
  const params = new URLSearchParams({
    max: String(Math.min(max, 1000)),
    pgnInJson: "true",
    clocks: "false",
    evals: "false",
    opening: "true",
  });
  if (perfType) params.set("perfType", perfType);
  if (opts?.sinceMs) params.set("since", String(opts.sinceMs));
  if (opts?.untilMs) params.set("until", String(opts.untilMs));
  const url = `https://lichess.org/api/games/user/${encodeURIComponent(username)}?${params.toString()}`;
  const headers: Record<string, string> = { Accept: "application/x-ndjson" };
  if (process.env.LICHESS_TOKEN) headers.Authorization = `Bearer ${process.env.LICHESS_TOKEN}`;
  const r = await fetch(url, { headers });
  if (r.status === 404) throw new Error(`lichess: user '${username}' not found`);
  if (!r.ok) throw new Error(`lichess HTTP ${r.status}`);
  const text = await r.text();
  const lines = text.split("\n").filter(Boolean);
  const games: ReturnType<typeof parsePgnToGame>[] = [];
  for (const line of lines) {
    try {
      const obj = JSON.parse(line) as { pgn?: string };
      if (obj.pgn) games.push(parsePgnToGame(obj.pgn, "lichess", 1));
    } catch {
      // skip malformed line
    }
  }
  return games;
}

function filterGamesByCriteria(
  games: Awaited<ReturnType<typeof storage.listGames>>,
  criteria: Awaited<ReturnType<typeof parseNaturalLanguageQuery>>,
) {
  return games.filter((g) => {
    if (criteria.color === "white" && g.whitePlayer !== "dev") return true; // permissive
    if (criteria.timeControl && g.timeControl && g.timeControl !== criteria.timeControl) return false;
    if (criteria.result === "win" && g.result !== "1-0" && g.result !== "0-1") return false;
    if (criteria.result === "draw" && g.result !== "1/2-1/2") return false;
    return true;
  });
}

// Touch Chess so the import isn't tree-shaken away at build time — used by some helpers.
void Chess;

let _scoutGameId = 1_000_000;
function nextScoutGameId() {
  return _scoutGameId++;
}
