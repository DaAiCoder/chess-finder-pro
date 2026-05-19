/** New coach stack (Ollama / offline / Groq) marks SSE with this header. */
export const EXPECTED_COACH_API = "2";

export function coachStreamHeadersOk(res: Response): boolean {
  return res.headers.get("X-CFP-Coach-Api") === EXPECTED_COACH_API;
}

/** Shown when the browser reached an old Node process that predates the coach rewrite. */
export const STALE_COACH_SERVER_MSG =
  "Your browser is still talking to an **old ChessGM server** (missing `X-CFP-Coach-Api: 2`).\n\n" +
  "1) Stop **every** `npm run dev` / `node` for this app (all terminals).\n" +
  "2) In Task Manager, end stray **Node.js** processes if port 5000 stays busy.\n" +
  "3) In this project folder run: `npm run dev`\n" +
  "4) Hard refresh: **Ctrl+Shift+R**\n\n" +
  "Ollama needs **no API keys**; the new server uses it automatically when it is running.";

/** Parse a trailing `data: {...}` line when the stream ended without a final blank line. */
export function sseTailDelta(buf: string): string {
  const tail = buf.trim();
  if (!tail.startsWith("data:")) return "";
  try {
    const obj = JSON.parse(tail.replace(/^data:\s*/, "")) as { delta?: string };
    return typeof obj.delta === "string" ? obj.delta : "";
  } catch {
    return "";
  }
}
