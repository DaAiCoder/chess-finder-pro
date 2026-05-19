/**
 * Streaming support assistant (product help, not chess coaching).
 */
import { SUPPORT_KNOWLEDGE } from "../data/supportKnowledge.js";
import { resolveCloudCoachLlm } from "./coachLlm.js";
import { iterOfflineSupportReply, offlineSupportReply } from "./supportOfflineReply.js";

export type SupportChatTurn = { role: "user" | "assistant"; content: string };

export async function* iterSupportReply(params: {
  userMessage: string;
  history?: SupportChatTurn[];
  page?: string;
  signedIn?: boolean;
  hasPro?: boolean;
}): AsyncGenerator<string, void, void> {
  const quick = offlineSupportReply(params.userMessage);
  const llm = process.env.SUPPORT_DISABLE_LLM === "1" ? null : resolveCloudCoachLlm();

  if (!llm) {
    yield* iterOfflineSupportReply(params.userMessage);
    return;
  }

  const contextLines = [
    params.page ? `Current page: ${params.page}` : "",
    params.signedIn != null ? `Signed in: ${params.signedIn ? "yes" : "no"}` : "",
    params.hasPro != null ? `Pro access: ${params.hasPro ? "yes" : "no"}` : "",
    quick ? `FAQ hint (may use): ${quick}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const sys = [
    "You are the ChessGM **customer support** assistant (like Render's docs helper).",
    "Answer questions about accounts, billing, trials, sign-in, refunds, and using the app.",
    "Do NOT give chess opening advice or analyze positions — redirect chess questions to [Ask Tal coach](/coach).",
    "Be concise: 2-4 short paragraphs max. Use markdown links [label](/path) for in-app pages.",
    "If unsure or the user needs a human (refunds outside policy, bugs, GDPR, security), link [/legal/contact](/legal/contact).",
    "Never invent prices — use the knowledge below.",
    "",
    SUPPORT_KNOWLEDGE,
    contextLines ? `\n## Session context\n${contextLines}` : "",
  ].join("\n");

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: sys },
  ];
  const hist = (params.history ?? []).slice(-8);
  for (const t of hist) {
    messages.push({ role: t.role, content: t.content.slice(0, 4000) });
  }
  messages.push({ role: "user", content: params.userMessage.slice(0, 4000) });

  const model =
    process.env.SUPPORT_OPENAI_MODEL?.trim() ||
    process.env.COACH_OPENAI_MODEL?.trim() ||
    llm.model;

  const client = llm.createClient();
  try {
    const stream = await client.chat.completions.create({
      model,
      temperature: 0.2,
      max_tokens: 500,
      stream: true,
      messages,
    });
    for await (const chunk of stream) {
      const t = chunk.choices[0]?.delta?.content ?? "";
      if (t) yield t;
    }
  } catch {
    yield* iterOfflineSupportReply(params.userMessage);
  }
}
