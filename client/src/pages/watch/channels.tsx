/**
 * /watch — Watch Chess: channel grid + per-channel episode list.
 *
 * Channels are server-defined (see `server/services/watchChannels.ts`)
 * and built from filters over `library_games`. This page lists all of
 * them, with inline previews; click into one for the full episode
 * list, then click into an episode for the AnimatedBoardPlayer.
 */
import * as React from "react";
import { Link, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Chessboard } from "@/components/chess/Chessboard";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/queryClient";
import { Cpu, Play, Clapperboard, ArrowLeft, ChevronRight } from "lucide-react";

interface ChannelDef {
  slug: string;
  title: string;
  description: string;
  accent: { from: string; to: string };
  presenter?: string;
}

interface Episode {
  id: number;
  whitePlayer: string | null;
  blackPlayer: string | null;
  whiteRating: number | null;
  blackRating: number | null;
  result: string | null;
  eco: string | null;
  opening: string | null;
  event: string | null;
  playedAt: string | null;
  plyCount: number;
  tier: string;
  thumbnailFen: string;
  durationS: number;
}

interface ChannelSummary {
  def: ChannelDef;
  count: number;
  preview: Episode[];
}

export default function WatchChannels() {
  const [, params] = useRoute<{ slug: string }>("/watch/channels/:slug");
  const slug = params?.slug;
  if (slug) return <ChannelDetail slug={slug} />;
  return <ChannelGrid />;
}

/* ---------------------------------------------------------------------- */
/* Top-level channel grid                                                 */
/* ---------------------------------------------------------------------- */

function ChannelGrid() {
  const channels = useQuery({
    queryKey: ["watch-channels"],
    queryFn: () => api<{ channels: ChannelSummary[] }>("/api/watch/channels"),
  });

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Play className="w-6 h-6 text-emerald-500" /> Watch Chess
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Curated playlists from the Game Library — animated, narrated, and
            exportable to MP4. Use{" "}
            <strong className="text-foreground/90 font-medium">Chess Tube</strong> for
            instructive YouTube picks, or{" "}
            <strong className="text-foreground/90 font-medium">Computer chess</strong> for
            engine replays and live silicon.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button asChild variant="outline">
            <Link href="/watch/cvc">
              <Cpu className="w-4 h-4 mr-2" /> Computer chess
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/watch/studio">
              <Play className="w-4 h-4 mr-2" /> Chess Tube
            </Link>
          </Button>
          <Button asChild>
            <Link href="/watch/export">
              <Clapperboard className="w-4 h-4 mr-2" /> MP4 export
            </Link>
          </Button>
        </div>
      </header>

      {channels.isLoading && (
        <div className="text-sm text-muted-foreground">Loading channels…</div>
      )}
      {channels.error && (
        <div className="text-sm text-destructive">
          Failed to load channels: {(channels.error as Error).message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {(channels.data?.channels ?? []).map((c) => (
          <ChannelCard key={c.def.slug} channel={c} />
        ))}
      </div>
    </div>
  );
}

function ChannelCard({ channel }: { channel: ChannelSummary }) {
  const { def, count, preview } = channel;
  return (
    <Card className="overflow-hidden">
      <Link href={`/watch/channels/${def.slug}`}>
        <div
          className="h-28 w-full flex flex-col justify-end p-4 text-white relative"
          style={{
            background: `linear-gradient(135deg, ${def.accent.from} 0%, ${def.accent.to} 100%)`,
          }}
        >
          {def.presenter && (
            <div className="text-[10px] uppercase tracking-[0.25em] text-white/80">
              {def.presenter}
            </div>
          )}
          <h2 className="text-lg font-bold leading-tight">{def.title}</h2>
          <div className="absolute top-3 right-3 text-[11px] bg-black/40 px-2 py-0.5 rounded">
            {count} episode{count === 1 ? "" : "s"}
          </div>
        </div>
      </Link>
      <CardContent className="p-3 space-y-3">
        <p className="text-xs text-muted-foreground line-clamp-2">{def.description}</p>
        <div className="grid grid-cols-4 gap-1.5">
          {preview.slice(0, 4).map((ep) => (
            <Link
              key={ep.id}
              href={`/watch/games/${ep.id}`}
              className="group block rounded overflow-hidden border border-border hover:ring-1 hover:ring-emerald-500/40 transition"
              title={`${ep.whitePlayer ?? "?"} vs ${ep.blackPlayer ?? "?"}`}
            >
              <div className="aspect-square overflow-hidden">
                {ep.thumbnailFen ? (
                  <Chessboard fen={ep.thumbnailFen} />
                ) : (
                  <div className="h-full w-full bg-muted" />
                )}
              </div>
            </Link>
          ))}
        </div>
        <Link
          href={`/watch/channels/${def.slug}`}
          className="text-xs font-medium text-emerald-600 hover:underline flex items-center gap-1"
        >
          See all <ChevronRight className="h-3 w-3" />
        </Link>
      </CardContent>
    </Card>
  );
}

/* ---------------------------------------------------------------------- */
/* Channel detail page                                                    */
/* ---------------------------------------------------------------------- */

function ChannelDetail({ slug }: { slug: string }) {
  const channel = useQuery({
    queryKey: ["watch-channel", slug],
    queryFn: () =>
      api<{
        def: ChannelDef;
        episodes: Episode[];
        total: number;
      }>(`/api/watch/channels/${encodeURIComponent(slug)}`),
  });

  return (
    <div className="p-4 md:p-6 space-y-5">
      <header className="space-y-2">
        <Link
          href="/watch"
          className="text-xs text-muted-foreground hover:underline flex items-center gap-1"
        >
          <ArrowLeft className="h-3 w-3" /> Watch Chess
        </Link>
        {channel.data ? (
          <div
            className="rounded-md p-5 text-white"
            style={{
              background: `linear-gradient(135deg, ${channel.data.def.accent.from} 0%, ${channel.data.def.accent.to} 100%)`,
            }}
          >
            <h1 className="text-3xl font-bold">{channel.data.def.title}</h1>
            <p className="text-sm text-white/85 mt-1 max-w-2xl">
              {channel.data.def.description}
            </p>
            <div className="text-xs text-white/70 mt-2">
              {channel.data.total} episode{channel.data.total === 1 ? "" : "s"}
            </div>
          </div>
        ) : channel.isLoading ? (
          <div className="text-sm text-muted-foreground">Loading channel…</div>
        ) : (
          <div className="text-sm text-destructive">
            {(channel.error as Error)?.message ?? "Channel not found."}
          </div>
        )}
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {(channel.data?.episodes ?? []).map((ep) => (
          <EpisodeCard key={ep.id} episode={ep} />
        ))}
      </div>
    </div>
  );
}

function EpisodeCard({ episode }: { episode: Episode }) {
  const date = episode.playedAt
    ? new Date(episode.playedAt).toISOString().slice(0, 10)
    : "—";
  return (
    <Link href={`/watch/games/${episode.id}`} className="group">
      <Card className="overflow-hidden hover:ring-1 hover:ring-emerald-500/40 transition">
        <div className="relative aspect-square">
          {episode.thumbnailFen ? (
            <Chessboard fen={episode.thumbnailFen} />
          ) : (
            <div className="h-full w-full bg-muted" />
          )}
          <div className="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] font-mono px-2 py-0.5 rounded">
            {formatDuration(episode.durationS)}
          </div>
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition bg-black/30">
            <Play className="w-12 h-12 text-white drop-shadow-lg" />
          </div>
        </div>
        <CardContent className="p-3 space-y-1">
          <div className="text-sm font-semibold leading-snug line-clamp-2">
            {episode.whitePlayer ?? "?"}{" "}
            <span className="text-muted-foreground font-normal">vs</span>{" "}
            {episode.blackPlayer ?? "?"}
          </div>
          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
            <Badge variant="outline" className="text-[10px] font-mono">
              {episode.result ?? "*"}
            </Badge>
            <span>{date}</span>
            {episode.eco && <span>· {episode.eco}</span>}
            <span>· {Math.floor(episode.plyCount / 2)} moves</span>
          </div>
          {episode.opening && (
            <div className="text-[11px] text-muted-foreground truncate">
              {episode.opening}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

function formatDuration(s: number): string {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}
