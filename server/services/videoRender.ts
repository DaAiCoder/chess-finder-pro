/**
 * MP4 export pipeline.
 *
 * The render flow:
 *   1. Build (or load) the cached `WatchTimelinePayload` for a game.
 *   2. Optionally synthesize a narration audio track via `TtsProvider`
 *      (Piper offline by default; OpenAI/ElevenLabs when configured).
 *   3. Boot headless Chromium (Puppeteer), navigate to
 *      `/watch/render?token=<job>`, and step the timeline forward
 *      `1/30 s` at a time, screenshotting each frame.
 *   4. Mux PNG frames + the narration WAV into an MP4 via ffmpeg.
 *
 * Dependencies (puppeteer, fluent-ffmpeg, ffmpeg binary) are *optional*.
 * If any of them is missing, this module gracefully returns a job in
 * `error` state with a human-readable message so the UI can surface
 * the install instructions, and the rest of the Watch experience still
 * works end-to-end without crashing on import.
 */

import { promises as fs, existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { buildTimeline, type WatchTimelinePayload } from "./watchTimeline.js";
import { synthesizeNarration, type TtsOptions } from "./tts.js";
import { concatCaptionMp3sToSingleFile } from "./watchAudio.js";

export type RenderState = "queued" | "running" | "done" | "error";

export interface RenderJob {
  id: string;
  gameId: number;
  state: RenderState;
  progress: number;
  message?: string;
  /** Final MP4 path once `state === "done"`. */
  outputPath?: string;
  /** Bytes on disk for the final MP4. */
  bytes?: number;
  /** Seconds of footage produced. */
  durationS?: number;
  /** Timeline payload baked into the job (kept for reproducibility). */
  timeline?: WatchTimelinePayload;
  options: RenderOptions;
  createdAt: number;
  finishedAt?: number;
}

export interface RenderOptions {
  /** Frames per second. 24/30/60 supported. */
  fps?: number;
  /** Output board size (px square). Default 720 → 1080p frame. */
  boardSize?: number;
  /** Output frame width / height — 1920×1080 by default. */
  width?: number;
  height?: number;
  /** Board theme. */
  theme?: "green" | "wood";
  /** Voice / provider selection passed to the TTS layer. */
  voice?: TtsOptions;
  /** Watch narration voice id: aria | guy | ryan (edge-tts timeline cache). */
  watchVoice?: string;
  /** Skip narration audio entirely. */
  mute?: boolean;
  /** Bake in the intro/outro stings if `branding.mp4` is present. */
  includeIntro?: boolean;
  /** Run LLM-polished narration if a provider is configured. */
  llmPolish?: boolean;
}

const RENDER_ROOT = path.resolve(
  process.env.RENDER_DIR ?? path.join(process.cwd(), "data", "renders"),
);
const jobs = new Map<string, RenderJob>();
const jobEvents = new EventEmitter();
jobEvents.setMaxListeners(50);
const jobTokens = new Map<string, string>(); // token → jobId
let _jobCounter = 1;

export function listRenderJobs(): RenderJob[] {
  return [...jobs.values()].sort((a, b) => b.createdAt - a.createdAt);
}

export function getRenderJob(id: string): RenderJob | null {
  return jobs.get(id) ?? null;
}

export function getRenderJobByToken(token: string): RenderJob | null {
  const id = jobTokens.get(token);
  return id ? (jobs.get(id) ?? null) : null;
}

/**
 * Queue a render. Returns the job id immediately; consumers should
 * poll `/api/watch/studio/render/:id` or subscribe to events.
 */
export async function enqueueRender(
  gameId: number,
  options: RenderOptions = {},
): Promise<RenderJob> {
  const id = `r_${Date.now().toString(36)}_${_jobCounter++}`;
  const token = `t_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e9).toString(36)}`;
  const job: RenderJob = {
    id,
    gameId,
    state: "queued",
    progress: 0,
    options,
    createdAt: Date.now(),
  };
  jobs.set(id, job);
  jobTokens.set(token, id);
  // Fire-and-forget. Errors are surfaced on the job state.
  void runRender(job, token).catch((err) => {
    job.state = "error";
    job.message = (err as Error).message;
    job.finishedAt = Date.now();
    jobEvents.emit(`update:${id}`, job);
  });
  return job;
}

export function subscribeToRenderJob(
  id: string,
  cb: (job: RenderJob) => void,
): () => void {
  const handler = (j: RenderJob) => cb(j);
  jobEvents.on(`update:${id}`, handler);
  return () => jobEvents.off(`update:${id}`, handler);
}

/* ---------------------------------------------------------------------- */
/* Render worker                                                          */
/* ---------------------------------------------------------------------- */

async function runRender(job: RenderJob, token: string): Promise<void> {
  await fs.mkdir(RENDER_ROOT, { recursive: true });
  job.state = "running";
  job.message = "Building timeline…";
  job.progress = 2;
  jobEvents.emit(`update:${job.id}`, job);

  // 1. Resolve the timeline.
  const timeline = await buildTimeline(job.gameId, {
    llmPolish: job.options.llmPolish,
    voice: job.options.watchVoice,
  });
  if (!timeline) {
    job.state = "error";
    job.message = "Library game not found.";
    job.finishedAt = Date.now();
    jobEvents.emit(`update:${job.id}`, job);
    return;
  }
  job.timeline = timeline;
  job.progress = 6;
  job.message = "Loading Puppeteer + ffmpeg…";
  jobEvents.emit(`update:${job.id}`, job);

  // 2. Verify deps.
  const deps = await checkDeps();
  if (!deps.puppeteer) {
    job.state = "error";
    job.message =
      "puppeteer is not installed. Run: npm i puppeteer fluent-ffmpeg (and install ffmpeg).";
    job.finishedAt = Date.now();
    jobEvents.emit(`update:${job.id}`, job);
    return;
  }
  if (!deps.ffmpeg) {
    job.state = "error";
    job.message = "ffmpeg binary not found on PATH.";
    job.finishedAt = Date.now();
    jobEvents.emit(`update:${job.id}`, job);
    return;
  }

  // 3. Synthesize narration (reuse edge-tts MP3s when present).
  const audioOpts = job.options.mute ? null : (job.options.voice ?? {});
  let narrationPath: string | null = null;
  if (audioOpts) {
    try {
      job.message = "Synthesizing narration…";
      job.progress = 12;
      jobEvents.emit(`update:${job.id}`, job);
      const hasEmbedded =
        timeline.captions.length > 0 && timeline.captions.some((c) => c.audioUrl);
      if (hasEmbedded) {
        narrationPath = await concatCaptionMp3sToSingleFile(timeline.captions);
      }
      if (!narrationPath) {
        narrationPath = await synthesizeNarration(timeline.captions, audioOpts);
      }
    } catch (err) {
      job.message = `Narration synth failed, continuing silent: ${(err as Error).message}`;
      jobEvents.emit(`update:${job.id}`, job);
    }
  }

  // 4. Capture frames.
  const fps = job.options.fps ?? 30;
  const width = job.options.width ?? 1920;
  const height = job.options.height ?? 1080;
  const totalS = timeline.totalDurationS;
  const totalFrames = Math.max(1, Math.ceil(totalS * fps));
  const framesDir = path.join(RENDER_ROOT, job.id, "frames");
  await fs.mkdir(framesDir, { recursive: true });

  job.message = `Capturing ${totalFrames} frames…`;
  job.progress = 20;
  jobEvents.emit(`update:${job.id}`, job);

  const baseUrl =
    process.env.RENDER_BASE_URL ?? `http://127.0.0.1:${process.env.PORT ?? "5173"}`;
  const renderUrl = `${baseUrl}/watch/render?token=${token}`;

  // Lazy-import puppeteer so the server can boot/typecheck without it.
  // The package is optional — installed by users who want to render.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pup: any;
  try {
    pup = await dynamicImport("puppeteer");
  } catch (err) {
    job.state = "error";
    job.message = `puppeteer import failed: ${(err as Error).message}`;
    job.finishedAt = Date.now();
    jobEvents.emit(`update:${job.id}`, job);
    return;
  }

  const browser = await pup.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      `--window-size=${width},${height}`,
    ],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.goto(renderUrl, { waitUntil: "networkidle0", timeout: 60_000 });
    await page.waitForFunction(
      // The render route sets `__watchPlayer` once mounted.
      "window.__watchPlayer && typeof window.__watchPlayer.seek === 'function'",
      { timeout: 30_000 },
    );

    for (let i = 0; i < totalFrames; i++) {
      const t = i / fps;
      await page.evaluate(
        (tt: number) => {
          const w = window as unknown as {
            __watchPlayer: { seek: (n: number) => void };
          };
          w.__watchPlayer.seek(tt);
        },
        t,
      );
      // Give Chessground's CSS transition + React state time to flush.
      await page.evaluate(
        () =>
          new Promise<void>((r) =>
            requestAnimationFrame(() => requestAnimationFrame(() => r())),
          ),
      );
      const file = path.join(framesDir, `${String(i).padStart(6, "0")}.png`);
      await page.screenshot({ path: file, type: "png" });
      if (i % 30 === 0) {
        const pct = Math.round(20 + (i / totalFrames) * 60);
        job.progress = pct;
        job.message = `Captured ${i}/${totalFrames} frames…`;
        jobEvents.emit(`update:${job.id}`, job);
      }
    }
  } finally {
    await browser.close().catch(() => undefined);
  }

  // 5. Mux with ffmpeg.
  const outputPath = path.join(RENDER_ROOT, `${job.id}.mp4`);
  job.message = "Encoding MP4…";
  job.progress = 85;
  jobEvents.emit(`update:${job.id}`, job);

  await runFfmpeg(framesDir, narrationPath, outputPath, fps);

  // Clean up temp frames; keep the audio file for reproducibility.
  try {
    await fs.rm(path.join(RENDER_ROOT, job.id), { recursive: true, force: true });
  } catch {
    /* leave behind on failure */
  }

  const stat = await fs.stat(outputPath);
  job.state = "done";
  job.outputPath = outputPath;
  job.bytes = stat.size;
  job.durationS = totalS;
  job.progress = 100;
  job.message = "Render complete";
  job.finishedAt = Date.now();
  jobEvents.emit(`update:${job.id}`, job);
}

/* ---------------------------------------------------------------------- */
/* ffmpeg wrapper                                                         */
/* ---------------------------------------------------------------------- */

function runFfmpeg(
  framesDir: string,
  narrationPath: string | null,
  outputPath: string,
  fps: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args: string[] = [
      "-y",
      "-framerate",
      String(fps),
      "-i",
      path.join(framesDir, "%06d.png"),
    ];
    if (narrationPath) {
      args.push("-i", narrationPath);
    }
    args.push(
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-crf",
      "18",
      "-preset",
      "veryfast",
    );
    if (narrationPath) {
      args.push("-c:a", "aac", "-b:a", "192k", "-shortest");
    }
    args.push(outputPath);

    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("error", (err) => reject(err));
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-400)}`));
    });
  });
}

/* ---------------------------------------------------------------------- */
/* Dep check                                                              */
/* ---------------------------------------------------------------------- */

interface DepStatus {
  puppeteer: boolean;
  ffmpeg: boolean;
  puppeteerError?: string;
  ffmpegError?: string;
}

let depCacheAt = 0;
let depCacheValue: DepStatus | null = null;

export async function checkDeps(): Promise<DepStatus> {
  if (depCacheValue && Date.now() - depCacheAt < 30_000) return depCacheValue;
  const status: DepStatus = { puppeteer: false, ffmpeg: false };
  try {
    await dynamicImport("puppeteer");
    status.puppeteer = true;
  } catch (err) {
    status.puppeteerError = (err as Error).message;
  }
  try {
    await runWhich("ffmpeg");
    status.ffmpeg = true;
  } catch (err) {
    status.ffmpegError = (err as Error).message;
  }
  depCacheValue = status;
  depCacheAt = Date.now();
  return status;
}

/**
 * Dynamic-import wrapper that hides the module specifier from TypeScript
 * so missing optional packages (puppeteer) don't fail typecheck. The
 * runtime semantics are identical to `await import(spec)`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function dynamicImport(spec: string): Promise<any> {
  // The `Function` trick prevents TS from resolving the specifier at
  // compile time. We still get a real ESM import at runtime.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const importer = new Function("s", "return import(s)") as (
    s: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) => Promise<any>;
  return importer(spec);
}

function runWhich(binary: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const cmd = process.platform === "win32" ? "where" : "which";
    const proc = spawn(cmd, [binary], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    proc.stdout.on("data", (d) => (out += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0 && out.trim().length > 0) resolve();
      else reject(new Error(`${binary} not found on PATH`));
    });
  });
}

/* ---------------------------------------------------------------------- */
/* Output streaming                                                       */
/* ---------------------------------------------------------------------- */

export async function streamRenderOutput(
  job: RenderJob,
): Promise<{ path: string; size: number } | null> {
  if (job.state !== "done" || !job.outputPath) return null;
  if (!existsSync(job.outputPath)) return null;
  const stat = await fs.stat(job.outputPath);
  return { path: job.outputPath, size: stat.size };
}
