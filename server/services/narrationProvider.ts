/**
 * Pluggable rewriter for narration captions.
 *
 * The rules-based generator in [narration.ts] always runs and produces
 * a usable script. This module is an optional second pass: a `NarrationProvider`
 * implementation receives the draft script + game metadata and returns
 * a polished version (e.g. rewritten by an LLM in a more natural
 * voice). Providers are picked by `NARRATION_PROVIDER` env or by an
 * explicit `provider` option on the call site.
 *
 * Built-in providers:
 *   - "openai"  — uses `OPENAI_API_KEY` to rewrite via `gpt-4o-mini`.
 *   - "none"    — passthrough (default).
 *
 * Adding a new provider: implement `NarrationProvider`, register it
 * via `registerNarrationProvider("name", instance)` at server boot.
 */

import type { LibraryGame } from "../../shared/schema.js";
import type { NarrationCaption } from "./narration.js";

export interface NarrationPolishContext {
  game: LibraryGame;
  /** ECO/opening pulled from game metadata; pre-extracted for convenience. */
  opening: string | null;
  /** Optional voice / persona hint for prompt tuning. */
  persona?: string;
}

export interface NarrationProvider {
  readonly id: string;
  /** Rewrite the draft captions; must return the SAME ordered array. */
  polish(
    captions: NarrationCaption[],
    ctx: NarrationPolishContext,
  ): Promise<NarrationCaption[]>;
}

/* ---------------------------------------------------------------------- */
/* Registry                                                               */
/* ---------------------------------------------------------------------- */

const providers = new Map<string, NarrationProvider>();

export function registerNarrationProvider(p: NarrationProvider): void {
  providers.set(p.id, p);
}

export function resolveNarrationProvider(
  explicit?: string,
): NarrationProvider | null {
  const id = (explicit ?? process.env.NARRATION_PROVIDER ?? "").toLowerCase();
  if (!id || id === "none") return null;
  if (providers.has(id)) return providers.get(id)!;
  if (id === "openai") {
    if (!process.env.OPENAI_API_KEY) return null;
    return openAiProvider;
  }
  return null;
}

/* ---------------------------------------------------------------------- */
/* OpenAI provider (built-in)                                             */
/* ---------------------------------------------------------------------- */

const openAiProvider: NarrationProvider = {
  id: "openai",
  async polish(captions, ctx) {
    let OpenAIClient: typeof import("openai").default;
    try {
      OpenAIClient = (await import("openai")).default;
    } catch {
      return captions;
    }
    const client = new OpenAIClient({ apiKey: process.env.OPENAI_API_KEY });

    const draft = captions
      .map((c) => `[${c.ply}|${c.kind ?? "info"}] ${c.text}`)
      .join("\n");
    const sys = [
      "You are rewriting a chess commentary draft for a YouTube-style narration video.",
      "Keep each line to one or two short sentences (under 18 words).",
      "Preserve the [ply|kind] prefix on each line.",
      "Never change the line count or order.",
      "Voice: warm, knowledgeable, neutral.",
      ctx.persona ? `Persona: ${ctx.persona}` : "",
    ]
      .filter(Boolean)
      .join(" ");
    const user = [
      `Game: ${ctx.game.whitePlayer ?? "?"} vs ${ctx.game.blackPlayer ?? "?"}` +
        ` (${ctx.opening ?? "—"}).`,
      "Rewrite each line for natural delivery, preserving the prefix tag.",
      "",
      draft,
    ].join("\n");

    const resp = await client.chat.completions.create({
      model: process.env.NARRATION_MODEL ?? "gpt-4o-mini",
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
      temperature: 0.5,
      max_tokens: 1200,
    });

    const text = resp.choices[0]?.message?.content?.trim() ?? "";
    if (!text) return captions;
    const out: NarrationCaption[] = [];
    const lines = text.split(/\r?\n/).filter(Boolean);
    for (let i = 0; i < captions.length; i++) {
      const original = captions[i];
      const rewritten = lines[i];
      if (!rewritten) {
        out.push(original);
        continue;
      }
      const stripped = rewritten.replace(/^\[\d+\|[a-z]+\]\s*/, "").trim();
      out.push({ ...original, text: stripped || original.text });
    }
    return out;
  },
};
