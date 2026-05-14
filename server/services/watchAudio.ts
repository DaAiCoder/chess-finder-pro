/**
 * Pre-render watch narration to MP3 (edge-tts) and attach URLs + durations.
 */

import { promises as fs, existsSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import type { NarrationCaption } from "./narration.js";

const CACHE_DIR = path.resolve(
  process.env.WATCH_AUDIO_CACHE_DIR ?? path.join(process.cwd(), "data", "cache", "watch-audio"),
);

export type WatchVoiceId = "aria" | "guy" | "ryan";

const VOICE_MAP: Record<WatchVoiceId, string> = {
  aria: "en-US-AriaNeural",
  guy: "en-US-GuyNeural",
  ryan: "en-GB-RyanNeural",
};

export function resolveEdgeVoice(voice?: string): string {
  if (!voice) return process.env.WATCH_TTS_VOICE ?? VOICE_MAP.aria;
  const v = voice.toLowerCase();
  if (v === "aria" || v === "guy" || v === "ryan") return VOICE_MAP[v as WatchVoiceId];
  return voice;
}

export function hashCaption(text: string, voice: string): string {
  const h = crypto.createHash("sha1");
  h.update("edge|");
  h.update(voice);
  h.update("|");
  h.update(text);
  return h.digest("hex").slice(0, 24);
}

function estimateSpeechSeconds(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(0.6, words / 2.8);
}

async function tryFfprobeDuration(mp3Path: string): Promise<number | null> {
  return new Promise((resolve) => {
    const proc = spawn(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        mp3Path,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let out = "";
    proc.stdout?.on("data", (d) => (out += d.toString()));
    proc.on("error", () => resolve(null));
    proc.on("close", (code) => {
      if (code !== 0) return resolve(null);
      const n = Number(out.trim());
      resolve(Number.isFinite(n) && n > 0 ? n : null);
    });
  });
}

async function synthEdgeMp3(text: string, voice: string, outPath: string): Promise<void> {
  const { ttsSave } = await import("edge-tts");
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await ttsSave(text.trim(), outPath, { voice });
}

/**
 * Synthesize MP3 for each caption; stretch timeline when audio exceeds slot.
 * Original caption times are preserved as baseline; cumulative slack is inserted.
 */
export async function prerenderWatchCaptions(
  captions: NarrationCaption[],
  voiceHint?: string,
): Promise<NarrationCaption[]> {
  const voice = resolveEdgeVoice(voiceHint);
  await fs.mkdir(CACHE_DIR, { recursive: true });

  const sorted = [...captions].sort((a, b) => a.tStart - b.tStart || a.tEnd - b.tEnd);
  const orig = sorted.map((c) => ({ tStart: c.tStart, tEnd: c.tEnd }));
  const out: NarrationCaption[] = sorted.map((c) => ({ ...c }));
  let acc = 0;

  for (let i = 0; i < out.length; i++) {
    const cap = out[i]!;
    const o = orig[i]!;
    const text = cap.text.trim();
    const slot = o.tEnd - o.tStart;
    const tStart = o.tStart + acc;

    if (!text) {
      cap.tStart = tStart;
      cap.tEnd = tStart + slot;
      continue;
    }

    const hash = hashCaption(text, voice);
    const filePath = path.join(CACHE_DIR, `${hash}.mp3`);
    if (!existsSync(filePath)) {
      try {
        await synthEdgeMp3(text, voice, filePath);
      } catch (e) {
        console.warn("[watchAudio] edge-tts failed:", (e as Error).message);
        cap.tStart = tStart;
        cap.tEnd = tStart + slot;
        cap.audioUrl = undefined;
        cap.audioHash = undefined;
        cap.audioDurationS = undefined;
        continue;
      }
    }

    let dur = await tryFfprobeDuration(filePath);
    if (dur == null) dur = estimateSpeechSeconds(text);

    const needed = Math.max(slot, dur + 0.12);
    const extra = needed - slot;
    acc += extra;

    cap.tStart = tStart;
    cap.tEnd = tStart + needed;
    cap.audioHash = hash;
    cap.audioUrl = `/api/watch/audio/${hash}.mp3`;
    cap.audioDurationS = dur;
  }

  return out;
}

export function audioFilePathForHash(hash: string): string {
  return path.join(CACHE_DIR, `${hash}.mp3`);
}

function escapeFfmpegPath(p: string): string {
  return p.replace(/'/g, "'\\''");
}

/**
 * Concatenate pre-rendered caption MP3s in timeline order (for MP4 mux).
 */
export async function concatCaptionMp3sToSingleFile(
  captions: NarrationCaption[],
): Promise<string | null> {
  const sorted = [...captions]
    .filter((c) => c.audioHash && existsSync(audioFilePathForHash(c.audioHash)))
    .sort((a, b) => a.tStart - b.tStart || a.tEnd - b.tEnd);
  if (sorted.length === 0) return null;

  const listPath = path.join(CACHE_DIR, `concat-list-${Date.now()}.txt`);
  const outPath = path.join(CACHE_DIR, `full-narr-${Date.now()}.mp3`);
  const lines = sorted.map(
    (c) => `file '${escapeFfmpegPath(audioFilePathForHash(c.audioHash!))}'`,
  );
  await fs.writeFile(listPath, lines.join("\n"));

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(
      "ffmpeg",
      ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", outPath],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg concat mp3 ${code}: ${stderr.slice(-300)}`));
    });
  });

  return outPath;
}
