import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Badge } from "@/components/ui/Badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { Chessboard } from "@/components/chess/Chessboard";
import { api } from "@/lib/queryClient";
import { track, Events } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { Chess } from "chess.js";
import { Link } from "wouter";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BookOpen,
  Calendar,
  ChevronRight,
  Crown,
  Download,
  ExternalLink,
  Eye,
  Flame,
  Globe,
  History,
  Layers,
  Lightbulb,
  RefreshCw,
  Search,
  Sparkles,
  Sword,
  Target,
  Trash2,
  TrendingUp,
  Trophy,
  User as UserIcon,
  Users,
} from "lucide-react";
import type {
  ScoutReport,
  OpeningNode,
  WDL,
  H2HEntry,
  OpeningRecord,
  RecentGameSummary,
  ScoutingRecommendation,
  CriticalPosition,
} from "../../../server/services/opponentScout";
import type { PlayerProfile } from "../../../server/services/playerProfile";

interface SavedReportSummary {
  id: string;
  platform: "chess.com" | "lichess";
  username: string;
  displayName: string;
  title: string | null;
  avatarUrl: string | null;
  gamesAnalyzed: number;
  generatedAt: string;
}

export default function OpponentPrep() {
  const qc = useQueryClient();
  const [activeReportId, setActiveReportId] = React.useState<string | null>(null);
  const [compareReportId, setCompareReportId] = React.useState<string | null>(null);

  const reportsList = useQuery<{ reports: SavedReportSummary[] }>({
    queryKey: ["scout", "reports"],
    queryFn: () => api("/api/opponent-prep/reports"),
    refetchInterval: false,
  });

  const activeReport = useQuery<ScoutReport>({
    queryKey: ["scout", "report", activeReportId],
    queryFn: () => api(`/api/opponent-prep/reports/${activeReportId}`),
    enabled: !!activeReportId,
  });
  const compareReport = useQuery<ScoutReport>({
    queryKey: ["scout", "report", compareReportId],
    queryFn: () => api(`/api/opponent-prep/reports/${compareReportId}`),
    enabled: !!compareReportId,
  });

  const onScouted = (id: string) => {
    setActiveReportId(id);
    qc.invalidateQueries({ queryKey: ["scout", "reports"] });
  };

  return (
    <div className="p-3 md:p-6 max-w-[1400px] mx-auto space-y-4">
      <header className="flex items-center gap-3">
        <Sword className="w-6 h-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Opponent Prep</h1>
          <p className="text-muted-foreground text-sm">
            Deep-scout an upcoming opponent — openings, weaknesses, recent
            form, head-to-head, and what to play against them.
          </p>
        </div>
      </header>

      <div className="grid lg:grid-cols-[280px_minmax(0,1fr)] gap-4">
        <div className="space-y-3">
          <ScoutForm onScouted={onScouted} />
          <SavedReportsList
            reports={reportsList.data?.reports ?? []}
            activeId={activeReportId}
            compareId={compareReportId}
            onSelect={(id) => {
              setActiveReportId(id);
              setCompareReportId(null);
            }}
            onCompare={(id) => setCompareReportId(id === compareReportId ? null : id)}
            onDelete={async (id) => {
              await api(`/api/opponent-prep/reports/${id}`, { method: "DELETE" });
              qc.invalidateQueries({ queryKey: ["scout", "reports"] });
              if (activeReportId === id) setActiveReportId(null);
              if (compareReportId === id) setCompareReportId(null);
            }}
          />
        </div>

        <div className="min-w-0">
          {!activeReportId ? (
            <EmptyState />
          ) : activeReport.isLoading ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                Loading scout report…
              </CardContent>
            </Card>
          ) : !activeReport.data ? (
            <Card>
              <CardContent className="p-6 text-sm text-destructive">
                Could not load report.
              </CardContent>
            </Card>
          ) : compareReport.data ? (
            <CompareView a={activeReport.data} b={compareReport.data} />
          ) : (
            <FullReport report={activeReport.data} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ====================================================================== */
/*  Scout form (with deep options)                                         */
/* ====================================================================== */

function ScoutForm({ onScouted }: { onScouted: (id: string) => void }) {
  const [username, setUsername] = React.useState("");
  const [platform, setPlatform] = React.useState<"chess.com" | "lichess">("chess.com");
  const [maxGames, setMaxGames] = React.useState(200);
  const [timeControl, setTimeControl] = React.useState<"any" | "bullet" | "blitz" | "rapid" | "classical">("any");
  const [period, setPeriod] = React.useState<"all" | "3m" | "6m" | "12m">("12m");
  const [forceRefresh, setForceRefresh] = React.useState(false);

  // Pick up "Scout live" handoff from the Hall of Champions detail page.
  React.useEffect(() => {
    try {
      const raw = sessionStorage.getItem("scout-prefill");
      if (!raw) return;
      const data = JSON.parse(raw) as { username: string; platform: "chess.com" | "lichess"; ts: number };
      // Only honor recent handoffs (last 30s) so a stale value doesn't keep refilling.
      if (Date.now() - data.ts < 30_000 && data.username) {
        setUsername(data.username);
        setPlatform(data.platform);
      }
      sessionStorage.removeItem("scout-prefill");
    } catch {
      /* ignore */
    }
  }, []);

  const scout = useMutation<ScoutReport, Error>({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        username: username.trim(),
        platform,
        maxGames,
        forceRefresh,
      };
      if (timeControl !== "any") body.timeControl = timeControl;
      if (period !== "all") {
        const months = period === "3m" ? 3 : period === "6m" ? 6 : 12;
        const d = new Date();
        d.setUTCMonth(d.getUTCMonth() - months);
        body.sinceMonth = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
        body.sinceMs = d.getTime();
      }
      return api("/api/opponent-prep/scout", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: (r) => {
      onScouted(r.id);
      setForceRefresh(false);
    },
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Search className="w-4 h-4" /> Scout an opponent
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <Label className="text-xs">Username</Label>
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. magnuscarlsen"
            onKeyDown={(e) => {
              if (e.key === "Enter" && username.trim()) scout.mutate();
            }}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Platform</Label>
          <Select value={platform} onValueChange={(v) => setPlatform(v as typeof platform)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="chess.com">Chess.com</SelectItem>
              <SelectItem value="lichess">Lichess</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Time control</Label>
            <Select value={timeControl} onValueChange={(v) => setTimeControl(v as typeof timeControl)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any</SelectItem>
                <SelectItem value="bullet">Bullet</SelectItem>
                <SelectItem value="blitz">Blitz</SelectItem>
                <SelectItem value="rapid">Rapid</SelectItem>
                <SelectItem value="classical">Classical</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Period</Label>
            <Select value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3m">3 months</SelectItem>
                <SelectItem value="6m">6 months</SelectItem>
                <SelectItem value="12m">12 months</SelectItem>
                <SelectItem value="all">All time</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs flex items-center justify-between">
            <span>Max games</span>
            <span className="text-muted-foreground font-mono">{maxGames}</span>
          </Label>
          <input
            type="range"
            min={50}
            max={1000}
            step={50}
            value={maxGames}
            onChange={(e) => setMaxGames(Number(e.target.value))}
            className="w-full accent-primary"
          />
        </div>

        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={forceRefresh}
            onChange={(e) => setForceRefresh(e.target.checked)}
            className="rounded border-border"
          />
          Force refresh (ignore 30&nbsp;min cache)
        </label>

        <Button
          className="w-full"
          onClick={() => scout.mutate()}
          disabled={!username.trim() || scout.isPending}
        >
          {scout.isPending ? (
            <>
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Scouting…
            </>
          ) : (
            <>
              <Sword className="w-4 h-4 mr-2" /> Scout
            </>
          )}
        </Button>
        {scout.isPending && (
          <p className="text-[10px] text-muted-foreground text-center">
            Pulling up to {maxGames} games — this may take 5–30s.
          </p>
        )}
        {scout.error && (
          <p className="text-xs text-destructive">{scout.error.message}</p>
        )}
      </CardContent>
    </Card>
  );
}

/* ====================================================================== */
/*  Saved reports sidebar                                                  */
/* ====================================================================== */

function SavedReportsList({
  reports,
  activeId,
  compareId,
  onSelect,
  onCompare,
  onDelete,
}: {
  reports: SavedReportSummary[];
  activeId: string | null;
  compareId: string | null;
  onSelect: (id: string) => void;
  onCompare: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (reports.length === 0) {
    return (
      <Card>
        <CardContent className="p-3 text-xs text-muted-foreground">
          Saved scouts appear here. Run your first one above.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Users className="w-3.5 h-3.5" /> Saved scouts ({reports.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="p-2 space-y-1">
        {reports.map((r) => (
          <div
            key={r.id}
            className={cn(
              "rounded-md border p-2 transition-colors group",
              activeId === r.id
                ? "border-primary bg-primary/10"
                : compareId === r.id
                  ? "border-amber-500/60 bg-amber-500/5"
                  : "border-border hover:border-primary/40",
            )}
          >
            <button
              onClick={() => onSelect(r.id)}
              className="w-full flex items-center gap-2 text-left"
            >
              {r.avatarUrl ? (
                <img
                  src={r.avatarUrl}
                  alt=""
                  className="w-7 h-7 rounded-full object-cover border border-border"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center">
                  <UserIcon className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate flex items-center gap-1">
                  {r.title && (
                    <span className="text-amber-400 text-[10px] font-bold">{r.title}</span>
                  )}
                  <span className="truncate">{r.displayName}</span>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {r.platform} • {r.gamesAnalyzed}g
                </div>
              </div>
            </button>
            <div className="flex items-center gap-1 mt-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => onCompare(r.id)}
                disabled={activeId === r.id}
                className="text-[10px] flex-1 px-1.5 py-0.5 rounded border border-border hover:border-amber-500/40 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {compareId === r.id ? "Stop compare" : "vs"}
              </button>
              <button
                onClick={() => onDelete(r.id)}
                className="px-1.5 py-0.5 rounded border border-border hover:border-destructive/60 hover:text-destructive"
                aria-label="Delete"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <Card className="h-full">
      <CardContent className="p-12 text-center space-y-3">
        <div className="inline-flex w-16 h-16 rounded-full bg-primary/10 items-center justify-center">
          <Target className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-xl font-bold">Pick your prey.</h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Enter an opponent's chess.com or lichess username to pull their last
          200+ games and generate a deep scouting report — openings, win rates,
          recent form, head-to-head records, and recommendations.
        </p>
      </CardContent>
    </Card>
  );
}

/* ====================================================================== */
/*  Full report view (tabbed)                                              */
/* ====================================================================== */

function FullReport({ report }: { report: ScoutReport }) {
  const [tab, setTab] = React.useState("overview");

  /** Open the server-rendered HTML one-pager in a new tab; the page
   *  auto-loads a "Print / Save as PDF" button so the user can use
   *  the browser's native print → save flow without bundling a
   *  headless Chrome. */
  function openPrintableReport() {
    const platform = report.profile.platform;
    const url = `/api/opponent/${encodeURIComponent(report.profile.username)}/report?platform=${platform}`;
    track(Events.OpponentReportOpen, { platform, username: report.profile.username });
    window.open(url, "_blank", "noopener");
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={openPrintableReport}>
          Open printable report ↗
        </Button>
      </div>
      <ProfileHeader profile={report.profile} report={report} />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="overview">
            <BarChart3 className="w-3.5 h-3.5 mr-1" /> Overview
          </TabsTrigger>
          <TabsTrigger value="openings">
            <BookOpen className="w-3.5 h-3.5 mr-1" /> Openings
          </TabsTrigger>
          <TabsTrigger value="style">
            <Layers className="w-3.5 h-3.5 mr-1" /> Style & Trends
          </TabsTrigger>
          <TabsTrigger value="recent">
            <Calendar className="w-3.5 h-3.5 mr-1" /> Recent
          </TabsTrigger>
          <TabsTrigger value="h2h">
            <Users className="w-3.5 h-3.5 mr-1" /> H2H
          </TabsTrigger>
          <TabsTrigger value="recs">
            <Lightbulb className="w-3.5 h-3.5 mr-1" /> Recommendations
          </TabsTrigger>
          <TabsTrigger value="games">
            <History className="w-3.5 h-3.5 mr-1" /> Games
          </TabsTrigger>
        </TabsList>
        <TabsContent value="overview"><OverviewTab report={report} /></TabsContent>
        <TabsContent value="openings"><OpeningsTab report={report} /></TabsContent>
        <TabsContent value="style"><StyleTab report={report} /></TabsContent>
        <TabsContent value="recent"><RecentTab report={report} /></TabsContent>
        <TabsContent value="h2h"><H2HTab report={report} /></TabsContent>
        <TabsContent value="recs"><RecommendationsTab report={report} /></TabsContent>
        <TabsContent value="games"><GamesTab report={report} /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ====================================================================== */
/*  Profile header                                                         */
/* ====================================================================== */

function ProfileHeader({ profile, report }: { profile: PlayerProfile; report: ScoutReport }) {
  const peakRating = Math.max(
    0,
    ...Object.values(profile.ratings).map((r) => r.best ?? r.current ?? 0),
  );
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-start gap-4">
          {profile.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt=""
              className="w-16 h-16 rounded-lg object-cover border border-border"
            />
          ) : (
            <div className="w-16 h-16 rounded-lg bg-secondary flex items-center justify-center">
              <UserIcon className="w-8 h-8 text-muted-foreground" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {profile.title && (
                <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 text-xs font-bold">
                  {profile.title}
                </span>
              )}
              <h2 className="text-2xl font-bold tracking-tight truncate">{profile.displayName}</h2>
              {profile.countryCode && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Globe className="w-3 h-3" /> {profile.countryCode}
                </span>
              )}
              <a
                href={profile.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
              >
                <ExternalLink className="w-3 h-3" /> {profile.platform}
              </a>
            </div>
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 max-w-2xl">
              {Object.entries(profile.ratings).map(([k, r]) => (
                <RatingPill key={k} label={k} current={r.current} best={r.best} games={r.games} />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
              {peakRating > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Crown className="w-3 h-3 text-amber-400" /> Peak {peakRating}
                </span>
              )}
              {profile.online && (
                <span className="inline-flex items-center gap-1 text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Online
                </span>
              )}
              {profile.joined && (
                <span>Joined {new Date(profile.joined).toLocaleDateString()}</span>
              )}
              {profile.lastSeen && (
                <span>Last seen {timeAgo(profile.lastSeen)}</span>
              )}
            </div>
          </div>
          <div className="text-right space-y-1">
            <div className="text-xs text-muted-foreground">Sample</div>
            <div className="text-2xl font-bold font-mono">{report.sample.total}</div>
            <div className="text-[10px] text-muted-foreground">games analyzed</div>
            {report.currentStreak.type !== "none" && report.currentStreak.length >= 2 && (
              <div className="mt-2 inline-flex items-center gap-1 text-xs">
                <Flame
                  className={cn(
                    "w-3 h-3",
                    report.currentStreak.type === "W" && "text-emerald-400",
                    report.currentStreak.type === "L" && "text-red-400",
                    report.currentStreak.type === "D" && "text-amber-400",
                  )}
                />
                {report.currentStreak.length}
                {report.currentStreak.type} streak
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RatingPill({
  label,
  current,
  best,
  games,
}: {
  label: string;
  current: number;
  best?: number;
  games?: number;
}) {
  return (
    <div className="rounded-md border border-border bg-card/50 px-2 py-1">
      <div className="text-[10px] text-muted-foreground capitalize">{label}</div>
      <div className="text-lg font-bold font-mono leading-tight">{current}</div>
      <div className="text-[10px] text-muted-foreground">
        {best && <span>peak {best}</span>}
        {games != null && <span> · {games}g</span>}
      </div>
    </div>
  );
}

/* ====================================================================== */
/*  Overview tab                                                           */
/* ====================================================================== */

function OverviewTab({ report }: { report: ScoutReport }) {
  return (
    <div className="grid md:grid-cols-2 gap-3 mt-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Win/Draw/Loss</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <WDLBlock label="Overall" wdl={report.wdl.overall} />
          <WDLBlock label="As white" wdl={report.wdl.asWhite} />
          <WDLBlock label="As black" wdl={report.wdl.asBlack} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">By time control</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {Object.entries(report.wdl.byTimeControl)
            .sort((a, b) => b[1].games - a[1].games)
            .map(([tc, w]) => (
              <WDLBlock key={tc} label={tc} wdl={w} />
            ))}
        </CardContent>
      </Card>
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" /> Scouting summary
          </CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-3">
          <SummaryStat label="Pet lines (5+ games)" value={report.petLines.length} icon={BookOpen} />
          <SummaryStat label="Surprise lines (≤2 games)" value={report.surpriseLines.length} icon={Sparkles} />
          <SummaryStat
            label="Top H2H opponents"
            value={report.headToHead.length}
            icon={Users}
          />
          <SummaryStat
            label="Critical positions repeated"
            value={report.criticalPositions.length}
            icon={Target}
          />
          <SummaryStat
            label="Recommendations vs him"
            value={report.recommendations.length}
            icon={Lightbulb}
          />
          <SummaryStat
            label="Date range"
            value={
              report.sample.dateFrom && report.sample.dateTo
                ? `${new Date(report.sample.dateFrom).toLocaleDateString()} → ${new Date(report.sample.dateTo).toLocaleDateString()}`
                : "—"
            }
            icon={Calendar}
            small
          />
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  icon: Icon,
  small,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  small?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-card/50 p-2.5">
      <Icon className="w-4 h-4 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={cn("font-bold font-mono", small ? "text-xs" : "text-lg")}>
          {value}
        </div>
      </div>
    </div>
  );
}

/* ====================================================================== */
/*  WDL bar                                                                */
/* ====================================================================== */

function WDLBlock({ label, wdl }: { label: string; wdl: WDL }) {
  const { wins, draws, losses, games, score } = wdl;
  if (games === 0) {
    return (
      <div className="text-xs text-muted-foreground">
        {label}: <span className="font-mono">no games</span>
      </div>
    );
  }
  const w = (wins / games) * 100;
  const d = (draws / games) * 100;
  const l = (losses / games) * 100;
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs mb-1">
        <span className="capitalize text-muted-foreground">{label}</span>
        <span className="font-mono">
          {wins}W <span className="text-muted-foreground">{draws}D</span> {losses}L
          <span className="ml-2 text-foreground/80">{Math.round(score * 100)}%</span>
          <span className="text-muted-foreground ml-1">({games})</span>
        </span>
      </div>
      <div className="h-2 w-full rounded-full overflow-hidden border border-border bg-card flex">
        <div className="bg-emerald-500" style={{ width: `${w}%` }} title={`Wins ${wins}`} />
        <div className="bg-zinc-500" style={{ width: `${d}%` }} title={`Draws ${draws}`} />
        <div className="bg-red-500" style={{ width: `${l}%` }} title={`Losses ${losses}`} />
      </div>
    </div>
  );
}

/* ====================================================================== */
/*  Openings tab — interactive explorer                                    */
/* ====================================================================== */

function OpeningsTab({ report }: { report: ScoutReport }) {
  const [color, setColor] = React.useState<"white" | "black">("white");
  const tree = color === "white" ? report.openingTreeWhite : report.openingTreeBlack;
  return (
    <div className="grid lg:grid-cols-2 gap-3 mt-3">
      <Card className="lg:col-span-2">
        <CardContent className="p-3 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Show their games as:</span>
          <div className="inline-flex rounded-md overflow-hidden border border-border">
            <button
              onClick={() => setColor("white")}
              className={cn(
                "px-3 py-1 text-xs font-semibold",
                color === "white" ? "bg-primary text-primary-foreground" : "hover:bg-secondary",
              )}
            >
              ♔ White ({report.openingTreeWhite.count})
            </button>
            <button
              onClick={() => setColor("black")}
              className={cn(
                "px-3 py-1 text-xs font-semibold",
                color === "black" ? "bg-primary text-primary-foreground" : "hover:bg-secondary",
              )}
            >
              ♚ Black ({report.openingTreeBlack.count})
            </button>
          </div>
        </CardContent>
      </Card>
      <Card className="lg:col-span-2">
        <CardContent className="p-3">
          <OpeningExplorer root={tree} reportId={report.id} userColor={color} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <BookOpen className="w-4 h-4" /> Pet lines (well-prepared)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {report.petLines.length === 0 ? (
            <p className="text-xs text-muted-foreground">No openings with 5+ games yet.</p>
          ) : (
            report.petLines.map((o) => <OpeningRow key={o.name} opening={o} />)
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" /> Surprise lines (1–2 games)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {report.surpriseLines.length === 0 ? (
            <p className="text-xs text-muted-foreground">No rare openings to surprise with.</p>
          ) : (
            report.surpriseLines.map((o) => <OpeningRow key={o.name} opening={o} />)
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function OpeningRow({ opening }: { opening: OpeningRecord }) {
  const total = opening.count;
  const score = Math.round(opening.score * 100);
  return (
    <div className="text-xs">
      <div className="flex items-center gap-2 mb-0.5">
        <span className="flex-1 truncate">{opening.name}</span>
        <span className="font-mono text-muted-foreground">{total}g</span>
        <span className="font-mono">{score}%</span>
      </div>
      <div className="h-1 w-full rounded overflow-hidden border border-border bg-card flex">
        <div className="bg-emerald-500" style={{ width: `${(opening.wins / total) * 100}%` }} />
        <div className="bg-zinc-500" style={{ width: `${(opening.draws / total) * 100}%` }} />
        <div className="bg-red-500" style={{ width: `${(opening.losses / total) * 100}%` }} />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Interactive opening explorer (board + sorted move list)                */
/* ---------------------------------------------------------------------- */

function OpeningExplorer({
  root,
  reportId,
  userColor,
}: {
  root: OpeningNode;
  reportId: string;
  userColor: "white" | "black";
}) {
  // The path is an array of SAN moves we've drilled down into.
  const [path, setPath] = React.useState<string[]>([]);

  const node = React.useMemo(() => {
    let cur: OpeningNode = root;
    for (const m of path) {
      const next = cur.children[m];
      if (!next) return cur;
      cur = next;
    }
    return cur;
  }, [root, path]);

  const children = React.useMemo(() => {
    return Object.values(node.children).sort((a, b) => b.count - a.count);
  }, [node]);

  const fen = node.fen;
  const orientation: "white" | "black" = userColor;

  return (
    <div className="grid md:grid-cols-[minmax(0,1fr)_300px] gap-3">
      <div>
        <div className="max-w-[480px] mx-auto md:mx-0">
          <Chessboard fen={fen} orientation={orientation} />
        </div>
        <div className="mt-2 flex items-center gap-2 text-xs flex-wrap">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPath((p) => p.slice(0, -1))}
            disabled={path.length === 0}
          >
            <ArrowLeft className="w-3 h-3 mr-1" /> Back
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setPath([])}
            disabled={path.length === 0}
          >
            Reset
          </Button>
          <span className="text-muted-foreground font-mono truncate flex-1 min-w-0">
            {path.length === 0 ? "Start position" : path.join(" ")}
          </span>
          {path.length > 0 && (
            <a
              href={`/api/opponent-prep/reports/${encodeURIComponent(reportId)}/pgn?moves=${encodeURIComponent(path.join(","))}`}
              download={`${reportId}-${path.join("-")}.pgn`}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
            >
              <Download className="w-3 h-3" /> PGN
            </a>
          )}
        </div>
      </div>
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center justify-between">
          <span>Moves played here</span>
          <span className="font-mono">{node.count} games</span>
        </div>
        <div className="border border-border rounded-md overflow-hidden divide-y divide-border max-h-[420px] overflow-y-auto">
          {children.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground text-center">
              No further branches in the sample.
            </div>
          ) : (
            children.map((c) => (
              <button
                key={c.san}
                onClick={() => setPath((p) => [...p, c.san])}
                className="w-full p-2 hover:bg-secondary text-left"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono font-bold text-sm">{c.san}</span>
                  <span className="text-xs text-muted-foreground">×{c.count}</span>
                  <span className="text-xs ml-auto font-mono">
                    {Math.round(((c.wins + c.draws * 0.5) / c.count) * 100)}%
                  </span>
                  <ChevronRight className="w-3 h-3 text-muted-foreground" />
                </div>
                <div className="h-1 w-full rounded overflow-hidden border border-border bg-card flex">
                  <div className="bg-emerald-500" style={{ width: `${(c.wins / c.count) * 100}%` }} />
                  <div className="bg-zinc-500" style={{ width: `${(c.draws / c.count) * 100}%` }} />
                  <div className="bg-red-500" style={{ width: `${(c.losses / c.count) * 100}%` }} />
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/* ====================================================================== */
/*  Style & Trends tab                                                     */
/* ====================================================================== */

function StyleTab({ report }: { report: ScoutReport }) {
  return (
    <div className="grid md:grid-cols-2 gap-3 mt-3">
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="w-4 h-4" /> Rating trajectory
          </CardTitle>
        </CardHeader>
        <CardContent>
          <RatingChart points={report.ratingTrajectory} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Repertoire shifts (white)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          {report.repertoireShifts.length === 0 ? (
            <p className="text-muted-foreground">Not enough dated games.</p>
          ) : (
            report.repertoireShifts.slice(-12).map((m) => (
              <div key={m.month} className="flex items-center gap-2">
                <span className="font-mono text-muted-foreground w-16">{m.month}</span>
                <div className="flex-1 flex flex-wrap gap-1">
                  {m.topMoves.map((mv) => (
                    <Badge key={mv.san} variant="outline" className="font-mono text-[10px]">
                      {mv.san} ×{mv.count}
                    </Badge>
                  ))}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Target className="w-4 h-4" /> Critical positions repeated
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {report.criticalPositions.length === 0 ? (
            <p className="text-xs text-muted-foreground">No positions reached 3+ times.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {report.criticalPositions.slice(0, 6).map((p) => (
                <CriticalPositionCard key={p.fen} pos={p} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CriticalPositionCard({ pos }: { pos: CriticalPosition }) {
  return (
    <div className="border border-border rounded-md overflow-hidden bg-card">
      <MiniBoard fen={pos.fen} />
      <div className="p-1.5 text-[10px]">
        <div className="font-mono">×{pos.count} games · move {pos.moveNumber}</div>
        <div className="text-muted-foreground">{Math.round(pos.score * 100)}% score</div>
      </div>
    </div>
  );
}

function MiniBoard({ fen }: { fen: string }) {
  const board = React.useMemo(() => parseFenToBoard(fen), [fen]);
  return (
    <div className="grid grid-cols-8 w-full aspect-square">
      {board.flatMap((row, r) =>
        row.map((piece, c) => {
          const isLight = (r + c) % 2 === 1;
          return (
            <div
              key={`${r}-${c}`}
              className="flex items-center justify-center text-base sm:text-lg font-serif select-none"
              style={{
                backgroundColor: isLight ? "#eeeed2" : "#769656",
                color: piece && piece === piece.toUpperCase() ? "#fff" : "#111",
                textShadow:
                  piece && piece === piece.toUpperCase()
                    ? "0 0 2px #000"
                    : undefined,
                lineHeight: 1,
              }}
            >
              {piece ? PIECE_GLYPH[piece] : ""}
            </div>
          );
        }),
      )}
    </div>
  );
}

const PIECE_GLYPH: Record<string, string> = {
  K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙",
  k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟",
};

function parseFenToBoard(fen: string): (string | null)[][] {
  const piecePart = fen.split(" ")[0];
  const ranks = piecePart.split("/");
  const board: (string | null)[][] = [];
  for (const rank of ranks) {
    const row: (string | null)[] = [];
    for (const ch of rank) {
      if (/[1-8]/.test(ch)) for (let i = 0; i < Number(ch); i++) row.push(null);
      else row.push(ch);
    }
    board.push(row);
  }
  return board;
}

/* ---------------------------------------------------------------------- */
/*  Rating trajectory mini-chart                                           */
/* ---------------------------------------------------------------------- */

function RatingChart({ points }: { points: ScoutReport["ratingTrajectory"] }) {
  if (points.length === 0) {
    return <p className="text-xs text-muted-foreground">No rating data in sample.</p>;
  }
  const min = Math.min(...points.map((p) => p.avgRating));
  const max = Math.max(...points.map((p) => p.avgRating));
  const range = Math.max(1, max - min);
  const W = 600;
  const H = 140;
  const stepX = points.length > 1 ? W / (points.length - 1) : W;
  const path = points
    .map((p, i) => {
      const x = i * stepX;
      const y = H - ((p.avgRating - min) / range) * (H - 20) - 10;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="none">
        <path d={path} fill="none" stroke="hsl(217 91% 60%)" strokeWidth={2} />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={i * stepX}
            cy={H - ((p.avgRating - min) / range) * (H - 20) - 10}
            r={2.5}
            fill="hsl(217 91% 60%)"
          />
        ))}
      </svg>
      <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
        <span>{points[0].month} • {min}</span>
        <span>{points[points.length - 1].month} • {max}</span>
      </div>
    </div>
  );
}

/* ====================================================================== */
/*  Recent tab                                                             */
/* ====================================================================== */

function RecentTab({ report }: { report: ScoutReport }) {
  const [viewing, setViewing] = React.useState<RecentGameSummary | null>(null);
  return (
    <>
      <Card className="mt-3">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Last {report.recent.length} games</CardTitle>
        </CardHeader>
        <CardContent className="p-2">
          <div className="space-y-1">
            {report.recent.map((g) => (
              <RecentGameRow key={g.id} game={g} onView={() => setViewing(g)} />
            ))}
          </div>
        </CardContent>
      </Card>
      <GameViewerModal game={viewing} onClose={() => setViewing(null)} />
    </>
  );
}

function RecentGameRow({
  game,
  onView,
}: {
  game: RecentGameSummary;
  onView: () => void;
}) {
  const resultGlyph = game.myScore === 1 ? "✓" : game.myScore === 0 ? "✗" : "=";
  const resultColor =
    game.myScore === 1
      ? "text-emerald-400 bg-emerald-500/10"
      : game.myScore === 0
        ? "text-red-400 bg-red-500/10"
        : "text-amber-400 bg-amber-500/10";
  return (
    <button
      onClick={onView}
      className="w-full grid grid-cols-[24px_60px_minmax(0,1fr)_auto_auto] items-center gap-2 text-xs px-2 py-1.5 rounded hover:bg-secondary transition-colors text-left"
    >
      <span className={cn("inline-flex w-6 h-6 items-center justify-center rounded font-bold", resultColor)}>
        {resultGlyph}
      </span>
      <span className="text-muted-foreground capitalize text-[10px]">
        {game.color === "white" ? "♔ white" : "♚ black"}
      </span>
      <span className="truncate">
        vs <span className="text-foreground font-semibold">{game.opponent}</span>
        {game.opponentRating ? <span className="text-muted-foreground"> ({game.opponentRating})</span> : null}
        {game.opening && <span className="text-muted-foreground"> · {game.opening}</span>}
      </span>
      <span className="text-muted-foreground text-[10px] capitalize">{game.timeControl}</span>
      <span className="text-muted-foreground text-[10px]">
        {game.playedAt ? new Date(game.playedAt).toLocaleDateString() : "—"}
      </span>
    </button>
  );
}

/* ====================================================================== */
/*  H2H tab                                                                */
/* ====================================================================== */

function H2HTab({ report }: { report: ScoutReport }) {
  return (
    <Card className="mt-3">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Top opponents (2+ games)</CardTitle>
      </CardHeader>
      <CardContent className="p-3 space-y-2">
        {report.headToHead.length === 0 ? (
          <p className="text-xs text-muted-foreground">No repeat opponents in this sample.</p>
        ) : (
          report.headToHead.map((h) => <H2HRow key={h.opponent} entry={h} />)
        )}
      </CardContent>
    </Card>
  );
}

function H2HRow({ entry }: { entry: H2HEntry }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(120px,180px)_60px] items-center gap-3 text-xs">
      <span className="truncate font-semibold">{entry.opponent}</span>
      <span className="font-mono text-muted-foreground">{entry.games}g</span>
      <div className="h-2 w-full rounded-full overflow-hidden border border-border bg-card flex">
        <div className="bg-emerald-500" style={{ width: `${(entry.wins / entry.games) * 100}%` }} title={`${entry.wins} wins`} />
        <div className="bg-zinc-500" style={{ width: `${(entry.draws / entry.games) * 100}%` }} title={`${entry.draws} draws`} />
        <div className="bg-red-500" style={{ width: `${(entry.losses / entry.games) * 100}%` }} title={`${entry.losses} losses`} />
      </div>
      <span className="font-mono text-right">{Math.round(entry.score * 100)}%</span>
    </div>
  );
}

/* ====================================================================== */
/*  Recommendations tab                                                    */
/* ====================================================================== */

function RecommendationsTab({ report }: { report: ScoutReport }) {
  return (
    <Card className="mt-3">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-amber-400" /> What to play vs{" "}
          {report.profile.displayName}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {report.recommendations.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No clear weaknesses found in this sample. Pull more games or try a
            different time control.
          </p>
        ) : (
          report.recommendations.map((r) => <RecommendationRow key={r.opening + r.color} rec={r} />)
        )}
      </CardContent>
    </Card>
  );
}

function RecommendationRow({ rec }: { rec: ScoutingRecommendation }) {
  return (
    <div className="border border-border rounded-md p-3 hover:border-amber-500/40 transition-colors">
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "w-9 h-9 rounded-md flex items-center justify-center font-bold text-sm shrink-0",
            rec.color === "white"
              ? "bg-zinc-200 text-zinc-900"
              : "bg-zinc-900 text-zinc-100",
          )}
        >
          {rec.color === "white" ? "♔" : "♚"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm">{rec.opening}</div>
          <div className="text-xs text-muted-foreground">{rec.reason}</div>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold font-mono text-emerald-400">
            {Math.round((1 - rec.oppScore) * 100)}%
          </div>
          <div className="text-[10px] text-muted-foreground">your edge</div>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Link href="/openings">
          <Button size="sm" variant="outline" className="text-xs">
            <BookOpen className="w-3 h-3 mr-1" /> Find in trainer
            <ArrowRight className="w-3 h-3 ml-1" />
          </Button>
        </Link>
        <span className="text-[10px] text-muted-foreground">
          He plays as {rec.color === "white" ? "black" : "white"} in this line.
        </span>
      </div>
    </div>
  );
}

/* ====================================================================== */
/*  Games tab                                                              */
/* ====================================================================== */

function GamesTab({ report }: { report: ScoutReport }) {
  const [viewing, setViewing] = React.useState<RecentGameSummary | null>(null);
  return (
    <>
      <Card className="mt-3">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">All sampled games ({report.recent.length} of {report.sample.total} shown)</CardTitle>
        </CardHeader>
        <CardContent className="p-2 space-y-1 max-h-[60vh] overflow-y-auto">
          {report.recent.map((g) => (
            <RecentGameRow key={g.id} game={g} onView={() => setViewing(g)} />
          ))}
          <p className="text-[10px] text-muted-foreground p-2">
            Tip: drill into the Openings tab and download a PGN of any branch.
          </p>
        </CardContent>
      </Card>
      <GameViewerModal game={viewing} onClose={() => setViewing(null)} />
    </>
  );
}

/* ====================================================================== */
/*  Game viewer modal                                                      */
/* ====================================================================== */

function GameViewerModal({
  game,
  onClose,
}: {
  game: RecentGameSummary | null;
  onClose: () => void;
}) {
  const [moveIdx, setMoveIdx] = React.useState(0);
  const moves = React.useMemo(() => {
    if (!game) return [] as { san: string; from: string; to: string }[];
    try {
      const c = new Chess();
      c.loadPgn(game.pgn);
      return c.history({ verbose: true }).map((m) => ({ san: m.san, from: m.from, to: m.to }));
    } catch {
      return [];
    }
  }, [game]);

  const fen = React.useMemo(() => {
    if (!game) return "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const c = new Chess();
    try {
      c.loadPgn(game.pgn);
    } catch {
      return c.fen();
    }
    const verbose = c.history({ verbose: true });
    const replay = new Chess();
    for (let i = 0; i < Math.min(moveIdx, verbose.length); i++) {
      replay.move({ from: verbose[i].from, to: verbose[i].to, promotion: verbose[i].promotion });
    }
    return replay.fen();
  }, [game, moveIdx]);

  React.useEffect(() => {
    if (game) setMoveIdx(moves.length);
  }, [game, moves.length]);

  if (!game) return null;
  const lastMove = moveIdx > 0 ? ([moves[moveIdx - 1].from, moves[moveIdx - 1].to] as [string, string]) : undefined;

  return (
    <Dialog open={!!game} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-base">
            {game.color === "white" ? "♔" : "♚"} vs {game.opponent}
            {game.opponentRating ? ` (${game.opponentRating})` : ""} — {game.result ?? "*"}
            {game.opening && <span className="text-muted-foreground text-sm ml-2">{game.opening}</span>}
          </DialogTitle>
        </DialogHeader>
        <div className="grid sm:grid-cols-[minmax(0,1fr)_240px] gap-3">
          <div>
            <Chessboard fen={fen} orientation={game.color} lastMove={lastMove} />
            <div className="flex items-center gap-1 mt-2">
              <Button size="icon" variant="outline" onClick={() => setMoveIdx(0)}>⏮</Button>
              <Button size="icon" variant="outline" onClick={() => setMoveIdx((i) => Math.max(0, i - 1))}>
                <ArrowLeft className="w-3.5 h-3.5" />
              </Button>
              <Button size="icon" variant="outline" onClick={() => setMoveIdx((i) => Math.min(moves.length, i + 1))}>
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
              <Button size="icon" variant="outline" onClick={() => setMoveIdx(moves.length)}>⏭</Button>
              <span className="text-xs text-muted-foreground ml-auto">
                Move {moveIdx} / {moves.length}
              </span>
            </div>
          </div>
          <div className="text-xs">
            <div className="font-semibold mb-1">Moves</div>
            <div className="border border-border rounded-md p-2 max-h-[400px] overflow-y-auto grid grid-cols-[auto_1fr_1fr] gap-x-2 gap-y-0.5 font-mono tabular-nums">
              {Array.from({ length: Math.ceil(moves.length / 2) }).map((_, i) => {
                const w = moves[i * 2];
                const b = moves[i * 2 + 1];
                return (
                  <React.Fragment key={i}>
                    <span className="text-muted-foreground">{i + 1}.</span>
                    <button
                      className={cn(
                        "px-1 text-left rounded hover:bg-secondary",
                        moveIdx === i * 2 + 1 && "bg-primary/20",
                      )}
                      onClick={() => setMoveIdx(i * 2 + 1)}
                    >
                      {w?.san ?? ""}
                    </button>
                    <button
                      className={cn(
                        "px-1 text-left rounded hover:bg-secondary",
                        moveIdx === i * 2 + 2 && "bg-primary/20",
                      )}
                      onClick={() => b && setMoveIdx(i * 2 + 2)}
                    >
                      {b?.san ?? ""}
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
            <div className="mt-2 text-[10px] text-muted-foreground space-y-0.5">
              <div>Played: {game.playedAt ? new Date(game.playedAt).toLocaleString() : "—"}</div>
              <div>Time control: {game.timeControl ?? "—"}</div>
              <div>ECO: {game.eco ?? "—"}</div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ====================================================================== */
/*  Compare view                                                           */
/* ====================================================================== */

function CompareView({ a, b }: { a: ScoutReport; b: ScoutReport }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Users className="w-4 h-4" /> Comparing scouts
        </CardTitle>
      </CardHeader>
      <CardContent className="grid md:grid-cols-2 gap-3">
        <CompareColumn report={a} />
        <CompareColumn report={b} />
      </CardContent>
    </Card>
  );
}

function CompareColumn({ report }: { report: ScoutReport }) {
  return (
    <div className="space-y-3 border border-border rounded-md p-3">
      <div className="flex items-center gap-2">
        {report.profile.avatarUrl && (
          <img src={report.profile.avatarUrl} alt="" className="w-8 h-8 rounded" />
        )}
        <div className="min-w-0">
          <div className="font-bold flex items-center gap-1">
            {report.profile.title && (
              <span className="text-amber-400 text-xs">{report.profile.title}</span>
            )}
            <span className="truncate">{report.profile.displayName}</span>
          </div>
          <div className="text-[10px] text-muted-foreground">
            {report.profile.platform} · {report.sample.total} games
          </div>
        </div>
      </div>
      <WDLBlock label="Overall" wdl={report.wdl.overall} />
      <WDLBlock label="As white" wdl={report.wdl.asWhite} />
      <WDLBlock label="As black" wdl={report.wdl.asBlack} />
      <div>
        <div className="text-xs font-semibold mb-1">Pet lines</div>
        <div className="space-y-1">
          {report.petLines.slice(0, 5).map((o) => (
            <OpeningRow key={o.name} opening={o} />
          ))}
        </div>
      </div>
      <div>
        <div className="text-xs font-semibold mb-1">Recommendations vs him</div>
        {report.recommendations.length === 0 ? (
          <p className="text-[10px] text-muted-foreground">No clear weaknesses.</p>
        ) : (
          <div className="space-y-1.5">
            {report.recommendations.slice(0, 3).map((r) => (
              <div key={r.opening} className="text-xs flex items-center gap-2">
                <span className={cn("text-[10px] px-1 rounded", r.color === "white" ? "bg-zinc-200 text-zinc-900" : "bg-zinc-900 text-zinc-100 border border-border")}>
                  {r.color === "white" ? "♔" : "♚"}
                </span>
                <span className="flex-1 truncate">{r.opening}</span>
                <span className="font-mono text-emerald-400">{Math.round((1 - r.oppScore) * 100)}%</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ====================================================================== */
/*  Misc helpers                                                           */
/* ====================================================================== */

function timeAgo(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

void Eye; // keep alive
