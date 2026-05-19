import * as React from "react";
import { Link, useLocation } from "wouter";
import { MessageCircle, X, Minimize2, Send, Loader2, LifeBuoy } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { streamSupportChat, type SupportMessage } from "@/lib/supportChatStream";
import { Button } from "@/components/ui/Button";
import { APP_NAME } from "@/lib/brand";

const STORAGE_OPEN = "cfp-support-open";

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

const DEFAULT_STARTERS = [
  "How does the free trial work?",
  "How do I cancel my subscription?",
  "I can't sign in — help",
  "What's included in Pro?",
];

/**
 * Render-style floating support assistant (bottom-right).
 */
export function SupportChatWidget() {
  const [loc] = useLocation();
  const { user } = useCurrentUser();
  const [open, setOpen] = React.useState(() => {
    try {
      return sessionStorage.getItem(STORAGE_OPEN) === "1";
    } catch {
      return false;
    }
  });
  const [starters, setStarters] = React.useState<string[]>(DEFAULT_STARTERS);
  const [input, setInput] = React.useState("");
  const [messages, setMessages] = React.useState<SupportMessage[]>([]);
  const [streaming, setStreaming] = React.useState(false);
  const [enabled, setEnabled] = React.useState(true);
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    fetch("/api/support/config")
      .then((r) => r.json())
      .then((j: { enabled?: boolean; starters?: string[] }) => {
        if (j.enabled === false) setEnabled(false);
        if (j.starters?.length) setStarters(j.starters);
      })
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_OPEN, open ? "1" : "0");
    } catch {
      /* noop */
    }
    if (open) {
      window.setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [open]);

  React.useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streaming, open]);

  const signedIn = !!user?.authenticated;
  const hasPro = !!user?.hasProAccess;

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || streaming) return;
    setInput("");
    const history = [...messages];
    setMessages((m) => [...m, { role: "user", content: q }, { role: "assistant", content: "" }]);
    setStreaming(true);
    try {
      await streamSupportChat({
        message: q,
        history,
        page: loc,
        signedIn,
        hasPro,
        onDelta: (acc) => {
          setMessages((m) => {
            const next = [...m];
            next[next.length - 1] = { role: "assistant", content: acc };
            return next;
          });
        },
      });
    } catch (e) {
      setMessages((m) => {
        const next = [...m];
        next[next.length - 1] = {
          role: "assistant",
          content: `Sorry — ${(e as Error).message}. You can [contact our team](/legal/contact) for human help.`,
        };
        return next;
      });
    } finally {
      setStreaming(false);
    }
  };

  if (!enabled) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col items-end gap-3 pointer-events-none">
      {open && (
        <div
          className={cn(
            "pointer-events-auto w-[min(100vw-2rem,380px)] h-[min(72vh,520px)]",
            "flex flex-col rounded-xl border border-border/80 bg-card shadow-2xl overflow-hidden",
            "animate-in slide-in-from-bottom-4 fade-in duration-200",
          )}
          role="dialog"
          aria-label="Support chat"
        >
          <header className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/40 shrink-0">
            <LifeBuoy className="h-4 w-4 text-emerald-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold leading-tight">Support</p>
              <p className="text-[10px] text-muted-foreground truncate">AI help · {APP_NAME}</p>
            </div>
            <button
              type="button"
              className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground"
              aria-label="Minimize"
              onClick={() => setOpen(false)}
            >
              <Minimize2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground"
              aria-label="Close"
              onClick={() => {
                setOpen(false);
                setMessages([]);
              }}
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div ref={scrollerRef} className="flex-1 overflow-y-auto p-3 space-y-3 text-sm">
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-muted-foreground text-[13px] leading-relaxed">
                  Hi! Ask about billing, sign-in, trials, or how the app works. For chess coaching,
                  try{" "}
                  <Link href="/coach" className="text-emerald-400 hover:underline">
                    Ask Tal
                  </Link>
                  .
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {starters.map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={streaming}
                      onClick={() => void send(s)}
                      className="text-left text-[11px] px-2.5 py-1.5 rounded-full border border-border/80 bg-secondary/30 hover:bg-secondary/60 text-foreground/90 transition-colors"
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
                className={cn(
                  "max-w-[92%] rounded-lg px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap",
                  m.role === "user"
                    ? "ml-auto bg-emerald-900/50 text-emerald-50 border border-emerald-800/40"
                    : "mr-auto bg-secondary/50 text-foreground/95 border border-border/50",
                )}
              >
                {m.role === "assistant" && m.content === "" && streaming ? (
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
                  </span>
                ) : (
                  renderRichText(m.content)
                )}
              </div>
            ))}
          </div>

          <footer className="shrink-0 border-t border-border p-2 space-y-2 bg-card">
            <form
              className="flex gap-2 items-end"
              onSubmit={(e) => {
                e.preventDefault();
                void send(input);
              }}
            >
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send(input);
                  }
                }}
                placeholder="Ask a question…"
                disabled={streaming}
                maxLength={2000}
                className="flex-1 min-h-[40px] max-h-24 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-600/50"
              />
              <Button
                type="submit"
                size="sm"
                disabled={streaming || !input.trim()}
                className="shrink-0 h-10 w-10 p-0"
                style={{ backgroundColor: "#769656", color: "white" }}
                aria-label="Send"
              >
                {streaming ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </form>
            <p className="text-[10px] text-center text-muted-foreground">
              AI can make mistakes.{" "}
              <Link href="/legal/contact" className="underline-offset-2 hover:underline">
                Contact a human
              </Link>
            </p>
          </footer>
        </div>
      )}

      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            "pointer-events-auto h-14 w-14 rounded-full shadow-lg",
            "flex items-center justify-center",
            "bg-[#769656] hover:bg-[#6a874d] text-white transition-transform hover:scale-105",
          )}
          aria-label="Open support chat"
        >
          <MessageCircle className="h-6 w-6" />
        </button>
      )}
    </div>
  );
}
