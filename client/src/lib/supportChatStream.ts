/** SSE helpers for the public support chat widget. */
export const EXPECTED_SUPPORT_API = "1";

export function supportStreamHeadersOk(res: Response): boolean {
  return res.headers.get("X-CFP-Support-Api") === EXPECTED_SUPPORT_API;
}

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

export type SupportMessage = { role: "user" | "assistant"; content: string };

export async function streamSupportChat(args: {
  message: string;
  history: SupportMessage[];
  page?: string;
  signedIn?: boolean;
  hasPro?: boolean;
  onDelta: (text: string) => void;
}): Promise<void> {
  const res = await fetch("/api/support/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: args.message,
      history: args.history.slice(-10),
      page: args.page,
      signedIn: args.signedIn,
      hasPro: args.hasPro,
    }),
  });

  if (!supportStreamHeadersOk(res)) {
    throw new Error("Support chat unavailable — try again after the site redeploys.");
  }
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Request failed (${res.status})`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const dec = new TextDecoder();
  let buf = "";
  let acc = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const blocks = buf.split("\n\n");
    buf = blocks.pop() ?? "";
    for (const block of blocks) {
      const line = block.trim();
      if (!line.startsWith("data:")) continue;
      const json = line.replace(/^data:\s*/, "");
      try {
        const obj = JSON.parse(json) as { delta?: string; done?: boolean; error?: string };
        if (obj.error) throw new Error(obj.error);
        if (obj.delta) {
          acc += obj.delta;
          args.onDelta(acc);
        }
      } catch (e) {
        if (e instanceof Error && e.message !== "Unexpected end of JSON input") throw e;
      }
    }
  }
  acc += sseTailDelta(buf);
  if (acc) args.onDelta(acc);
}
