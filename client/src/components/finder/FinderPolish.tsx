/**
 * Pattern Finder polish bundle: saved searches, share link, follow-up Q&A.
 *
 * Lives next to the main `pattern-finder.tsx` to keep its already-busy
 * file from growing further. Designed as a few small surface-area
 * components that the host page composes:
 *
 *   <FinderToolbar
 *     currentQuery={structured}
 *     onLoad={(q) => setStructured(q)}
 *   />
 *
 *   <LineQAndA
 *     fen={selectedLine.leafFen}
 *     moves={selectedLine.moves}
 *     openingName={selectedLine.opening.name}
 *   />
 */

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bookmark, BookmarkPlus, Loader2, MessageSquare, Share2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { api } from "@/lib/queryClient";
import { toast } from "@/components/ui/Toaster";
import type { LineQuery } from "@shared/schema";

interface SavedSearch {
  id: number;
  name: string;
  query: LineQuery;
  createdAt: string;
}

/* ---------------------------------------------------------------------- */
/* Share-link helpers                                                      */
/* ---------------------------------------------------------------------- */

export function encodeQueryToUrl(q: LineQuery, baseUrl?: string): string {
  const json = JSON.stringify(q);
  const b64 = typeof window !== "undefined"
    ? window.btoa(unescape(encodeURIComponent(json)))
    : Buffer.from(json).toString("base64");
  const safe = b64.replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  const base = baseUrl ?? (typeof window !== "undefined" ? window.location.origin + "/discover" : "/discover");
  return `${base}?q=${safe}`;
}

export function decodeQueryFromUrl(search: string): LineQuery | null {
  const params = new URLSearchParams(search);
  const raw = params.get("q");
  if (!raw) return null;
  try {
    const b64 = raw.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const json = typeof window !== "undefined"
      ? decodeURIComponent(escape(window.atob(padded)))
      : Buffer.from(padded, "base64").toString();
    return JSON.parse(json) as LineQuery;
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------------- */
/* Toolbar                                                                 */
/* ---------------------------------------------------------------------- */

export function FinderToolbar({
  currentQuery,
  onLoad,
}: {
  currentQuery: LineQuery;
  onLoad: (q: LineQuery) => void;
}) {
  const [showSaved, setShowSaved] = React.useState(false);

  const saved = useQuery<{ searches: SavedSearch[] }>({
    queryKey: ["finder-saved"],
    queryFn: () => api("/api/finder/saved"),
  });
  const qc = useQueryClient();

  const save = useMutation<unknown, Error, void>({
    mutationFn: async () => {
      const name = window.prompt("Name this search:");
      if (!name?.trim()) return null;
      await api("/api/finder/saved", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), query: currentQuery }),
      });
      return null;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["finder-saved"] });
      toast({ title: "Search saved" });
    },
  });

  function share() {
    const url = encodeQueryToUrl(currentQuery);
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url);
      toast({ title: "Share link copied to clipboard" });
    } else {
      window.prompt("Copy this share URL:", url);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" onClick={() => save.mutate()} disabled={save.isPending}>
        <BookmarkPlus className="w-4 h-4 mr-1" /> Save
      </Button>
      <Button size="sm" variant="outline" onClick={() => setShowSaved((s) => !s)}>
        <Bookmark className="w-4 h-4 mr-1" />
        Saved {saved.data ? <Badge variant="secondary" className="ml-1">{saved.data.searches.length}</Badge> : null}
      </Button>
      <Button size="sm" variant="outline" onClick={share}>
        <Share2 className="w-4 h-4 mr-1" /> Share link
      </Button>

      {showSaved && (
        <div className="w-full border rounded-lg bg-card p-2 mt-1">
          {(saved.data?.searches ?? []).length === 0 ? (
            <div className="text-xs text-muted-foreground italic px-2 py-1">No saved searches yet.</div>
          ) : (
            <ul className="space-y-1 text-sm">
              {saved.data!.searches.map((s) => (
                <li key={s.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent">
                  <button
                    onClick={() => {
                      onLoad(s.query);
                      setShowSaved(false);
                    }}
                    className="text-left flex-1"
                  >
                    {s.name}
                  </button>
                  <Trash2
                    className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive cursor-pointer"
                    onClick={async () => {
                      await api(`/api/finder/saved/${s.id}`, { method: "DELETE" });
                      qc.invalidateQueries({ queryKey: ["finder-saved"] });
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Line Q&A                                                                */
/* ---------------------------------------------------------------------- */

export function LineQAndA({
  fen,
  moves,
  openingName,
}: {
  fen: string;
  moves: string[];
  openingName?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [question, setQuestion] = React.useState("");
  const [answer, setAnswer] = React.useState<string | null>(null);

  const ask = useMutation<{ text: string }, Error, string>({
    mutationFn: (q) =>
      api("/api/coach/line-question", {
        method: "POST",
        body: JSON.stringify({ fen, moves, openingName, question: q }),
      }),
    onSuccess: (r) => setAnswer(r.text),
  });

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <MessageSquare className="w-3.5 h-3.5 mr-1" /> Ask the coach about this line
      </Button>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-3 space-y-2 text-sm">
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && question.trim()) ask.mutate(question.trim());
          }}
          placeholder="e.g. Why does Black play Qc7 here?"
          className="flex-1 rounded border bg-background px-2 py-1 text-sm"
        />
        <Button size="sm" onClick={() => question.trim() && ask.mutate(question.trim())} disabled={!question.trim() || ask.isPending}>
          {ask.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Ask"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => { setOpen(false); setAnswer(null); }}>
          Close
        </Button>
      </div>
      {answer && (
        <div className="text-sm text-foreground/90 whitespace-pre-wrap leading-snug border-t pt-2">
          {answer}
        </div>
      )}
    </div>
  );
}
