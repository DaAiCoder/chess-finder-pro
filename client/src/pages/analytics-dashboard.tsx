import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
  PieChart, Pie, Cell,
} from "recharts";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Badge } from "@/components/ui/Badge";
import { Progress } from "@/components/ui/Progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import { api } from "@/lib/queryClient";
import type { Game } from "@shared/schema";
import type { AnalyticsBucket, SkillScores } from "../../../server/services/analyticsComputer";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  Cpu,
  Flame,
  Gauge,
  Goal,
  Loader2,
  Sparkles,
  Target,
  Timer,
  XCircle,
} from "lucide-react";

const PERIODS = [
  { label: "7d", days: 7 }, { label: "14d", days: 14 }, { label: "1mo", days: 30 },
  { label: "3mo", days: 90 }, { label: "6mo", days: 180 }, { label: "1yr", days: 365 },
  { label: "All", days: 0 },
];

interface AnalyticsResponse {
  buckets: AnalyticsBucket[];
  wins: number; draws: number; losses: number;
  current: SkillScores; delta: SkillScores;
  /** Personal rolling baseline ("your past self") — replaces 1800/2100. */
  baseline: SkillScores;
  ratingMin: number; ratingMax: number;
  games: Game[];
}

type SkillKey = keyof SkillScores;

interface SkillMeta {
  key: SkillKey;
  title: string;
  /** Path the PRACTICE / Start drill button lands on. */
  practicePath: string;
  /** Slug used by the WeaknessBanner on the trainer page. */
  weaknessSlug: string;
  icon: React.ComponentType<{ className?: string }>;
}

const SKILL_META: Record<SkillKey, SkillMeta> = {
  advantageCapitalization: {
    key: "advantageCapitalization",
    title: "Advantage Capitalization",
    practicePath: "/training/advantage",
    weaknessSlug: "advantage-capitalization",
    icon: Gauge,
  },
  opening: {
    key: "opening",
    title: "Opening",
    practicePath: "/training/opening-improver",
    weaknessSlug: "opening",
    icon: Goal,
  },
  tactics: {
    key: "tactics",
    title: "Tactics",
    practicePath: "/training/tactics",
    weaknessSlug: "tactics",
    icon: Sparkles,
  },
  timeManagement: {
    key: "timeManagement",
    title: "Time Management",
    practicePath: "/training/time-pressure",
    weaknessSlug: "time-management",
    icon: Timer,
  },
  resourcefulness: {
    key: "resourcefulness",
    title: "Resourcefulness",
    practicePath: "/training/blunder-preventer",
    weaknessSlug: "resourcefulness",
    icon: Target,
  },
  endgame: {
    key: "endgame",
    title: "Endgame",
    practicePath: "/training/endgame",
    weaknessSlug: "endgame",
    icon: Flame,
  },
};

const SKILL_ORDER: SkillKey[] = [
  "advantageCapitalization",
  "opening",
  "tactics",
  "timeManagement",
  "resourcefulness",
  "endgame",
];

interface BatchJob {
  status: "idle" | "running" | "done" | "cancelled";
  total?: number;
  analyzed?: number;
  generated?: number;
  failed?: number;
  username?: string;
  currentGameId?: number | null;
}

export default function AnalyticsDashboard() {
  const [username, setUsername] = React.useState("");
  const [activeUsername, setActiveUsername] = React.useState("");
  const [periodIdx, setPeriodIdx] = React.useState(2);
  const queryClient = useQueryClient();

  const data = useQuery<AnalyticsResponse>({
    queryKey: ["analytics", activeUsername],
    queryFn: () => api(`/api/analytics?username=${encodeURIComponent(activeUsername)}`),
    enabled: !!activeUsername,
  });

  /* ---------- background batch analysis ---------- */

  // Fire-and-forget POST when a username's analytics first lands. We use a
  // mutation rather than a query so it only runs once per `activeUsername`.
  const startBatch = useMutation({
    mutationFn: (u: string) =>
      api<{ queued: number; job: BatchJob }>("/api/analytics/analyze-batch", {
        method: "POST",
        body: JSON.stringify({ username: u, max: 40 }),
      }),
  });
  const lastTriggeredFor = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!data.data || !activeUsername) return;
    if (lastTriggeredFor.current === activeUsername) return;
    lastTriggeredFor.current = activeUsername;
    startBatch.mutate(activeUsername);
  }, [data.data, activeUsername, startBatch]);

  // Poll status while running (every 2s); stop on done/cancelled/idle.
  const status = useQuery<BatchJob>({
    queryKey: ["analyze-batch-status"],
    queryFn: () => api("/api/analytics/analyze-batch/status"),
    enabled: !!activeUsername,
    refetchInterval: (q) => {
      const s = (q.state.data as BatchJob | undefined)?.status;
      return s === "running" ? 2000 : false;
    },
  });

  // When the batch finishes, refresh the analytics so engine-backed scores
  // replace the heuristic estimates.
  const lastSeenStatus = React.useRef<BatchJob["status"] | null>(null);
  React.useEffect(() => {
    const s = status.data?.status;
    if (!s) return;
    if (lastSeenStatus.current === "running" && (s === "done" || s === "cancelled")) {
      queryClient.invalidateQueries({ queryKey: ["analytics", activeUsername] });
    }
    lastSeenStatus.current = s;
  }, [status.data?.status, queryClient, activeUsername]);

  const cancelBatch = useMutation({
    mutationFn: () =>
      api("/api/analytics/analyze-batch/cancel", { method: "POST" }),
    onSuccess: () => status.refetch(),
  });

  /* ---------- period filter ---------- */

  const filtered = React.useMemo(() => {
    if (!data.data) return null;
    const cutoff = PERIODS[periodIdx].days
      ? Date.now() - PERIODS[periodIdx].days * 86400 * 1000
      : 0;
    const buckets = data.data.buckets.filter((b) => new Date(b.date).getTime() >= cutoff);
    return { ...data.data, buckets };
  }, [data.data, periodIdx]);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-muted-foreground text-sm">Skill scores across your imported games.</p>
      </div>

      <Card>
        <CardContent className="p-4 flex items-end gap-3">
          <div className="flex-1">
            <Label>Username</Label>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="The username you imported games for"
              onKeyDown={(e) => {
                if (e.key === "Enter" && username.trim()) setActiveUsername(username.trim());
              }}
            />
          </div>
          <Button onClick={() => setActiveUsername(username.trim())} disabled={!username.trim()}>
            Analyze
          </Button>
        </CardContent>
      </Card>

      {activeUsername && status.data && (
        <BatchProgressBar
          job={status.data}
          onCancel={() => cancelBatch.mutate()}
          cancelling={cancelBatch.isPending}
        />
      )}

      {filtered && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {PERIODS.map((p, i) => (
              <Button
                key={p.label}
                variant={i === periodIdx ? "default" : "outline"}
                size="sm"
                onClick={() => setPeriodIdx(i)}
              >
                {p.label}
              </Button>
            ))}
          </div>

          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="games">Game History</TabsTrigger>
              <TabsTrigger value="scouting">Scouting</TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="space-y-4">
              <PersonalizedTrainingPlan
                current={filtered.current}
                delta={filtered.delta}
                baseline={filtered.baseline}
                buckets={filtered.buckets}
                username={activeUsername}
              />

              <div className="grid lg:grid-cols-3 gap-4">
                <Card className="lg:col-span-2">
                  <CardHeader><CardTitle className="text-base">Rating</CardTitle></CardHeader>
                  <CardContent>
                    <RatingChart buckets={filtered.buckets} ratingMin={filtered.ratingMin} ratingMax={filtered.ratingMax} />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle className="text-base">Games</CardTitle></CardHeader>
                  <CardContent>
                    <ResultsDonut wins={filtered.wins} draws={filtered.draws} losses={filtered.losses} />
                  </CardContent>
                </Card>
              </div>

              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {SKILL_ORDER.map((k) => (
                  <SkillCard
                    key={k}
                    meta={SKILL_META[k]}
                    buckets={filtered.buckets}
                    current={filtered.current[k]}
                    delta={filtered.delta[k]}
                    baseline={filtered.baseline[k]}
                    username={activeUsername}
                  />
                ))}
              </div>
            </TabsContent>
            <TabsContent value="games">
              <GameHistoryList games={filtered.games} />
            </TabsContent>
            <TabsContent value="scouting">
              <Card>
                <CardContent className="p-6 space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Want to scout a specific opponent? Head to the Opponent Prep page.
                  </p>
                  <Link href="/opponent-prep">
                    <Button>Open Opponent Prep</Button>
                  </Link>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

/* ====================================================================== */
/*  Personalized training plan                                             */
/* ====================================================================== */

interface PlanRow {
  meta: SkillMeta;
  current: number;
  delta: number;
  diagnosis: string;
  urgency: "high" | "medium" | "low";
}

function PersonalizedTrainingPlan({
  current,
  delta,
  baseline,
  buckets,
  username,
}: {
  current: SkillScores;
  delta: SkillScores;
  baseline: SkillScores;
  buckets: AnalyticsBucket[];
  username: string;
}) {
  // Need at least a handful of games before recommendations are meaningful.
  const haveEnoughData = buckets.length >= 5;

  const plan: PlanRow[] = React.useMemo(() => {
    if (!haveEnoughData) return [];
    return SKILL_ORDER.map((k) => {
      const score = current[k];
      const d = delta[k];
      const base = baseline[k];
      return {
        meta: SKILL_META[k],
        current: score,
        delta: d,
        diagnosis: diagnose(score, d, base),
        urgency: urgencyFor(score, d, base),
      };
    })
      // Sort by deficit-from-baseline rather than absolute score so
      // every player surfaces the right "weakest" three regardless of
      // their overall level.
      .sort((a, b) => a.current - baseline[a.meta.key] - (b.current - baseline[b.meta.key]))
      .slice(0, 3);
  }, [current, delta, baseline, haveEnoughData]);

  return (
    <Card className="border-primary/40 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          Your Personalized Training Plan
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {haveEnoughData
            ? "Three drills targeting the skills with the most room to grow vs your personal baseline."
            : "Import a few more games to unlock personalized drill recommendations."}
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {!haveEnoughData ? (
          <p className="text-sm text-muted-foreground italic">
            Need at least 5 games of data — currently {buckets.length}.
          </p>
        ) : (
          <>
            {plan.map((row, i) => (
              <PlanRowCard key={row.meta.key} row={row} rank={i + 1} username={username} />
            ))}
            <div className="pt-1 text-right">
              <Link
                href={`/training/plan${username ? `?username=${encodeURIComponent(username)}` : ""}`}
                className="text-xs text-primary hover:underline"
              >
                View this week's plan →
              </Link>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function PlanRowCard({ row, rank, username }: { row: PlanRow; rank: number; username: string }) {
  const Icon = row.meta.icon;
  const positive = row.delta >= 0;
  const urgencyColor =
    row.urgency === "high" ? "border-destructive/60 text-destructive" :
    row.urgency === "medium" ? "border-amber-500/60 text-amber-400" :
    "border-muted-foreground/40 text-muted-foreground";

  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-card/40 p-3">
      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-secondary text-xs font-bold tabular-nums">
        {rank}
      </div>
      <Icon className="w-5 h-5 text-primary shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">{row.meta.title}</span>
          <Badge variant="outline" className={`text-[10px] uppercase tracking-wider ${urgencyColor}`}>
            {row.urgency}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground truncate">{row.diagnosis}</p>
      </div>
      <div className="hidden sm:flex items-center gap-2 shrink-0">
        <div className="text-right">
          <div className="text-base font-bold font-mono leading-tight">{Math.round(row.current)}</div>
          <Badge
            variant={positive ? "success" : "destructive"}
            className="font-mono text-[10px] h-4 px-1"
          >
            {positive ? <ArrowUp className="w-2.5 h-2.5 mr-0.5" /> : <ArrowDown className="w-2.5 h-2.5 mr-0.5" />}
            {Math.round(row.delta)}
          </Badge>
        </div>
      </div>
      <Link href={buildPracticeHref(row.meta, row.current, row.delta, username)}>
        <Button size="sm">
          Start drill <ArrowRight className="w-3.5 h-3.5 ml-1" />
        </Button>
      </Link>
    </div>
  );
}

/* ====================================================================== */
/*  Background batch analysis progress                                     */
/* ====================================================================== */

function BatchProgressBar({
  job,
  onCancel,
  cancelling,
}: {
  job: BatchJob;
  onCancel: () => void;
  cancelling: boolean;
}) {
  if (job.status === "idle") return null;

  const total = job.total ?? 0;
  const analyzed = job.analyzed ?? 0;
  const generated = job.generated ?? 0;
  const failed = job.failed ?? 0;
  const pct = total > 0 ? Math.round((analyzed / total) * 100) : 0;

  if (job.status === "done" && total === 0) {
    // Nothing to do — every game already analyzed. Don't show a noisy bar.
    return null;
  }

  return (
    <Card className={job.status === "running" ? "border-primary/40" : "border-border"}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center gap-2 text-xs">
          {job.status === "running" ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          )}
          <Cpu className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="font-semibold">
            {job.status === "running"
              ? "Deep-analyzing your games with Stockfish"
              : "Game analysis complete"}
          </span>
          <span className="text-muted-foreground tabular-nums">
            {analyzed.toLocaleString()} / {total.toLocaleString()}
          </span>
          <span className="text-muted-foreground">
            · {generated.toLocaleString()} training problem{generated === 1 ? "" : "s"} generated
          </span>
          {failed > 0 && (
            <span className="inline-flex items-center gap-1 text-destructive">
              <XCircle className="w-3 h-3" /> {failed} failed
            </span>
          )}
          {job.status === "running" && (
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto h-6 text-xs"
              onClick={onCancel}
              disabled={cancelling}
            >
              Stop
            </Button>
          )}
        </div>
        <Progress value={pct} className="h-1.5" />
      </CardContent>
    </Card>
  );
}

/* ====================================================================== */
/*  Charts + skill cards                                                   */
/* ====================================================================== */

function RatingChart({
  buckets, ratingMin, ratingMax,
}: { buckets: AnalyticsBucket[]; ratingMin: number; ratingMax: number }) {
  const data = buckets.map((b, i) => ({ idx: i, rating: b.rating, date: b.date }));
  // Personal rating baseline = mean of all-but-the-last-10 buckets, falling
  // back to the overall mean. Mirrors the skill baseline logic on the
  // server side so the UI talks one language.
  const ratingBaseline = React.useMemo(() => {
    if (data.length === 0) return null;
    const slice = data.length >= 20 ? data.slice(0, -10) : data;
    return Math.round(slice.reduce((s, d) => s + d.rating, 0) / slice.length);
  }, [data]);
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data}>
        <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
        <XAxis dataKey="idx" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 10 }} />
        <YAxis domain={[Math.min(ratingMin, 1500), Math.max(ratingMax, 2200)]} stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 10 }} />
        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }} />
        {ratingBaseline != null && (
          <ReferenceLine
            y={ratingBaseline}
            stroke="hsl(var(--muted-foreground))"
            strokeDasharray="4 4"
            label={{
              value: `Your baseline ${ratingBaseline}`,
              fill: "hsl(var(--muted-foreground))",
              fontSize: 10,
              position: "right",
            }}
          />
        )}
        <Line type="monotone" dataKey="rating" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function ResultsDonut({ wins, draws, losses }: { wins: number; draws: number; losses: number }) {
  const total = wins + draws + losses;
  const winRate = total ? Math.round((wins / total) * 100) : 0;
  const data = [
    { name: "Wins", value: wins, color: "hsl(var(--accent))" },
    { name: "Draws", value: draws, color: "hsl(var(--muted-foreground))" },
    { name: "Losses", value: losses, color: "hsl(var(--destructive))" },
  ];
  return (
    <div className="relative h-[220px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" innerRadius={50} outerRadius={75} stroke="none">
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <div className="text-2xl font-bold">{winRate}%</div>
        <div className="text-xs text-muted-foreground">win rate</div>
      </div>
    </div>
  );
}

function SkillCard({
  meta, buckets, current, delta, baseline, username,
}: {
  meta: SkillMeta;
  buckets: AnalyticsBucket[];
  current: number; delta: number; baseline: number; username: string;
}) {
  const data = buckets.map((b, i) => ({ idx: i, value: smoothed(buckets, i, meta.key) }));
  const positive = delta >= 0;
  const baselineDelta = Math.round(current - baseline);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center justify-between">
          <span>{meta.title}</span>
          <Badge variant={positive ? "success" : "destructive"} className="font-mono">
            {positive ? <ArrowUp className="w-3 h-3 mr-1" /> : <ArrowDown className="w-3 h-3 mr-1" />}
            {Math.round(delta)}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-baseline justify-between">
          <div className="text-xl font-bold">{Math.round(current)}</div>
          <div className="text-[10px] text-muted-foreground">
            baseline {Math.round(baseline)}{" "}
            <span className={baselineDelta >= 0 ? "text-emerald-400" : "text-red-400"}>
              ({baselineDelta >= 0 ? "+" : ""}{baselineDelta})
            </span>
          </div>
        </div>
        <div className="h-[80px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <ReferenceLine
                y={baseline}
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="3 3"
                label={{
                  value: "baseline",
                  fontSize: 9,
                  fill: "hsl(var(--muted-foreground))",
                  position: "right",
                }}
              />
              <Line type="monotone" dataKey="value" stroke="white" strokeWidth={1.8} dot={false} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 10 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <Link href={buildPracticeHref(meta, current, delta, username)}>
          <Button size="sm" variant="outline" className="w-full">PRACTICE</Button>
        </Link>
      </CardContent>
    </Card>
  );
}

function smoothed(buckets: AnalyticsBucket[], i: number, field: keyof SkillScores): number {
  const window = buckets.slice(Math.max(0, i - 4), i + 1).map((b) => b.scores[field]);
  if (window.length === 0) return 0;
  return window.reduce((a, b) => a + b, 0) / window.length;
}

function GameHistoryList({ games }: { games: Game[] }) {
  return (
    <Card>
      <CardContent className="p-0 divide-y divide-border">
        {games.length === 0 && <p className="p-4 text-sm text-muted-foreground">No games.</p>}
        {games.map((g) => (
          <Link key={g.id} href={`/game-analysis/${g.id}`} className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-secondary">
            <Badge variant="outline" className="w-12 justify-center">{g.result ?? "*"}</Badge>
            <span className="font-medium truncate">{g.whitePlayer ?? "?"} vs {g.blackPlayer ?? "?"}</span>
            <span className="ml-auto text-xs text-muted-foreground">{g.opening ?? ""}</span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

/* ====================================================================== */
/*  Helpers                                                                */
/* ====================================================================== */

/**
 * Build the deep-link a PRACTICE / Start drill button uses. Every trainer
 * page reads these query params via {@link useAnalyticsContext} to render
 * the WeaknessBanner and bias `/api/training/problems` toward problems
 * generated from this user's own games.
 */
function buildPracticeHref(meta: SkillMeta, current: number, delta: number, username: string): string {
  const params = new URLSearchParams({
    from: "analytics",
    weakness: meta.weaknessSlug,
    score: String(Math.round(current)),
    delta: String(Math.round(delta)),
  });
  if (username) params.set("username", username);
  return `${meta.practicePath}?${params.toString()}`;
}

function diagnose(score: number, delta: number, baseline: number): string {
  const gap = Math.round(score - baseline);
  const trend =
    delta <= -20 ? " and trending down" :
    delta >= 20 ? " and improving" :
    "";
  if (gap <= -80) return `Far below your baseline (${gap})${trend} — needs urgent work.`;
  if (gap <= -30) return `Below baseline (${gap})${trend} — your weakest skill right now.`;
  if (gap < 30) return `Around baseline${trend} — keep grooving the patterns.`;
  return `Above baseline (+${gap})${trend} — fine-tune and move on.`;
}

function urgencyFor(score: number, delta: number, baseline: number): "high" | "medium" | "low" {
  const gap = score - baseline;
  if (gap <= -80 || delta <= -30) return "high";
  if (gap <= -30 || delta <= -10) return "medium";
  return "low";
}
