/**
 * /watch/studio — Chess Tube: large topic-organized catalog + YouTube embeds.
 */
import * as React from "react";
import { Link, useLocation, useSearch } from "wouter";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  CHESS_TUBE_CATEGORY_TABS,
  CHESS_TUBE_ITEMS,
  catalogSessionEstimate,
  chessTubeEmbedSrc,
  chessTubeThumbUrl,
  chessTubeWatchHref,
  filterChessTubeItems,
  type ChessTubeCategory,
  type ChessTubeItem,
} from "@/data/chessTube";
import { Clapperboard, ExternalLink, ListVideo, Search, Tv } from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/brand";

export default function ChessTube() {
  const searchStr = useSearch();
  const [, setLocation] = useLocation();
  const [tab, setTab] = React.useState<"all" | ChessTubeCategory>("all");
  const [query, setQuery] = React.useState("");
  const [activeId, setActiveId] = React.useState(CHESS_TUBE_ITEMS[0]!.id);

  const filtered = React.useMemo(
    () => filterChessTubeItems(CHESS_TUBE_ITEMS, tab, query),
    [tab, query],
  );

  const active =
    CHESS_TUBE_ITEMS.find((x) => x.id === activeId) ??
    filtered[0] ??
    CHESS_TUBE_ITEMS[0]!;

  React.useEffect(() => {
    const raw =
      searchStr ||
      (typeof window !== "undefined" ? window.location.search.replace(/^\?/, "") : "");
    const params = new URLSearchParams(raw);
    const v = params.get("v");
    const id = params.get("id");
    if (v) {
      const hit = CHESS_TUBE_ITEMS.find((i) => i.kind === "video" && i.youtubeId === v);
      if (hit) setActiveId(hit.id);
    } else if (id) {
      const hit = CHESS_TUBE_ITEMS.find((i) => i.id === id);
      if (hit) setActiveId(hit.id);
    }
  }, [searchStr]);

  const totalSessions = catalogSessionEstimate(CHESS_TUBE_ITEMS);
  const videoCount = CHESS_TUBE_ITEMS.filter((i) => i.kind === "video").length;
  const playlistCount = CHESS_TUBE_ITEMS.filter((i) => i.kind === "playlist").length;

  const selectItem = (it: ChessTubeItem) => {
    setActiveId(it.id);
    if (it.kind === "video") {
      setLocation(`/watch/studio?v=${encodeURIComponent(it.youtubeId)}`, { replace: true });
    } else {
      setLocation(`/watch/studio?id=${encodeURIComponent(it.id)}`, { replace: true });
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1400px] mx-auto">
      <header className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Tv className="w-6 h-6 text-red-500" /> Chess Tube
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
            <span className="text-foreground/90 font-medium">{videoCount}</span> hand-picked
            lessons plus <span className="text-foreground/90 font-medium">{playlistCount}</span>{" "}
            mega-playlists — about{" "}
            <span className="text-foreground/90 font-medium">{totalSessions}+</span> sessions when
            you include full playlists on YouTube. Filter by topic, search by title or creator, then
            play inline.
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Videos stay on YouTube; {APP_NAME} is a catalog &amp; player shell only.
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="shrink-0 self-start">
          <Link href="/watch/export">
            <Clapperboard className="w-4 h-4 mr-2" /> MP4 export (library games)
          </Link>
        </Button>
      </header>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="relative flex-1 min-w-0 max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search title, creator, series…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search Chess Tube"
          />
        </div>
        <div className="text-xs text-muted-foreground shrink-0">
          Showing <span className="font-mono text-foreground">{filtered.length}</span> of{" "}
          <span className="font-mono text-foreground">{CHESS_TUBE_ITEMS.length}</span> rows
        </div>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin">
        {CHESS_TUBE_CATEGORY_TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition",
              tab === id
                ? "border-emerald-500/70 bg-emerald-500/15 text-foreground"
                : "border-border bg-card/50 text-muted-foreground hover:bg-secondary/70",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-6">
        <Card className="overflow-hidden border-border/80">
          <div className="aspect-video bg-black">
            <iframe
              key={active.kind === "video" ? active.youtubeId : active.playlistId}
              title={active.title}
              src={chessTubeEmbedSrc(active)}
              className="w-full h-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
          <CardContent className="p-4 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{active.creator}</Badge>
              {active.kind === "playlist" ? (
                <Badge variant="outline" className="gap-1">
                  <ListVideo className="w-3 h-3" /> Playlist · ~{active.episodeEstimate} eps
                </Badge>
              ) : (
                active.series && (
                  <Badge variant="outline" className="text-xs">
                    {active.series}
                  </Badge>
                )
              )}
              {active.categories.map((c) => (
                <Badge key={c} variant="outline" className="text-[10px] font-normal capitalize">
                  {c.replace(/-/g, " ")}
                </Badge>
              ))}
            </div>
            <p className="text-sm font-medium leading-snug">{active.title}</p>
            <a
              href={chessTubeWatchHref(active)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-emerald-600 hover:underline inline-flex items-center gap-1"
            >
              Open on YouTube <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </CardContent>
        </Card>

        <div className="space-y-2 min-h-0 flex flex-col">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide shrink-0">
            Catalog
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-2 gap-2 max-h-[min(78vh,640px)] overflow-y-auto pr-1">
            {filtered.map((it) => (
              <button
                key={it.id}
                type="button"
                onClick={() => selectItem(it)}
                className={cn(
                  "group text-left rounded-lg border overflow-hidden transition",
                  it.id === active.id
                    ? "border-emerald-500/70 ring-1 ring-emerald-500/30"
                    : "border-border hover:border-emerald-500/40",
                )}
              >
                <div className="relative aspect-video bg-muted">
                  <img
                    src={chessTubeThumbUrl(it)}
                    alt=""
                    className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition"
                    loading="lazy"
                  />
                  {it.kind === "playlist" && (
                    <div className="absolute top-1 right-1 rounded bg-black/70 text-white text-[9px] px-1.5 py-0.5 font-medium">
                      PL
                    </div>
                  )}
                </div>
                <div className="p-2 space-y-0.5">
                  <div className="text-[11px] font-medium leading-snug line-clamp-2">{it.title}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{it.creator}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
