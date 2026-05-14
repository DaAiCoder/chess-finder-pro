/**
 * /watch/games/:id — single-episode watch page.
 *
 * Fetches the server-built timeline (positions, captions, arrows,
 * eval bar samples) and hands it to `AnimatedBoardPlayer`. Side panel
 * surfaces metadata + an "Export to MP4" button that drops the user
 * into the export workshop (`/watch/export`) with this game pre-selected.
 */
import * as React from "react";
import { Link, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { Chessboard } from "@/components/chess/Chessboard";
import { api } from "@/lib/queryClient";
import {
  AnimatedBoardPlayer,
  type WatchTimeline,
  type WatchPosition,
} from "@/components/watch/AnimatedBoardPlayer";
import { ArrowLeft, Clapperboard, Library } from "lucide-react";

export default function WatchPage() {
  const [, params] = useRoute<{ id: string }>("/watch/games/:id");
  const id = Number(params?.id);
  const [voice, setVoice] = React.useState<"aria" | "guy" | "ryan">("aria");
  const [boardPly, setBoardPly] = React.useState(0);

  const timelineQ = useQuery({
    queryKey: ["watch-timeline", id, voice],
    queryFn: () =>
      api<{ timeline: WatchTimeline }>(
        `/api/watch/games/${id}/timeline?voice=${encodeURIComponent(voice)}`,
      ),
    enabled: Number.isFinite(id),
  });

  if (!Number.isFinite(id)) {
    return <div className="p-6 text-sm text-muted-foreground">Invalid game id.</div>;
  }

  if (timelineQ.isLoading) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Building long-form script (Stockfish samples, edge-tts narration) — first load can take
        several minutes…
      </div>
    );
  }
  if (timelineQ.error || !timelineQ.data) {
    return (
      <div className="p-6 text-sm text-destructive">
        Failed to load timeline: {(timelineQ.error as Error)?.message ?? "unknown error"}
      </div>
    );
  }

  const timeline = timelineQ.data.timeline;
  const meta = timelineQ.data.timeline.meta;
  const libraryGameId = meta?.libraryGameId ?? id;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <header className="space-y-2">
        <Link
          href="/watch"
          className="text-xs text-muted-foreground hover:underline flex items-center gap-1"
        >
          <ArrowLeft className="h-3 w-3" /> All channels
        </Link>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">{timeline.title}</h1>
            {timeline.subtitle && (
              <div className="text-sm text-muted-foreground mt-1">
                {timeline.subtitle}
              </div>
            )}
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              <Badge variant="outline" className="text-[10px] font-mono">
                {timeline.result ?? "*"}
              </Badge>
              {meta?.tier && (
                <Badge variant="outline" className="text-[10px]">
                  {meta.tier}
                </Badge>
              )}
              {meta?.source && (
                <Badge variant="outline" className="text-[10px]">
                  {meta.source}
                </Badge>
              )}
              <span className="text-[11px] text-muted-foreground">
                {meta ? Math.floor(meta.plyCount / 2) : "?"} moves
              </span>
            </div>
            {typeof timeline.totalDurationS === "number" && (
              <div className="text-xs text-muted-foreground mt-1">
                Episode length about {formatClock(timeline.totalDurationS)} at 1× speed
                {typeof timeline.targetDurationS === "number" &&
                  ` (pacing target ${formatClock(timeline.targetDurationS)})`}
                . Narration uses Microsoft Edge neural voices (free). Click Play once to unlock
                audio in the browser.
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/library/games/${libraryGameId}`}>
                <Library className="h-4 w-4 mr-2" /> Open in Library
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href={`/watch/export?gameId=${libraryGameId}`}>
                <Clapperboard className="h-4 w-4 mr-2" /> Export to MP4
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,720px)_320px] gap-4">
        <Card>
          <CardContent className="p-4">
            <AnimatedBoardPlayer
              timeline={timeline}
              autoPlay
              onPlyChange={setBoardPly}
            />
          </CardContent>
        </Card>
        <div className="space-y-4 min-w-0">
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm">Narration voice</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              <Label htmlFor="watch-voice" className="text-xs text-muted-foreground">
                Rebuilds timeline (cached after first run).
              </Label>
              <select
                id="watch-voice"
                className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
                value={voice}
                onChange={(e) => setVoice(e.target.value as "aria" | "guy" | "ryan")}
              >
                <option value="aria">Aria (US, female)</option>
                <option value="guy">Guy (US, male)</option>
                <option value="ryan">Ryan (UK, male)</option>
              </select>
            </CardContent>
          </Card>
          <LinesPanel positions={timeline.positions} ply={boardPly} />
          <UpNextPanel currentId={libraryGameId} />
        </div>
      </div>
    </div>
  );
}

function LinesPanel({ positions, ply }: { positions: WatchPosition[]; ply: number }) {
  const pos = positions[ply];
  const alts = pos?.alternates ?? [];
  const best = pos?.bestMoveUci;

  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm">Engine lines</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-2 text-xs">
        {ply === 0 && (
          <p className="text-muted-foreground leading-relaxed">
            Lines appear after moves are played. Set{" "}
            <code className="text-[10px] bg-muted px-1 rounded">STOCKFISH_PATH</code> for deeper
            multi-PV hints on key moments.
          </p>
        )}
        {ply > 0 && best && (
          <div className="rounded border border-border/60 bg-muted/30 px-2 py-1.5 font-mono text-[11px]">
            Best engine try from this position:{" "}
            <span className="text-emerald-600">{best}</span>
          </div>
        )}
        {alts.length === 0 && ply > 0 && (
          <p className="text-muted-foreground">No sampled alternatives at this ply.</p>
        )}
        {alts.map((a, i) => (
          <div
            key={i}
            className="rounded border border-border/50 px-2 py-1.5 font-mono text-[11px] leading-snug"
          >
            {a.san ?? a.pvSan ?? a.uci}
            {a.cp != null && (
              <span className="text-muted-foreground ml-1">({(a.cp / 100).toFixed(1)})</span>
            )}
            {a.mateIn != null && (
              <span className="text-muted-foreground ml-1">M{Math.abs(a.mateIn)}</span>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

interface ChannelEpisode {
  id: number;
  whitePlayer: string | null;
  blackPlayer: string | null;
  result: string | null;
  thumbnailFen: string;
  plyCount: number;
}

function UpNextPanel({ currentId }: { currentId: number }) {
  const data = useQuery({
    queryKey: ["watch-channel", "carlsen-best"],
    queryFn: () =>
      api<{ episodes: ChannelEpisode[] }>(
        "/api/watch/channels/carlsen-best?limit=10",
      ),
  });

  const items = (data.data?.episodes ?? []).filter((e) => e.id !== currentId);

  return (
    <Card>
      <CardContent className="p-3 space-y-2">
        <h3 className="text-sm font-semibold">Up next</h3>
        {data.isLoading ? (
          <div className="text-xs text-muted-foreground">Loading…</div>
        ) : items.length === 0 ? (
          <div className="text-xs text-muted-foreground">
            No more episodes in this channel.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {items.slice(0, 8).map((ep) => (
              <Link
                key={ep.id}
                href={`/watch/games/${ep.id}`}
                className="flex gap-2 rounded hover:bg-secondary/50 p-1.5"
              >
                <div className="w-16 h-16 shrink-0 rounded overflow-hidden border border-border bg-muted">
                  <ThumbnailMini fen={ep.thumbnailFen} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate">
                    {ep.whitePlayer ?? "?"} vs {ep.blackPlayer ?? "?"}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {ep.result ?? "*"} · {Math.floor(ep.plyCount / 2)} moves
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ThumbnailMini({ fen }: { fen: string }) {
  if (!fen) return null;
  return <Chessboard fen={fen} />;
}

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
