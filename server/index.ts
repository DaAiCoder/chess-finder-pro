import express, { type Request, type Response, type NextFunction } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerRoutes } from "./routes.js";
import { storage } from "./storage.js";
import { seedTraining, seedBulkBasicMatesInBackground } from "./seed-training.js";
import { maybeAutoSeedFromChampions } from "./services/autoSeedFromChampions.js";
import { maybeAutoSeedLibrary } from "./services/autoSeedLibrary.js";
import { ensureRatedBandGames } from "./services/ratedBandLibrarySeed.js";
import { installAuth, registerAuthRoutes } from "./auth.js";
import { registerSitePricingRoutes } from "./services/sitePricing.js";
import { registerBillingRoutes, registerBillingWebhook } from "./services/billing.js";
import { runStartupSelfTests } from "./selfTest.js";
import { startGeneratorCron } from "./services/generatorCron.js";
import { resolveCoachLlmForExplain } from "./services/coachLlm.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT ?? 5000);
const NODE_ENV = process.env.NODE_ENV ?? "development";

async function main() {
  const app = express();

  // Stripe webhook must see the RAW request body to verify the signature, so
  // it must be registered BEFORE `express.json()`. The handler itself uses
  // `express.raw({ type: 'application/json' })` to satisfy that.
  registerBillingWebhook(app);

  app.use(express.json({ limit: "20mb" }));
  app.use(express.urlencoded({ extended: true }));

  app.use((req, _res, next) => {
    if (req.url.startsWith("/api")) {
      // eslint-disable-next-line no-console
      console.log(`[api] ${req.method} ${req.url}`);
    }
    next();
  });

  await storage.init();
  await seedTraining(storage);

  // Session + identity must be installed BEFORE route handlers so every
  // request has access to `req.session.userId`.
  installAuth(app);
  registerAuthRoutes(app);
  registerSitePricingRoutes(app);
  registerBillingRoutes(app);
  registerRoutes(app);

  // Validate seeds + opening prefixes once at boot — non-fatal warnings.
  runStartupSelfTests().catch((err) =>
    console.warn("[self-test] crashed:", (err as Error).message),
  );

  if (NODE_ENV === "development") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      root: path.resolve(__dirname, "../client"),
      server: { middlewareMode: true },
      appType: "custom",
      resolve: {
        alias: {
          "@": path.resolve(__dirname, "../client/src"),
          "@shared": path.resolve(__dirname, "../shared"),
        },
      },
    });
    app.use(vite.middlewares);
    app.use("*", async (req, res, next) => {
      // Don't intercept API requests — they're handled by registerRoutes above.
      if (req.originalUrl.startsWith("/api")) return next();
      try {
        const url = req.originalUrl;
        const indexPath = path.resolve(__dirname, "../client/index.html");
        const fs = await import("node:fs/promises");
        let html = await fs.readFile(indexPath, "utf-8");
        html = await vite.transformIndexHtml(url, html);
        res.status(200).set({ "Content-Type": "text/html" }).end(html);
      } catch (e) {
        next(e);
      }
    });
  } else {
    const distClient = path.resolve(__dirname, "../client");
    app.use(express.static(distClient));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distClient, "index.html"));
    });
  }

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    // eslint-disable-next-line no-console
    console.error("[error]", err);
    const status = err.name === "ZodError" ? 400 : 500;
    if (!res.headersSent) {
      res.status(status).json({ error: err.message });
    }
  });

  // Last-ditch safety nets so a stray throw in an async handler never
  // tears down the dev server. We just log; the next request will hit
  // a fresh handler.
  process.on("unhandledRejection", (reason) => {
    // eslint-disable-next-line no-console
    console.error("[unhandledRejection]", reason);
  });
  process.on("uncaughtException", (err) => {
    // eslint-disable-next-line no-console
    console.error("[uncaughtException]", err);
  });

  // Explicitly bind to IPv4 0.0.0.0 — on Windows, omitting the host arg can
  // cause IPv6-only binding which makes localhost requests hang.
  app.listen(PORT, "0.0.0.0", () => {
    // eslint-disable-next-line no-console
    console.log(`\n  ChessFinderPro listening on http://localhost:${PORT}`);
    console.log(`  Mode: ${NODE_ENV}`);
    console.log(`  Storage: ${process.env.DATABASE_URL ? "Postgres" : "in-memory"}`);
    {
      const coach = resolveCoachLlmForExplain();
      console.log(
        `  Coach: ${coach ? `${coach.kind} (${coach.model})` : "offline hints (no cloud keys; Ollama disabled or unset)"}\n`,
      );
    }

    // Background-populate trainers from champion games on a fresh install.
    // Disabled with AUTO_SEED=false for tests / CI / deterministic runs.
    if (process.env.AUTO_SEED !== "false") {
      setImmediate(() => {
        maybeAutoSeedFromChampions(storage).catch((err) => {
          // eslint-disable-next-line no-console
          console.warn("[auto-seed] crashed:", (err as Error).message);
        });
      });
      // Also seed the Game Library from bundled champion PGNs so the
      // explorer has thousands of master games available immediately,
      // independent of Lichess's public API. Idempotent: skips once the
      // library is non-trivially populated.
      setImmediate(() => {
        void (async () => {
          try {
            await maybeAutoSeedLibrary(storage);
            await ensureRatedBandGames(storage);
          } catch (err) {
            // eslint-disable-next-line no-console
            console.warn("[library-seed] crashed:", (err as Error).message);
          }
        })();
      });
    }

    // Periodic generator cron: weekly per-user pass over unanalyzed
    // imports. Disable with GENERATOR_CRON=off.
    startGeneratorCron(storage);

    // Heavy bulk basic-mate scan (~60-240s of *synchronous* CPU that
    // blocks the Node event loop). Skipped by default — the curated
    // seeds already give every trainer a usable pool. Set BULK_SEED=on
    // to enable the bonus mate-in-1 backfill (worth doing once per
    // database; rows are idempotent so future runs are quick).
    if (process.env.BULK_SEED === "on") {
      setImmediate(() => {
        void seedBulkBasicMatesInBackground(storage);
      });
    }
  });
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
