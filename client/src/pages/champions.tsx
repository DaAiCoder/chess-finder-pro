import * as React from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { api } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { Crown, Filter, Search, Sparkles, Star, Trophy } from "lucide-react";

type Era = "romantic" | "classical" | "hypermodern" | "soviet" | "modern" | "current";
type Style =
  | "attacker"
  | "positional"
  | "tactician"
  | "endgame"
  | "universal"
  | "theorist"
  | "intuitive"
  | "prophylactic";

interface ChampionSummary {
  id: string;
  displayName: string;
  countryCode: string;
  countryEmoji: string;
  born: number;
  died?: number;
  era: Era;
  peakRating: number;
  isWorldChampion: boolean;
  championship?: string;
  style: Style[];
  photoUrl?: string;
  hasLiveAccount: boolean;
  famousGameCount: number;
}

interface EraMeta {
  id: Era;
  label: string;
  description: string;
  color: string;
  count: number;
}

interface StyleMeta {
  id: Style;
  label: string;
  color: string;
  count: number;
}

interface CountryRow {
  code: string;
  emoji: string;
  total: number;
  champions: number;
}

interface ChampionsResponse {
  champions: ChampionSummary[];
  eras: EraMeta[];
  styles: StyleMeta[];
  countries: CountryRow[];
}

const ERA_ORDER: Era[] = ["romantic", "classical", "hypermodern", "soviet", "modern", "current"];

export default function ChampionsCatalog() {
  const [search, setSearch] = React.useState("");
  const [era, setEra] = React.useState<Era | "all">("all");
  const [style, setStyle] = React.useState<Style | "all">("all");
  const [country, setCountry] = React.useState<string | "all">("all");
  const [wcOnly, setWcOnly] = React.useState(false);

  const params = new URLSearchParams();
  if (era !== "all") params.set("era", era);
  if (style !== "all") params.set("style", style);
  if (country !== "all") params.set("country", country);
  if (wcOnly) params.set("worldChampionsOnly", "true");
  if (search.trim()) params.set("search", search.trim());

  const q = useQuery<ChampionsResponse>({
    queryKey: ["champions", params.toString()],
    queryFn: () => api(`/api/champions?${params.toString()}`),
    staleTime: 5 * 60_000,
  });

  const data = q.data;
  const total = data?.champions.length ?? 0;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-5">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <Crown className="w-6 h-6 text-amber-400" />
          <h1 className="text-3xl font-bold tracking-tight">Hall of Champions</h1>
        </div>
        <p className="text-muted-foreground max-w-2xl">
          Study the legends. Browse the world champions and most influential
          grandmasters of every era — their style, signature openings, famous
          games, and (for living players) one-click live scouting.
        </p>
        <div className="flex flex-wrap gap-2 text-xs">
          <Stat icon={Trophy} label="Champions" value={total} />
          <Stat icon={Crown} label="World Champions" value={data?.champions.filter((c) => c.isWorldChampion).length ?? 0} />
          <Stat icon={Star} label="Eras" value={data?.eras.length ?? 0} />
        </div>
      </header>

      {/* Era timeline ribbon */}
      <div>
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">Era timeline</div>
        <div className="grid grid-cols-3 md:grid-cols-7 gap-1.5">
          <EraChip
            label="All"
            count={data?.eras.reduce((s, e) => s + e.count, 0) ?? 0}
            active={era === "all"}
            color="#64748b"
            description="Every champion in the registry"
            onClick={() => setEra("all")}
          />
          {ERA_ORDER.map((id) => {
            const meta = data?.eras.find((e) => e.id === id);
            if (!meta) return null;
            return (
              <EraChip
                key={id}
                label={meta.label}
                count={meta.count}
                active={era === id}
                color={meta.color}
                description={meta.description}
                onClick={() => setEra(id === era ? "all" : id)}
              />
            );
          })}
        </div>
      </div>

      {/* Filter bar */}
      <Card>
        <CardContent className="p-3 grid md:grid-cols-[1fr_auto_auto_auto] gap-3 items-center">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search by name or country code (e.g. Carlsen, NO)…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <select
            value={style}
            onChange={(e) => setStyle(e.target.value as Style | "all")}
            className="h-9 rounded-md border border-input bg-card text-foreground px-2 text-sm"
          >
            <option value="all">All styles</option>
            {data?.styles.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label} ({s.count})
              </option>
            ))}
          </select>
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value as string | "all")}
            className="h-9 rounded-md border border-input bg-card text-foreground px-2 text-sm"
          >
            <option value="all">All countries</option>
            {data?.countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.emoji} {c.code} ({c.total})
              </option>
            ))}
          </select>
          <label className="inline-flex items-center gap-2 text-xs cursor-pointer text-muted-foreground hover:text-foreground">
            <input
              type="checkbox"
              checked={wcOnly}
              onChange={(e) => setWcOnly(e.target.checked)}
              className="rounded border-border"
            />
            World Champions only
          </label>
        </CardContent>
      </Card>

      {/* Champions grid */}
      {q.isLoading ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">Loading champions…</CardContent>
        </Card>
      ) : total === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground text-center">
            No champions match the current filters.
          </CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {data?.champions.map((c) => (
            <ChampionCard key={c.id} champion={c} stylesMeta={data.styles} erasMeta={data.eras} />
          ))}
        </div>
      )}

      {/* Country leaderboard */}
      {data && data.countries.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Country leaderboard
              </h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
              {data.countries.map((c) => (
                <button
                  key={c.code}
                  onClick={() => setCountry(country === c.code ? "all" : c.code)}
                  className={cn(
                    "flex items-center gap-2 rounded-md border p-2 text-left transition-colors",
                    country === c.code
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/40",
                  )}
                >
                  <span className="text-2xl leading-none">{c.emoji}</span>
                  <div className="text-xs">
                    <div className="font-bold">{c.code}</div>
                    <div className="text-muted-foreground">
                      {c.champions > 0 && (
                        <span className="inline-flex items-center gap-1 text-amber-400">
                          <Crown className="w-3 h-3" /> {c.champions}
                        </span>
                      )}
                      <span className="ml-1">· {c.total} legends</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ====================================================================== */
/*  Sub-components                                                         */
/* ====================================================================== */

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-md border border-border bg-card/50 px-3 py-1.5">
      <Icon className="w-3.5 h-3.5 text-muted-foreground" />
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-mono font-semibold">{value}</span>
    </div>
  );
}

function EraChip({
  label,
  count,
  active,
  color,
  description,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  color: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={description}
      className={cn(
        "rounded-md border p-2 text-left transition-all",
        active ? "ring-2 ring-offset-1 ring-offset-background" : "hover:border-primary/40",
      )}
      style={{
        borderColor: active ? color : undefined,
        backgroundColor: active ? `${color}22` : undefined,
        boxShadow: active ? `inset 0 -2px 0 0 ${color}` : undefined,
      }}
    >
      <div className="text-xs font-bold uppercase tracking-wider" style={{ color }}>
        {label}
      </div>
      <div className="text-[10px] text-muted-foreground">{count} legends</div>
    </button>
  );
}

function ChampionCard({
  champion,
  stylesMeta,
  erasMeta,
}: {
  champion: ChampionSummary;
  stylesMeta: StyleMeta[];
  erasMeta: EraMeta[];
}) {
  const eraColor = erasMeta.find((e) => e.id === champion.era)?.color ?? "#64748b";
  const isVintage = champion.era === "romantic" || champion.era === "classical" || champion.era === "hypermodern";

  return (
    <Link href={`/champions/${champion.id}`}>
      <Card
        className={cn(
          "h-full overflow-hidden cursor-pointer group transition-all",
          champion.isWorldChampion
            ? "border-amber-500/40 hover:border-amber-500/80 hover:shadow-[0_0_24px_-8px_rgba(251,191,36,0.6)]"
            : "hover:border-primary/60",
        )}
      >
        {/* Photo header */}
        <div
          className="relative aspect-[4/3] bg-secondary overflow-hidden"
          style={{
            background: `linear-gradient(135deg, ${eraColor}33, ${eraColor}11)`,
          }}
        >
          {champion.photoUrl ? (
            <img
              src={champion.photoUrl}
              alt={champion.displayName}
              loading="lazy"
              className={cn(
                "w-full h-full object-cover object-center transition-transform group-hover:scale-105",
                isVintage && "sepia-[0.35] contrast-[1.05]",
              )}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-5xl">
              {champion.countryEmoji}
            </div>
          )}
          {champion.isWorldChampion && (
            <div className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-black shadow-md">
              <Crown className="w-3 h-3" /> WC
            </div>
          )}
          <div className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded bg-black/60 backdrop-blur px-1.5 py-0.5 text-[10px] text-white">
            {champion.countryEmoji} {champion.countryCode}
          </div>
          <div
            className="absolute top-2 left-2 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
            style={{ backgroundColor: `${eraColor}cc`, color: "#fff" }}
          >
            {champion.era}
          </div>
        </div>

        <CardContent className="p-3 space-y-2">
          <div>
            <h3 className="font-bold text-sm leading-tight group-hover:text-primary transition-colors truncate">
              {champion.displayName}
            </h3>
            <div className="text-[10px] text-muted-foreground">
              {champion.born}{champion.died ? `–${champion.died}` : "–"} · peak <span className="font-mono font-semibold">{champion.peakRating}</span>
            </div>
          </div>

          {champion.championship && (
            <div className="text-[10px] text-amber-300 font-semibold leading-tight">
              {champion.championship}
            </div>
          )}

          <div className="flex flex-wrap gap-1">
            {champion.style.slice(0, 3).map((s) => {
              const meta = stylesMeta.find((m) => m.id === s);
              return (
                <Badge
                  key={s}
                  variant="outline"
                  className="text-[9px] uppercase tracking-wide px-1.5 py-0"
                  style={{
                    borderColor: `${meta?.color ?? "#64748b"}66`,
                    color: meta?.color ?? "#cbd5e1",
                    backgroundColor: `${meta?.color ?? "#64748b"}11`,
                  }}
                >
                  {meta?.label ?? s}
                </Badge>
              );
            })}
          </div>

          <div className="flex items-center gap-2 text-[10px] text-muted-foreground pt-1 border-t border-border">
            {champion.hasLiveAccount && (
              <span className="inline-flex items-center gap-0.5 text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Live
              </span>
            )}
            {champion.famousGameCount > 0 && (
              <span className="inline-flex items-center gap-0.5">
                <Sparkles className="w-3 h-3" /> {champion.famousGameCount} game{champion.famousGameCount > 1 ? "s" : ""}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
