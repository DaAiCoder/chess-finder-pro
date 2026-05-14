/**
 * TTS provider abstraction for the MP4 render pipeline.
 *
 * Pluggable providers, picked from env on first use:
 *   - `piper`     — offline, free. Requires the `piper` binary on PATH
 *                   and a `.onnx` voice model in `server/data/voices/`.
 *                   This is the default for studio renders because it
 *                   sounds clean and has no per-render cost.
 *   - `openai`    — paid premium voice (gpt-4o-mini-tts). Requires
 *                   `OPENAI_API_KEY`.
 *   - `elevenlabs`— paid premium voice. Requires `ELEVENLABS_API_KEY`.
 *   - `silent`    — fallback when nothing else is configured. Returns
 *                   timing-correct silent WAVs so the renderer still
 *                   produces a watchable file (just no audio).
 *
 * Each caption is synthesized once and cached on disk by hash of
 * `(text, voice, provider)` so re-renders of the same script are
 * instantaneous.
 */

import { promises as fs, existsSync, readdirSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import crypto from "node:crypto";
import type { NarrationCaption } from "./narration.js";

const CACHE_ROOT = path.resolve(
  process.env.TTS_CACHE_DIR ?? path.join(process.cwd(), "data", "cache", "tts"),
);
const VOICES_DIR = path.resolve(
  process.env.PIPER_VOICES_DIR ?? path.join(process.cwd(), "server", "data", "voices"),
);

export type TtsProviderId = "piper" | "openai" | "elevenlabs" | "silent";

export interface TtsOptions {
  /** Explicit provider — overrides env. */
  provider?: TtsProviderId;
  /** Voice id understood by the provider. */
  voice?: string;
  /** Speech rate multiplier (1.0 = normal). */
  rate?: number;
}

export interface SynthResult {
  /** Path to the .wav file on disk. */
  wavPath: string;
  /** Duration in seconds. */
  durationS: number;
}

/* ---------------------------------------------------------------------- */
/* Public API                                                             */
/* ---------------------------------------------------------------------- */

/**
 * Convert a Caption[] track into a single concatenated narration .wav.
 *
 * Silence is inserted between captions so each utterance starts at its
 * `tStart` second in the final audio.
 */
export async function synthesizeNarration(
  captions: NarrationCaption[],
  options: TtsOptions = {},
): Promise<string> {
  const provider = pickProvider(options.provider);
  await fs.mkdir(CACHE_ROOT, { recursive: true });

  // Synthesize each caption to its own .wav.
  const segments: { tStart: number; wavPath: string; durationS: number }[] = [];
  for (const cap of captions) {
    if (!cap.text.trim()) continue;
    const seg = await synth(provider, cap.text.trim(), options);
    segments.push({ tStart: cap.tStart, ...seg });
  }
  if (segments.length === 0) {
    return synthSilence(captions.length ? lastEnd(captions) : 1).then((r) => r.wavPath);
  }

  // Build a concat list with intermediary silences for the gaps.
  const concatList = path.join(CACHE_ROOT, `concat-${Date.now()}.txt`);
  const lines: string[] = [];
  let cursor = 0;
  for (const seg of segments) {
    const gap = Math.max(0, seg.tStart - cursor);
    if (gap > 0.05) {
      const silence = await synthSilence(gap);
      lines.push(`file '${escapeFfmpegPath(silence.wavPath)}'`);
    }
    lines.push(`file '${escapeFfmpegPath(seg.wavPath)}'`);
    cursor = seg.tStart + seg.durationS;
  }
  await fs.writeFile(concatList, lines.join("\n"));

  const outPath = path.join(CACHE_ROOT, `track-${Date.now()}.wav`);
  await ffmpegConcat(concatList, outPath);
  return outPath;
}

/* ---------------------------------------------------------------------- */
/* Providers                                                              */
/* ---------------------------------------------------------------------- */

function pickProvider(explicit?: TtsProviderId): TtsProviderId {
  if (explicit) return explicit;
  // Explicit env override takes precedence.
  if (process.env.TTS_PROVIDER === "openai" && process.env.OPENAI_API_KEY)
    return "openai";
  if (process.env.TTS_PROVIDER === "elevenlabs" && process.env.ELEVENLABS_API_KEY)
    return "elevenlabs";
  if (process.env.TTS_PROVIDER === "piper" && piperVoiceAvailable())
    return "piper";
  if (process.env.TTS_PROVIDER === "silent") return "silent";

  // Auto-pick the most natural voice we have credentials for. ElevenLabs
  // > OpenAI > Piper > silent. We prefer cloud voices over Piper because
  // narration quality is materially better for the Watch product.
  if (process.env.ELEVENLABS_API_KEY) return "elevenlabs";
  if (process.env.OPENAI_API_KEY) return "openai";
  if (piperVoiceAvailable()) return "piper";
  return "silent";
}

function piperVoiceAvailable(): boolean {
  if (!existsSync(VOICES_DIR)) return false;
  try {
    return readdirSync(VOICES_DIR).some((f) => f.endsWith(".onnx"));
  } catch {
    return false;
  }
}

async function synth(
  provider: TtsProviderId,
  text: string,
  opts: TtsOptions,
): Promise<{ wavPath: string; durationS: number }> {
  const cacheKey = hashKey(provider, text, opts);
  const cachePath = path.join(CACHE_ROOT, `${cacheKey}.wav`);
  if (existsSync(cachePath)) {
    const duration = await wavDuration(cachePath);
    return { wavPath: cachePath, durationS: duration };
  }
  let outPath: string;
  switch (provider) {
    case "piper":
      outPath = await synthPiper(text, cachePath, opts);
      break;
    case "openai":
      outPath = await synthOpenAi(text, cachePath, opts);
      break;
    case "elevenlabs":
      outPath = await synthElevenLabs(text, cachePath, opts);
      break;
    case "silent":
    default: {
      const r = await synthSilence(estimateDuration(text), cachePath);
      return r;
    }
  }
  const dur = await wavDuration(outPath);
  return { wavPath: outPath, durationS: dur };
}

async function synthPiper(text: string, outPath: string, opts: TtsOptions): Promise<string> {
  // pick voice model
  const voiceFile = await resolvePiperVoice(opts.voice);
  if (!voiceFile) {
    throw new Error(
      `No piper voice (.onnx) found in ${VOICES_DIR}. Download one e.g. from https://rhasspy.github.io/piper-samples and place it there.`,
    );
  }
  const args = ["--model", voiceFile, "--output_file", outPath];
  return new Promise((resolve, reject) => {
    const proc = spawn("piper", args, { stdio: ["pipe", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve(outPath);
      else reject(new Error(`piper exited ${code}: ${stderr.slice(-200)}`));
    });
    proc.stdin.write(text);
    proc.stdin.end();
  });
}

async function resolvePiperVoice(preferred?: string): Promise<string | null> {
  if (preferred && existsSync(preferred)) return preferred;
  try {
    const items = await fs.readdir(VOICES_DIR);
    const onnx = items.find((f) => f.endsWith(".onnx"));
    return onnx ? path.join(VOICES_DIR, onnx) : null;
  } catch {
    return null;
  }
}

async function synthOpenAi(
  text: string,
  outPath: string,
  opts: TtsOptions,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");
  const voice = opts.voice ?? process.env.OPENAI_TTS_VOICE ?? "alloy";
  const model = process.env.OPENAI_TTS_MODEL ?? "gpt-4o-mini-tts";
  const resp = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, voice, input: text, response_format: "wav" }),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`OpenAI TTS ${resp.status}: ${body.slice(0, 200)}`);
  }
  const buf = Buffer.from(await resp.arrayBuffer());
  await fs.writeFile(outPath, buf);
  return outPath;
}

async function synthElevenLabs(
  text: string,
  outPath: string,
  opts: TtsOptions,
): Promise<string> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY not set");
  const voiceId = opts.voice ?? process.env.ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM";
  const resp = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=pcm_22050`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    },
  );
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`ElevenLabs TTS ${resp.status}: ${body.slice(0, 200)}`);
  }
  // ElevenLabs returns raw PCM; wrap as WAV.
  const pcm = Buffer.from(await resp.arrayBuffer());
  const wav = pcmToWav(pcm, 22050, 1, 16);
  await fs.writeFile(outPath, wav);
  return outPath;
}

async function synthSilence(
  durationS: number,
  outPath?: string,
): Promise<SynthResult> {
  const dur = Math.max(0.05, durationS);
  const target =
    outPath ??
    path.join(CACHE_ROOT, `silence-${dur.toFixed(2).replace(".", "_")}.wav`);
  if (existsSync(target)) return { wavPath: target, durationS: dur };
  // 22.05 kHz mono 16-bit PCM silence.
  const sampleRate = 22050;
  const samples = Math.round(dur * sampleRate);
  const wav = pcmToWav(Buffer.alloc(samples * 2), sampleRate, 1, 16);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, wav);
  return { wavPath: target, durationS: dur };
}

/* ---------------------------------------------------------------------- */
/* Helpers                                                                */
/* ---------------------------------------------------------------------- */

function ffmpegConcat(listPath: string, outPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-c",
      "copy",
      outPath,
    ];
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg concat exited ${code}: ${stderr.slice(-400)}`));
    });
  });
}

function escapeFfmpegPath(p: string): string {
  return p.replace(/'/g, "'\\''");
}

function hashKey(provider: string, text: string, opts: TtsOptions): string {
  const h = crypto.createHash("sha1");
  h.update(provider);
  h.update("|");
  h.update(opts.voice ?? "");
  h.update("|");
  h.update(String(opts.rate ?? 1));
  h.update("|");
  h.update(text);
  return h.digest("hex").slice(0, 24);
}

function estimateDuration(text: string): number {
  // ~3 words / second is a comfy narration pace.
  const words = text.trim().split(/\s+/).length;
  return Math.max(0.7, words / 3);
}

function lastEnd(captions: NarrationCaption[]): number {
  let m = 0;
  for (const c of captions) m = Math.max(m, c.tEnd);
  return m;
}

async function wavDuration(p: string): Promise<number> {
  // We rely on a simple RIFF header parse to avoid pulling ffprobe.
  try {
    const fh = await fs.open(p, "r");
    try {
      const buf = Buffer.alloc(44);
      await fh.read(buf, 0, 44, 0);
      const byteRate = buf.readUInt32LE(28);
      const dataSize = buf.readUInt32LE(40);
      if (byteRate <= 0) return 1;
      return dataSize / byteRate;
    } finally {
      await fh.close();
    }
  } catch {
    return 1;
  }
}

function pcmToWav(
  pcm: Buffer,
  sampleRate: number,
  channels: number,
  bitsPerSample: number,
): Buffer {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const dataSize = pcm.length;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcm]);
}
