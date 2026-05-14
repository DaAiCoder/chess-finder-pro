/**
 * /watch/cvc — Computer chess: video-style catalog of engine games plus
 * optional live engine-vs-engine matches.
 */
import * as React from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Chessboard } from "@/components/chess/Chessboard";
import { api } from "@/lib/queryClient";
import {
  CHESS_TUBE_ITEMS,
  computerChessTubePicks,
  chessTubeThumbUrl,
} from "@/data/chessTube";
import type { ChessTubeItem } from "@/data/chessTube";
import { Cpu, Play, Sparkles, ArrowRight, Video, ChevronDown, Tv } from "lucide-react";

interface Episode {
  id: number;
  whitePlayer: string | null;
  blackPlayer: string | null;
  result: string | null;
  thumbnailFen: string;
  plyCount: number;
  playedAt: string | null;
}

interface EngineSide {
  name: string;
  skill?: number;
  depth?: number;
  movetimeMs?: number;
  elo?: number;
}

interface MatchSummary {
  id: string;
  state: "running" | "done" | "error";
  options: { white: EngineSide; black: EngineSide; event?: string };
  startedAt: number;
  finishedAt?: number;
  ply: number;
  result?: string;
  libraryGameId?: number;
}

export default function WatchCvc() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const classics = useQuery({
    queryKey: ["watch-channel", "engine-classics"],
    queryFn: () =>
      api<{ episodes: Episode[]; total: number }>(
        "/api/watch/channels/engine-classics?limit=24",
      ),
  });
  const mine = useQuery({
    queryKey: ["watch-channel", "engine-matches-mine"],
    queryFn: () =>
      api<{ episodes: Episode[]; total: number }>(
        "/api/watch/channels/engine-matches-mine?limit=24",
      ),
  });
  const matches = useQuery({
    queryKey: ["engine-matches"],
    queryFn: () => api<{ matches: MatchSummary[] }>("/api/engines/match"),
    refetchInterval: 5_000,
  });

  const [whiteName, setWhiteName] = React.useState("Stockfish A");
  const [whiteDepth, setWhiteDepth] = React.useState(12);
  const [whiteSkill, setWhiteSkill] = React.useState(20);
  const [blackName, setBlackName] = React.useState("Stockfish B");
  const [blackDepth, setBlackDepth] = React.useState(12);
  const [blackSkill, setBlackSkill] = React.useState(20);
  const [movetimeMs, setMovetimeMs] = React.useState(800);
  const [usePreset, setUsePreset] = React.useState<"none" | "skill" | "elo">(
    "skill",
  );

  const tubePicks = React.useMemo(() => computerChessTubePicks(CHESS_TUBE_ITEMS, 16), []);

  const tubeHref = (it: ChessTubeItem) =>
    it.kind === "video"
      ? `/watch/studio?v=${encodeURIComponent(it.youtubeId)}`
      : `/watch/studio?id=${encodeURIComponent(it.id)}`;

  const startMutation = useMutation({
    mutationFn: () =>
      api<{ match: MatchSummary }>("/api/engines/match", {
        method: "POST",
        body: JSON.stringify({
          white: {
            name: whiteName,
            depth: whiteDepth,
            skill: usePreset === "skill" ? whiteSkill : undefined,
            elo: usePreset === "elo" ? 1500 + whiteSkill * 75 : undefined,
            movetimeMs,
          },
          black: {
            name: blackName,
            depth: blackDepth,
            skill: usePreset === "skill" ? blackSkill : undefined,
            elo: usePreset === "elo" ? 1500 + blackSkill * 75 : undefined,
            movetimeMs,
          },
        }),
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["engine-matches"] });
      navigate(`/watch/cvc/live/${data.match.id}`);
    },
  });

  const handlePreset = (kind: "max" | "skill0v20" | "weak") => {
    if (kind === "max") {
      setWhiteSkill(20);
      setBlackSkill(20);
      setWhiteDepth(16);
      setBlackDepth(16);
      setMovetimeMs(1500);
    } else if (kind === "skill0v20") {
      setWhiteSkill(20);
      setBlackSkill(0);
      setWhiteDepth(12);
      setBlackDepth(8);
      setMovetimeMs(600);
    } else {
      setWhiteSkill(5);
      setBlackSkill(5);
      setWhiteDepth(6);
      setBlackDepth(6);
      setMovetimeMs(300);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-8">
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Video className="w-6 h-6 text-primary" /> Computer chess
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Browse engine games like a video catalog — each card opens the animated
            replay. Spin up a live match below when you want fresh silicon-on-silicon.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button asChild variant="outline" size="sm">
            <Link href="/watch">Watch Chess</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/watch/studio">Chess Tube</Link>
          </Button>
        </div>
      </header>

      <section className="space-y-3 rounded-xl border border-border bg-card/25 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Tv className="w-4 h-4 text-red-500 shrink-0" />
              Chess Tube — engines &amp; championship chess
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5 max-w-2xl">
              YouTube lessons on Stockfish, AlphaZero, TCEC, and modern title fights — opens in{" "}
              <Link href="/watch/studio" className="text-emerald-600 hover:underline">
                Chess Tube
              </Link>{" "}
              with the player ready.
            </p>
          </div>
          <Button asChild variant="outline" size="sm" className="shrink-0 self-start">
            <Link href="/watch/studio">Full Chess Tube catalog</Link>
          </Button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {tubePicks.map((it) => (
            <Link key={it.id} href={tubeHref(it)} className="group">
              <Card className="overflow-hidden border-border/80 hover:border-emerald-500/40 transition h-full">
                <div className="relative aspect-video bg-muted">
                  <img
                    src={chessTubeThumbUrl(it)}
                    alt=""
                    className="w-full h-full object-cover opacity-95 group-hover:opacity-100"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="rounded-full bg-black/55 p-2 ring-2 ring-white/20">
                      <Play className="w-6 h-6 text-white" fill="currentColor" />
                    </div>
                  </div>
                </div>
                <CardContent className="p-2 space-y-0.5">
                  <div className="text-[11px] font-medium leading-snug line-clamp-2">{it.title}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{it.creator}</div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <Section
        title="Featured engine replays"
        subtitle="Classic computer games — click a tile to watch the full episode."
      >
        <VideoCatalogGrid episodes={classics.data?.episodes ?? []} loading={classics.isLoading} />
        <FooterLink to="/watch/channels/engine-classics" />
      </Section>

      <Section
        title="Your engine games"
        subtitle="Matches you’ve run or imported — same player, catalog layout."
      >
        <VideoCatalogGrid episodes={mine.data?.episodes ?? []} loading={mine.isLoading} />
        <FooterLink to="/watch/channels/engine-matches-mine" />
      </Section>

      <Section title="Live matches" subtitle="Jump in while the clocks are running.">
        {matches.data?.matches.filter((m) => m.state === "running").length ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {matches
              .data!.matches.filter((m) => m.state === "running")
              .map((m) => (
                <MatchCard key={m.id} match={m} />
              ))}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground rounded-lg border border-dashed border-border px-4 py-6 text-center">
            No live engines right now. Open{" "}
            <span className="font-medium text-foreground">Run a new match</span> below.
          </div>
        )}
      </Section>

      <details className="group rounded-xl border border-border bg-card/30 open:shadow-md transition-shadow">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-semibold hover:bg-secondary/40 rounded-xl">
          <span className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-emerald-500" />
            Run a new engine vs engine match
          </span>
          <ChevronDown className="w-4 h-4 text-muted-foreground transition group-open:rotate-180" />
        </summary>
        <div className="px-4 pb-4 pt-0 border-t border-border/60">
          <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-6 pt-4">
            <Card>
              <CardContent className="p-4 space-y-4">
                <p className="text-xs text-muted-foreground">
                  Two Stockfish instances on the server play to the end. You watch moves
                  stream in the live viewer.
                </p>

                <div className="flex gap-2 flex-wrap">
                  <Button variant="outline" size="sm" onClick={() => handlePreset("max")}>
                    <Sparkles className="h-3.5 w-3.5 mr-1" /> Max strength
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handlePreset("skill0v20")}>
                    Skill 0 vs 20
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handlePreset("weak")}>
                    Weak vs Weak
                  </Button>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground">White</div>
                  <Label className="text-xs">Name</Label>
                  <Input value={whiteName} onChange={(e) => setWhiteName(e.target.value)} />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Depth</Label>
                      <Input
                        type="number"
                        min={2}
                        max={22}
                        value={whiteDepth}
                        onChange={(e) => setWhiteDepth(Number(e.target.value))}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">
                        {usePreset === "elo" ? "Strength tick (0–20)" : "Skill (0–20)"}
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        max={20}
                        value={whiteSkill}
                        onChange={(e) => setWhiteSkill(Number(e.target.value))}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground">Black</div>
                  <Label className="text-xs">Name</Label>
                  <Input value={blackName} onChange={(e) => setBlackName(e.target.value)} />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Depth</Label>
                      <Input
                        type="number"
                        min={2}
                        max={22}
                        value={blackDepth}
                        onChange={(e) => setBlackDepth(Number(e.target.value))}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">
                        {usePreset === "elo" ? "Strength tick (0–20)" : "Skill (0–20)"}
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        max={20}
                        value={blackSkill}
                        onChange={(e) => setBlackSkill(Number(e.target.value))}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <Label className="text-xs">Move time (ms)</Label>
                  <Input
                    type="number"
                    min={50}
                    max={10_000}
                    value={movetimeMs}
                    onChange={(e) => setMovetimeMs(Number(e.target.value))}
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Strength model</Label>
                  <div className="flex gap-1 text-xs flex-wrap">
                    {(["skill", "elo", "none"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setUsePreset(m)}
                        className={`px-2 py-1 rounded border ${
                          m === usePreset
                            ? "bg-primary text-primary-foreground border-primary"
                            : "border-border"
                        }`}
                      >
                        {m === "skill" ? "Skill 0-20" : m === "elo" ? "Approx Elo" : "Raw depth"}
                      </button>
                    ))}
                  </div>
                </div>

                <Button
                  className="w-full"
                  onClick={() => startMutation.mutate()}
                  disabled={startMutation.isPending}
                >
                  <Play className="h-4 w-4 mr-2" />
                  {startMutation.isPending ? "Launching engines…" : "Start live match"}
                </Button>

                {startMutation.error && (
                  <div className="text-xs text-destructive">
                    {(startMutation.error as Error).message}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="text-xs text-muted-foreground leading-relaxed space-y-2 lg:pt-2">
              <p>
                Tip: drop more PGN files into{" "}
                <code className="font-mono text-[11px] bg-muted px-1 rounded">
                  server/data/cvcPgn/
                </code>{" "}
                and restart the server to grow the classics catalog.
              </p>
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function MatchCard({ match }: { match: MatchSummary }) {
  return (
    <Link href={`/watch/cvc/live/${match.id}`}>
      <Card className="overflow-hidden hover:ring-2 hover:ring-emerald-500/45 transition h-full">
        <div className="relative aspect-video bg-gradient-to-br from-zinc-800 to-zinc-950 flex items-center justify-center">
          <Play className="w-14 h-14 text-white/90 drop-shadow-lg" fill="currentColor" />
          <Badge className="absolute top-2 right-2 bg-red-600 text-white text-[10px]">
            LIVE
          </Badge>
          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/85 to-transparent px-3 py-2.5">
            <div className="text-sm font-semibold text-white leading-snug">
              {match.options.white.name}{" "}
              <span className="text-white/70 font-normal">vs</span> {match.options.black.name}
            </div>
            <div className="text-[11px] text-white/75 mt-0.5">
              Move {Math.floor(match.ply / 2)} · in progress
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}

function VideoCatalogGrid({ episodes, loading }: { episodes: Episode[]; loading: boolean }) {
  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading catalog…</div>;
  }
  if (episodes.length === 0) {
    return (
      <div className="text-sm text-muted-foreground italic rounded-lg border border-dashed border-border px-4 py-8 text-center">
        Nothing in this shelf yet — start a live match below, or add PGNs to{" "}
        <code className="font-mono text-xs mx-1">server/data/cvcPgn/</code>.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {episodes.map((ep) => (
        <Link key={ep.id} href={`/watch/games/${ep.id}`}>
          <Card className="overflow-hidden hover:ring-2 hover:ring-emerald-500/40 transition group h-full">
            <div className="relative aspect-video bg-zinc-950">
              {ep.thumbnailFen ? (
                <div className="absolute inset-0 overflow-hidden">
                  <Chessboard fen={ep.thumbnailFen} className="h-full w-full" />
                </div>
              ) : (
                <div className="absolute inset-0 bg-muted" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent pointer-events-none" />
              <div className="absolute inset-0 flex items-center justify-center opacity-90 group-hover:opacity-100 transition">
                <div className="rounded-full bg-black/55 p-3 ring-2 ring-white/25 group-hover:scale-105 transition-transform">
                  <Play className="w-8 h-8 text-white" fill="currentColor" />
                </div>
              </div>
              <div className="absolute bottom-2 left-2 right-2 flex items-end justify-between gap-2 min-w-0">
                <div className="text-[11px] sm:text-xs font-medium text-white drop-shadow-md truncate">
                  {ep.whitePlayer ?? "?"} <span className="text-white/70">vs</span>{" "}
                  {ep.blackPlayer ?? "?"}
                </div>
                <Badge variant="secondary" className="shrink-0 text-[10px] bg-black/55 text-white border-0">
                  Replay
                </Badge>
              </div>
            </div>
            <CardContent className="p-2.5">
              <div className="text-[11px] text-muted-foreground flex flex-wrap gap-x-2 gap-y-0.5">
                <span>{ep.result ?? "*"}</span>
                <span>·</span>
                <span>{Math.floor(ep.plyCount / 2)} moves</span>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

function FooterLink({ to }: { to: string }) {
  return (
    <Link
      href={to}
      className="text-xs font-medium text-emerald-600 hover:underline inline-flex items-center gap-1"
    >
      Open full channel <ArrowRight className="h-3 w-3" />
    </Link>
  );
}
