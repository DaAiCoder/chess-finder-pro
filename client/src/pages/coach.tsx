import * as React from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Plus, Send, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { api } from "@/lib/queryClient";
import {
  coachStreamHeadersOk,
  sseTailDelta,
  STALE_COACH_SERVER_MSG,
} from "@/lib/coachReplyNormalize";
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ConversationListItem {
  id: number;
  title: string;
  createdAt: string;
  updatedAt: string;
  preview: string;
}

interface FullConversation {
  id: number;
  title: string;
  messages: ChatMessage[];
}

/* Renders a markdown-ish snippet, preserving newlines and turning
 * `[label](/path)` into in-app links so the coach can deep-link to
 * drills like [Tactics](/training/tactics). */
function renderRichText(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const re = /\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const label = m[1]!;
    const href = m[2]!;
    if (href.startsWith("/")) {
      parts.push(
        <Link
          key={key++}
          href={href}
          className="text-emerald-400 underline decoration-dotted hover:text-emerald-300"
        >
          {label}
        </Link>,
      );
    } else {
      parts.push(
        <a
          key={key++}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-emerald-400 underline decoration-dotted hover:text-emerald-300"
        >
          {label}
        </a>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

const SUGGESTIONS = [
  "How do I beat the Caro-Kann?",
  "What should I work on this week?",
  "Show me a knight fork drill.",
  "How do I convert a queen-up endgame?",
  "Explain my last mistake in plain English.",
];

export default function CoachPage() {
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const [input, setInput] = React.useState("");
  const [convId, setConvId] = React.useState<number | null>(null);
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = React.useState(false);
  const scrollerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!search) return;
    const params = new URLSearchParams(search);
    const q = params.get("q")?.trim();
    if (!q) return;
    setInput(q);
    setLocation("/coach", { replace: true });
  }, [search, setLocation]);

  const conversations = useQuery<ConversationListItem[]>({
    queryKey: ["coach", "conversations"],
    queryFn: () => api("/api/coach/conversations"),
    staleTime: 10_000,
  });

  React.useEffect(() => {
    if (!convId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    api<FullConversation>(`/api/coach/conversations/${convId}`)
      .then((c) => {
        if (!cancelled) setMessages(c.messages ?? []);
      })
      .catch(() => {
        /* new conversation — will be created on first send */
      });
    return () => {
      cancelled = true;
    };
  }, [convId]);

  React.useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streaming]);

  const send = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || streaming) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }, { role: "assistant", content: "" }]);
    setStreaming(true);
    try {
      const res = await fetch("/api/coach/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          conversationId: convId ?? undefined,
        }),
      });
      if (!coachStreamHeadersOk(res)) {
        setMessages((m) => {
          const next = [...m];
          next[next.length - 1] = { role: "assistant", content: STALE_COACH_SERVER_MSG };
          return next;
        });
        return;
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");
      const dec = new TextDecoder();
      let buf = "";
      let acc = "";
      let newConvId: number | null = null;
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
            const obj = JSON.parse(json) as {
              delta?: string;
              done?: boolean;
              error?: string;
              conversationId?: number;
            };
            if (obj.conversationId && newConvId == null) {
              newConvId = obj.conversationId;
            }
            if (obj.error) throw new Error(obj.error);
            if (obj.delta) {
              acc += obj.delta;
              setMessages((m) => {
                const next = [...m];
                next[next.length - 1] = { role: "assistant", content: acc };
                return next;
              });
            }
          } catch {
            /* ignore parse noise */
          }
        }
      }
      acc += sseTailDelta(buf);
      setMessages((m) => {
        const next = [...m];
        next[next.length - 1] = { role: "assistant", content: acc };
        return next;
      });
      if (newConvId && convId !== newConvId) setConvId(newConvId);
      qc.invalidateQueries({ queryKey: ["coach", "conversations"] });
    } catch (e) {
      setMessages((m) => {
        const next = [...m];
        next[next.length - 1] = {
          role: "assistant",
          content: `Sorry — ${(e as Error).message}`,
        };
        return next;
      });
    } finally {
      setStreaming(false);
    }
  };

  return (
    <div className="h-[calc(100vh-3.5rem)] flex bg-background">
      <aside className="hidden lg:flex flex-col w-64 border-r border-border bg-card/40">
        <div className="p-3 border-b border-border flex items-center justify-between">
          <div className="font-semibold text-sm flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-emerald-400" /> Ask Tal
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setConvId(null);
              setMessages([]);
            }}
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> New
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1 text-sm">
          {(conversations.data ?? []).map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setConvId(c.id)}
              className={`w-full text-left rounded-md px-3 py-2 hover:bg-secondary/60 ${
                convId === c.id ? "bg-secondary/80" : ""
              }`}
            >
              <div className="font-medium truncate">{c.title || "Untitled"}</div>
              {c.preview && (
                <div className="text-xs text-muted-foreground truncate mt-0.5">
                  {c.preview}
                </div>
              )}
            </button>
          ))}
          {!conversations.isLoading && (conversations.data ?? []).length === 0 && (
            <div className="text-xs text-muted-foreground p-3">
              No conversations yet. Ask anything to start.
            </div>
          )}
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <div className="p-3 border-b border-border flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-emerald-400" />
          <div className="font-semibold text-sm">Ask Tal</div>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/training">
              <Button variant="outline" size="sm">
                Training hub
              </Button>
            </Link>
          </div>
        </div>

        <div ref={scrollerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && !streaming && (
            <div className="max-w-2xl mx-auto space-y-3">
              <Card>
                <CardContent className="p-4 text-sm space-y-2">
                  <div className="font-semibold">Hi — ask Tal anything chess.</div>
                  <div className="text-muted-foreground">
                    Openings, endgames, or your last game — I can link you straight
                    to a drill that fixes a specific weakness.
                  </div>
                </CardContent>
              </Card>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="text-left rounded-md border border-border bg-card/60 hover:bg-secondary/60 px-3 py-2 text-sm transition"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-3xl mx-auto flex ${
                m.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`rounded-lg px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed border ${
                  m.role === "user"
                    ? "bg-emerald-500/10 border-emerald-500/30 text-foreground"
                    : "bg-card/70 border-border"
                }`}
              >
                {m.role === "assistant" ? renderRichText(m.content || (streaming && i === messages.length - 1 ? "…" : "")) : m.content}
              </div>
            </div>
          ))}
        </div>

        <form
          className="border-t border-border p-3 bg-card/40"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <div className="max-w-3xl mx-auto flex items-end gap-2">
            <textarea
              className="flex-1 min-h-[44px] max-h-[160px] resize-none rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder="Ask Tal anything — openings, plans, endgames…"
              rows={1}
              disabled={streaming}
            />
            <Button type="submit" disabled={streaming || !input.trim()}>
              {streaming ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
