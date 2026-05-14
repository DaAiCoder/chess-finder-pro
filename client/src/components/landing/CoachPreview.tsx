import * as React from "react";
import { Link } from "wouter";
import { MessageCircle, Sparkles, ArrowRight, Lock, Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { usePreviewQuota } from "@/hooks/usePreviewQuota";
import {
  coachStreamHeadersOk,
  sseTailDelta,
  STALE_COACH_SERVER_MSG,
} from "@/lib/coachReplyNormalize";
import { cn } from "@/lib/utils";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

const SAMPLE_PROMPTS = [
  "What does Tal do when he has the bishop pair?",
  "Why is 1.e4 a stronger first move than 1.h4?",
  "How do I stop blundering my queen in time scrambles?",
];

/**
 * Mini coach chat embedded on /welcome. Hits the same SSE endpoint as
 * the full Coach page, but caps guests at 3 turns via
 * `usePreviewQuota("coach")` and renders an inline "Sign up to keep
 * chatting" card once the quota is spent.
 */
export function CoachPreview() {
  const quota = usePreviewQuota("coach");
  const [input, setInput] = React.useState("");
  const [messages, setMessages] = React.useState<Msg[]>([]);
  const [streaming, setStreaming] = React.useState(false);
  const scrollerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streaming]);

  const send = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || streaming) return;
    if (!quota.spend(1)) return;
    setInput("");
    setMessages((m) => [
      ...m,
      { role: "user", content: text },
      { role: "assistant", content: "" },
    ]);
    setStreaming(true);
    try {
      const res = await fetch("/api/coach/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
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
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const blocks = buf.split("\n\n");
        buf = blocks.pop() ?? "";
        for (const block of blocks) {
          const line = block.trim();
          if (!line.startsWith("data:")) continue;
          try {
            const obj = JSON.parse(line.replace(/^data:\s*/, "")) as {
              delta?: string;
              error?: string;
            };
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

  const remaining = quota.unlimited ? "unlimited" : `${quota.remaining}/${quota.budget}`;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          {quota.unlimited
            ? "Coach is unlimited on your account."
            : `Preview: ${remaining} free messages left.`}
        </span>
        {!quota.unlimited && (
          <Link href="/signup?next=%2Fcoach" className="text-emerald-300 hover:underline">
            Unlock full coach →
          </Link>
        )}
      </div>

      <div
        ref={scrollerRef}
        className="h-64 overflow-y-auto rounded-lg border border-border bg-background/60 p-3 space-y-2 text-sm"
      >
        {messages.length === 0 ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Try a sample question:</p>
            {SAMPLE_PROMPTS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => void send(p)}
                disabled={quota.exceeded || streaming}
                className={cn(
                  "w-full text-left text-xs rounded border border-border/70 bg-card/70 px-2 py-1.5 hover:bg-secondary/80 transition-colors",
                  (quota.exceeded || streaming) && "opacity-50 cursor-not-allowed",
                )}
              >
                <Sparkles className="w-3 h-3 inline mr-1 text-emerald-400" />
                {p}
              </button>
            ))}
          </div>
        ) : (
          messages.map((m, i) => (
            <div
              key={i}
              className={cn(
                "rounded px-2 py-1.5 leading-relaxed whitespace-pre-wrap",
                m.role === "user"
                  ? "bg-emerald-950/40 border border-emerald-800/40"
                  : "bg-secondary/60",
              )}
            >
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-0.5">
                {m.role === "user" ? "You" : "Coach"}
              </span>
              {m.content || <em className="text-muted-foreground">…</em>}
            </div>
          ))
        )}
      </div>

      {quota.exceeded ? (
        <SignupNudge />
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="flex gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask the coach…"
            disabled={streaming}
            className="flex-1 rounded border border-input bg-background px-3 py-2 text-sm"
          />
          <Button
            type="submit"
            disabled={streaming || !input.trim()}
            style={{ backgroundColor: "#769656", color: "white" }}
          >
            <Send className="w-4 h-4" />
          </Button>
        </form>
      )}
    </div>
  );
}

function SignupNudge() {
  return (
    <div className="rounded-lg border border-emerald-700/60 bg-emerald-950/30 p-3 flex items-center gap-3">
      <Lock className="w-4 h-4 text-emerald-300 shrink-0" />
      <p className="flex-1 text-xs text-foreground/90">
        That&apos;s your free preview. Sign up to keep chatting and save every conversation.
      </p>
      <Link href="/signup?next=%2Fcoach">
        <Button size="sm" style={{ backgroundColor: "#769656", color: "white" }}>
          Sign up
          <ArrowRight className="w-3.5 h-3.5 ml-1" />
        </Button>
      </Link>
    </div>
  );
}

CoachPreview.displayName = "CoachPreview";
export const COACH_PREVIEW_ICON = MessageCircle;
