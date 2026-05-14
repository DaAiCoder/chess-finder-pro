/**
 * AI coach feedback service.
 *
 * Takes a wrong puzzle attempt and produces a 1-2 sentence rationale.
 * Cached by sha1(fen|userMove|correctMove) so repeated wrongs are free.
 * Falls back to a templated heuristic when no LLM is available or the call
 * fails (cloud keys, Groq, or local Ollama — see `coachLlm.ts`).
 */

import { createHash } from "node:crypto";
import { Chess } from "chess.js";
import { storage } from "../storage.js";
import {
  type ResolvedCoachLlm,
  resolveCoachLlmForExplain,
} from "./coachLlm.js";

export interface CoachInput {
  fen: string;
  userMove: string;
  correctMove?: string | null;
  motif?: string | null;
}

export interface CoachOutput {
  text: string;
  cached: boolean;
  model: string;
}

/** Main entry point used by both `/api/coach/explain` and the line Q&A. */
export async function explainMistake(input: CoachInput): Promise<CoachOutput> {
  const cacheKey = createHash("sha1")
    .update(`${input.fen}|${input.userMove}|${input.correctMove ?? ""}`)
    .digest("hex");
  const cached = await storage.getCoachExplanation(cacheKey);
  if (cached) return { text: cached.text, cached: true, model: cached.model };

  const llm = resolveCoachLlmForExplain();
  const text = llm
    ? await generateWithCoachLlm(llm, input).catch(() => fallbackHeuristic(input))
    : fallbackHeuristic(input);

  await storage.upsertCoachExplanation({
    cacheKey,
    fen: input.fen,
    userMove: input.userMove,
    correctMove: input.correctMove ?? null,
    motif: input.motif ?? null,
    text,
    model: llm ? llm.modelLabel : "heuristic",
  });
  return {
    text,
    cached: false,
    model: llm ? llm.modelLabel : "heuristic",
  };
}

async function generateWithCoachLlm(llm: ResolvedCoachLlm, input: CoachInput): Promise<string> {
  const c = llm.createClient();
  const prompt = buildPrompt(input);
  const resp = await c.chat.completions.create({
    model: llm.model,
    temperature: 0.3,
    max_tokens: 120,
    messages: [
      {
        role: "system",
        content:
          "You are a concise chess coach. Reply in 1-2 sentences, no preamble. Mention the specific tactical idea by name.",
      },
      { role: "user", content: prompt },
    ],
  });
  const text = resp.choices[0]?.message?.content?.trim();
  return text && text.length > 0 ? text : fallbackHeuristic(input);
}

function buildPrompt(input: CoachInput): string {
  const motifLine = input.motif ? `Tactical theme: ${input.motif}.\n` : "";
  return (
    `Position FEN: ${input.fen}\n` +
    `${motifLine}` +
    `The student played: ${input.userMove}\n` +
    (input.correctMove ? `Best move was: ${input.correctMove}\n` : "") +
    `In one or two short sentences, explain WHY the student's move was wrong and what idea they missed.`
  );
}

/**
 * No-OpenAI fallback. Best-effort heuristic from `chess.js` analysis of
 * the position before/after the wrong move — enough to give the user
 * something better than silence.
 */
function fallbackHeuristic(input: CoachInput): string {
  try {
    const c = new Chess(input.fen);
    const sideToMove = c.turn() === "w" ? "White" : "Black";
    let what = `The played move (${input.userMove}) wasn't the strongest`;
    if (input.correctMove) {
      what += `; the right idea was ${input.correctMove}`;
    }
    const motifLine = input.motif
      ? ` Look again for a ${input.motif.replace(/-/g, " ")}.`
      : "";
    return `${what}. ${sideToMove} had a tactical chance here.${motifLine}`.trim();
  } catch {
    return `That move missed the point of the position. Try to identify the tactical theme before moving.`;
  }
}

/**
 * Plain Q&A about a specific discovered line (Phase 2.2 "follow-up
 * Q&A" pill under Pattern Finder lines).
 */
export async function explainLine(args: {
  fen: string;
  moves: string[];
  openingName?: string;
  question: string;
}): Promise<string> {
  const llm = resolveCoachLlmForExplain();
  const fallback =
    `This line plays ${args.moves.slice(0, 12).join(" ")}; ` +
    `the engine likes the resulting position based on its leaf evaluation.`;
  if (!llm) {
    return `(No coach model — set cloud keys or run local Ollama.) ${fallback}`;
  }
  try {
    const c = llm.createClient();
    const resp = await c.chat.completions.create({
      model: llm.model,
      temperature: 0.3,
      max_tokens: 220,
      messages: [
        {
          role: "system",
          content:
            "You are a chess coach. Answer chess questions in 2-3 short paragraphs maximum.",
        },
        {
          role: "user",
          content:
            (args.openingName ? `Opening: ${args.openingName}\n` : "") +
            `Moves played: ${args.moves.join(" ")}\n` +
            `Final FEN: ${args.fen}\n\n` +
            `Question: ${args.question}`,
        },
      ],
    });
    return resp.choices[0]?.message?.content?.trim() ?? fallback;
  } catch {
    if (llm.kind === "ollama") {
      return `(Local Ollama unreachable — start Ollama or add a cloud key.) ${fallback}`;
    }
    throw new Error("coach line explain failed");
  }
}
