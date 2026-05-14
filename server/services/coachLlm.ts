/**
 * Coach text uses the OpenAI SDK against:
 * - api.openai.com (`OPENAI_API_KEY`)
 * - Groq (`GROQ_API_KEY`)
 * - Local Ollama OpenAI-compatible API — **no API key**; opt out with
 *   `COACH_DISABLE_LOCAL_OLLAMA=true`.
 *
 * `resolveCoachLlmForChat` / `resolveCoachLlmForExplain` both try cloud first,
 * then Ollama. Failed LLM calls fall back to heuristics or template text in
 * `coach.ts` / `coachOfflineReply.ts`.
 *
 * @see https://ollama.com/blog/openai-compatibility
 */
import OpenAI from "openai";

const OPENAI_MODEL_DEFAULT = "gpt-4.1-mini";
const GROQ_MODEL_DEFAULT = "llama-3.1-8b-instant";
const OLLAMA_MODEL_DEFAULT = "llama3.2";

export type CoachLlmKind = "openai" | "groq" | "ollama";

export interface ResolvedCoachLlm {
  kind: CoachLlmKind;
  model: string;
  /** Stored with cached explanations so mixed providers don't collide. */
  modelLabel: string;
  createClient(): OpenAI;
}

/** OpenAI or Groq (no local Ollama). */
export function resolveCloudCoachLlm(): ResolvedCoachLlm | null {
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (openaiKey) {
    const baseURL = process.env.OPENAI_BASE_URL?.trim() || undefined;
    const model = process.env.COACH_OPENAI_MODEL?.trim() || OPENAI_MODEL_DEFAULT;
    return {
      kind: "openai",
      model,
      modelLabel: model,
      createClient() {
        return new OpenAI({ apiKey: openaiKey, baseURL });
      },
    };
  }

  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (groqKey) {
    const model = process.env.COACH_GROQ_MODEL?.trim() || GROQ_MODEL_DEFAULT;
    return {
      kind: "groq",
      model,
      modelLabel: `groq:${model}`,
      createClient() {
        return new OpenAI({
          apiKey: groqKey,
          baseURL: "https://api.groq.com/openai/v1",
        });
      },
    };
  }

  return null;
}

/** Local Ollama — no API key; returns null when disabled. */
export function resolveLocalOllamaCoachLlm(): ResolvedCoachLlm | null {
  if (process.env.COACH_DISABLE_LOCAL_OLLAMA === "true") {
    return null;
  }

  const ollamaBase =
    process.env.OLLAMA_BASE_URL?.trim().replace(/\/$/, "") ||
    "http://127.0.0.1:11434";
  const model = process.env.COACH_OLLAMA_MODEL?.trim() || OLLAMA_MODEL_DEFAULT;
  return {
    kind: "ollama",
    model,
    modelLabel: `ollama:${model}`,
    createClient() {
      // First-token latency on a cold-loaded local model can hit 15-30s
      // on modest hardware. Once Ollama has the weights memory-mapped
      // the next call is sub-second, but the very first chat after a
      // server restart will look hung if we cap the request too tight.
      // SDK enforces an end-to-end timeout, so we give it room.
      const timeoutMs = Math.max(
        15_000,
        Number(process.env.COACH_OLLAMA_TIMEOUT_MS) || 45_000,
      );
      return new OpenAI({
        apiKey: "ollama",
        baseURL: `${ollamaBase}/v1`,
        timeout: timeoutMs,
        maxRetries: 0,
      });
    },
  };
}

/** Streaming coach chat: cloud first, then local Ollama. */
export function resolveCoachLlmForChat(): ResolvedCoachLlm | null {
  return resolveCoachLlmForExplain();
}

/** Puzzle wrong-move + line Q&A: same provider chain as chat. */
export function resolveCoachLlmForExplain(): ResolvedCoachLlm | null {
  return resolveCloudCoachLlm() ?? resolveLocalOllamaCoachLlm();
}
