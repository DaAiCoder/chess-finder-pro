/**
 * Streaming coach chat — async iterator of text deltas for SSE.
 */
import { resolveCoachLlmForChat } from "./coachLlm.js";
import { iterOfflineCoachReply } from "./coachOfflineReply.js";
import { iterPlayCoachReply } from "./coachPlayEngine.js";
import { computeWeaknesses } from "./weaknessProfile.js";

export async function* iterCoachReply(params: {
  userId: number;
  userMessage: string;
  fen?: string;
  targetSan?: string | null;
  context?: "play" | "chat";
  playerColor?: "white" | "black";
}): AsyncGenerator<string, void, void> {
  const play = params.context === "play";
  if (play) {
    yield* iterPlayCoachReply({
      userMessage: params.userMessage,
      fen: params.fen,
      targetSan: params.targetSan,
      playerColor: params.playerColor,
    });
    return;
  }

  const weak = await computeWeaknesses(params.userId).catch(() => null);
  const sys = [
    "You are a friendly chess coach for ChessFinderPro.",
    "Reply in at most 2 short sentences (under 70 words). No bullet lists.",
    "When suggesting practice, one markdown link is enough: [Tactics](/training/tactics) or [360 trainer](/training/360).",
    params.fen ? `Current FEN (if relevant): ${params.fen}` : "",
    weak ? `Known weakness summary JSON: ${JSON.stringify(weak).slice(0, 2000)}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const llm = resolveCoachLlmForChat();
  if (!llm) {
    yield* iterOfflineCoachReply({
      userMessage: params.userMessage,
      fen: params.fen,
      weak,
      targetSan: params.targetSan,
      context: "default",
      playerColor: params.playerColor,
    });
    return;
  }

  const client = llm.createClient();
  try {
    const stream = await client.chat.completions.create({
      model: llm.model,
      temperature: 0.35,
      max_tokens: llm.kind === "ollama" ? 260 : 420,
      stream: true,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: params.userMessage },
      ],
    });

    for await (const chunk of stream) {
      const t = chunk.choices[0]?.delta?.content ?? "";
      if (t) {
        yield t;
      }
    }
  } catch (err) {
    if (llm.kind === "ollama") {
      yield* iterOfflineCoachReply({
        userMessage: params.userMessage,
        fen: params.fen,
        weak,
        targetSan: params.targetSan,
        context: "default",
        playerColor: params.playerColor,
      });
      return;
    }
    throw err;
  }
}
