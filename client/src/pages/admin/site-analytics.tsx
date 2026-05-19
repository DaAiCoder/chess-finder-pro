import * as React from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Badge } from "@/components/ui/Badge";
import {
  BarChart3,
  Eye,
  Globe2,
  MousePointerClick,
  Percent,
  Sparkles,
  UserCheck,
  Users,
  Wallet,
  Dumbbell,
  UserPlus,
  Activity,
} from "lucide-react";

interface SummaryResponse {
  from: string;
  to: string;
  series: { day: string; pageViews: number; sessions: number }[];
  totals: {
    pageViews: number;
    sessions: number;
    uniqueAnonymous: number;
    signedInVisitors: number;
    avgPagesPerSession: number;
    bounceSessions: number;
    bounceRatePct: number;
  };
  subscriptions: {
    totalUsers: number;
    activeOrTrialing: number;
    newUsersInRange: number;
    byStatus: { status: string; count: number }[];
    byPlan: { plan: string; count: number }[];
  };
  topReferrers: { referrer: string; sessions: number }[];
}

interface TopRow {
  path: string;
  views: number;
}

interface CountryRow {
  country: string;
  sessions: number;
}

interface RecentSession {
  id: string;
  startedAt: string;
  lastSeenAt: string;
  anonymousId: string;
  userId: number | null;
  country: string | null;
  referrer: string | null;
  pageViews: number;
}

interface RecentSignup {
  userId: number;
  username: string;
  email: string | null;
  method: string;
  ip: string | null;
  occurredAt: string;
}

interface TrainerUsageRow {
  module: string;
  attempts: number;
  solved: number;
  uniqueUsers: number;
}

interface AnalyticsHealth {
  database: boolean;
  env: Record<string, boolean>;
  notes: string[];
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function adminJson<T>(path: string, adminKey: string | undefined): Promise<T> {
  const headers: Record<string, string> = {};
  if (adminKey?.trim()) headers.Authorization = `Bearer ${adminKey.trim()}`;
  const res = await fetch(path, {
    headers,
    credentials: "include",
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error((body as { error?: string }).error ?? res.statusText);
  }
  return body;
}

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card className="border-border/80 bg-card/50">
      <CardContent className="p-4 flex gap-3">
        <div className="rounded-lg bg-primary/10 p-2 h-fit">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold tabular-nums tracking-tight mt-0.5">{value}</p>
          {hint && <p className="text-[10px] text-muted-foreground mt-1 leading-snug">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * First-party analytics dashboard. Auth: operator session and/or ADMIN_API_KEY.
 */
export default function AdminSiteAnalyticsPage() {
  const [sessionOk, setSessionOk] = React.useState(false);
  const [adminKey, setAdminKey] = React.useState("");
  const [from, setFrom] = React.useState(() => isoDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)));
  const [to, setTo] = React.useState(() => isoDate(new Date()));
  const [summary, setSummary] = React.useState<SummaryResponse | null>(null);
  const [topPages, setTopPages] = React.useState<TopRow[]>([]);
  const [topCountries, setTopCountries] = React.useState<CountryRow[]>([]);
  const [recent, setRecent] = React.useState<RecentSession[]>([]);
  const [recentSignups, setRecentSignups] = React.useState<RecentSignup[]>([]);
  const [topTrainers, setTopTrainers] = React.useState<TrainerUsageRow[]>([]);
  const [trainerPages, setTrainerPages] = React.useState<TopRow[]>([]);
  const [health, setHealth] = React.useState<AnalyticsHealth | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    void fetch("/api/operator/session", { credentials: "include" })
      .then((r) => r.json())
      .then((d: { ok?: boolean }) => setSessionOk(!!d.ok))
      .catch(() => setSessionOk(false));
  }, []);

  React.useEffect(() => {
    if (!sessionOk) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionOk]);

  const qs = React.useMemo(() => {
    const p = new URLSearchParams();
    p.set("from", new Date(from + "T00:00:00.000Z").toISOString());
    p.set("to", new Date(to + "T23:59:59.999Z").toISOString());
    return p.toString();
  }, [from, to]);

  const load = async () => {
    setErr(null);
    if (!sessionOk && !adminKey.trim()) {
      setErr("Sign in with operator credentials, or enter ADMIN_API_KEY below.");
      return;
    }
    setLoading(true);
    try {
      const key = adminKey.trim() || undefined;
      const [sum, pages, countries, rec, signups, trainers, tPages, healthRes] =
        await Promise.all([
        adminJson<SummaryResponse>(`/api/admin/analytics/summary?${qs}`, key),
        adminJson<{ items: TopRow[] }>(`/api/admin/analytics/top-pages?${qs}`, key),
        adminJson<{ items: CountryRow[] }>(`/api/admin/analytics/top-countries?${qs}`, key),
        adminJson<{ items: RecentSession[] }>(`/api/admin/analytics/recent-sessions?limit=40`, key),
        adminJson<{ items: RecentSignup[] }>(`/api/admin/analytics/recent-signups?${qs}&limit=25`, key),
        adminJson<{ items: TrainerUsageRow[] }>(`/api/admin/analytics/top-trainers?${qs}`, key),
        adminJson<{ items: TopRow[] }>(`/api/admin/analytics/top-trainer-pages?${qs}`, key),
        adminJson<AnalyticsHealth>(`/api/admin/analytics/health`, key),
      ]);
      setSummary(sum);
      setTopPages(pages.items);
      setTopCountries(countries.items);
      setRecent(rec.items);
      setRecentSignups(signups.items);
      setTopTrainers(trainers.items);
      setTrainerPages(tPages.items);
      setHealth(healthRes);
    } catch (e) {
      setSummary(null);
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const chartData = React.useMemo(() => {
    if (!summary?.series.length) return [];
    return summary.series.map((r) => ({
      day: r.day.slice(5),
      "Page views": r.pageViews,
      Sessions: r.sessions,
    }));
  }, [summary]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analytics dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            First-party traffic from the internal collector (consent-gated). Subscription figures come from your{" "}
            <code className="text-[11px]">users</code> table (Stripe fields). For dense KPI + chart layouts, compare{" "}
            <a
              className="underline underline-offset-2 hover:text-foreground"
              href="https://preview.themeforest.net/item/adminpro-bootstrap-admin-dashboard-template/full_screen_preview/12073233"
              target="_blank"
              rel="noreferrer"
            >
              ThemeForest AdminPro (preview)
            </a>
            . For GA parity (channels, cohorts, demographics) wire Google Analytics or extend the collector schema.
          </p>
        </div>
        <Badge variant="outline" className="w-fit shrink-0">
          Ops
        </Badge>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Date range & access</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>From (UTC)</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>To (UTC)</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="space-y-2 lg:col-span-2">
              <Label>Admin API key (optional)</Label>
              <Input
                type="password"
                autoComplete="off"
                value={adminKey}
                onChange={(e) => setAdminKey(e.target.value)}
                placeholder={sessionOk ? "Session active — override if needed" : "ADMIN_API_KEY"}
              />
              {sessionOk && (
                <p className="text-[11px] text-muted-foreground">Signed in as operator; key optional.</p>
              )}
            </div>
          </div>
          {err && <p className="text-xs text-destructive">{err}</p>}
          <Button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="bg-[#769656] hover:bg-[#6a8a4c] text-white"
          >
            {loading ? "Loading…" : "Refresh dashboard"}
          </Button>
        </CardContent>
      </Card>

      {summary && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <KpiCard
              label="Page views"
              value={summary.totals.pageViews.toLocaleString()}
              hint="All tracked page loads in range"
              icon={Eye}
            />
            <KpiCard
              label="Sessions"
              value={summary.totals.sessions.toLocaleString()}
              hint="Distinct session IDs (page_view based)"
              icon={BarChart3}
            />
            <KpiCard
              label="Unique visitors"
              value={summary.totals.uniqueAnonymous.toLocaleString()}
              hint="Distinct anonymous IDs with ≥1 view"
              icon={Users}
            />
            <KpiCard
              label="Signed-in (visitors)"
              value={summary.totals.signedInVisitors.toLocaleString()}
              hint="Distinct user IDs in sessions with views"
              icon={UserCheck}
            />
            <KpiCard
              label="Pages / session"
              value={summary.totals.avgPagesPerSession.toLocaleString(undefined, {
                maximumFractionDigits: 2,
                minimumFractionDigits: 0,
              })}
              hint="Avg depth in selected period"
              icon={MousePointerClick}
            />
            <KpiCard
              label="Bounce rate"
              value={`${summary.totals.bounceRatePct}%`}
              hint={`${summary.totals.bounceSessions.toLocaleString()} single-page sessions / ${summary.totals.sessions.toLocaleString()} sessions`}
              icon={Percent}
            />
            <KpiCard
              label="Paying subscribers"
              value={summary.subscriptions.activeOrTrialing.toLocaleString()}
              hint={`of ${summary.subscriptions.totalUsers.toLocaleString()} registered users`}
              icon={Wallet}
            />
            <KpiCard
              label="New sign-ups"
              value={summary.subscriptions.newUsersInRange.toLocaleString()}
              hint="analytics_signups (fallback: snapshot users.created_at)"
              icon={Sparkles}
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <Card className="xl:col-span-2 border-border/80">
              <CardHeader>
                <CardTitle className="text-base">Traffic trend</CardTitle>
                <p className="text-xs text-muted-foreground">Daily page views and sessions (UTC).</p>
              </CardHeader>
              <CardContent className="h-[320px]">
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
                      <XAxis dataKey="day" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                      <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" width={44} />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                      <Legend />
                      <Area
                        type="monotone"
                        dataKey="Page views"
                        fill="hsl(var(--primary) / 0.15)"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                      />
                      <Line type="monotone" dataKey="Sessions" stroke="hsl(142 40% 45%)" strokeWidth={2} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                    No daily series for this range yet.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/80">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Wallet className="h-4 w-4" />
                  Subscriptions
                </CardTitle>
                <p className="text-xs text-muted-foreground">Live snapshot from Postgres users.</p>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">Total {summary.subscriptions.totalUsers}</Badge>
                  <Badge className="bg-emerald-700/90">Active / trialing {summary.subscriptions.activeOrTrialing}</Badge>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">By status</p>
                  <ul className="space-y-1 max-h-28 overflow-y-auto">
                    {summary.subscriptions.byStatus.map((r) => (
                      <li key={r.status} className="flex justify-between gap-2 text-xs">
                        <span className="truncate">{r.status}</span>
                        <span className="tabular-nums text-muted-foreground">{r.count}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">By plan</p>
                  <ul className="space-y-1 max-h-28 overflow-y-auto">
                    {summary.subscriptions.byPlan.map((r) => (
                      <li key={r.plan} className="flex justify-between gap-2 text-xs">
                        <span className="truncate">{r.plan}</span>
                        <span className="tabular-nums text-muted-foreground">{r.count}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>

          {summary.topReferrers.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Globe2 className="h-4 w-4" />
                  Top referrers (truncated)
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="py-2 pr-4 font-medium">Referrer</th>
                      <th className="py-2 font-medium tabular-nums">Sessions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.topReferrers.map((row) => (
                      <tr key={row.referrer} className="border-b border-border/60">
                        <td className="py-2 pr-4 max-w-md truncate text-xs" title={row.referrer}>
                          {row.referrer}
                        </td>
                        <td className="py-2 tabular-nums">{row.sessions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {health && (
            <Card className="border-border/80">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  Analytics setup
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Postgres {health.database ? "connected" : "unavailable"} — sign-ups log server-side; page views
                  need cookie consent. GA4: Reports → Events (<code className="text-[10px]">sign_up</code>,{" "}
                  <code className="text-[10px]">trainer_view</code>,{" "}
                  <code className="text-[10px]">trainer_attempt</code>).
                </p>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2 text-xs">
                {Object.entries(health.env).map(([key, ok]) => (
                  <Badge key={key} variant={ok ? "secondary" : "outline"} className={ok ? "" : "opacity-60"}>
                    {key}: {ok ? "ok" : "missing"}
                  </Badge>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <UserPlus className="h-4 w-4" />
                  Recent sign-ups
                </CardTitle>
                <p className="text-xs text-muted-foreground">Server-recorded (email, magic link, Lichess).</p>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {recentSignups.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No sign-ups in this range yet.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">When</th>
                        <th className="py-2 pr-3 font-medium">User</th>
                        <th className="py-2 pr-3 font-medium">Method</th>
                        <th className="py-2 font-medium">Email</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentSignups.map((row) => (
                        <tr key={`${row.userId}-${row.occurredAt}`} className="border-b border-border/60">
                          <td className="py-2 pr-3 text-xs whitespace-nowrap">
                            {new Date(row.occurredAt).toLocaleString()}
                          </td>
                          <td className="py-2 pr-3 font-mono text-xs">@{row.username}</td>
                          <td className="py-2 pr-3 text-xs">{row.method}</td>
                          <td className="py-2 text-xs truncate max-w-[140px]">{row.email ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Dumbbell className="h-4 w-4" />
                  Top trainers (puzzle attempts)
                </CardTitle>
                <p className="text-xs text-muted-foreground">By training module from recorded attempts.</p>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {topTrainers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No training attempts in this range.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">Module</th>
                        <th className="py-2 pr-3 font-medium tabular-nums">Attempts</th>
                        <th className="py-2 pr-3 font-medium tabular-nums">Solved</th>
                        <th className="py-2 font-medium tabular-nums">Users</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topTrainers.map((row) => (
                        <tr key={row.module} className="border-b border-border/60">
                          <td className="py-2 pr-3 font-mono text-xs">{row.module}</td>
                          <td className="py-2 pr-3 tabular-nums">{row.attempts}</td>
                          <td className="py-2 pr-3 tabular-nums">{row.solved}</td>
                          <td className="py-2 tabular-nums">{row.uniqueUsers}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </div>

          {trainerPages.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top trainer &amp; product pages</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Page views on /training, /openings, /endgames, /coach, /analysis (consent-gated).
                </p>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="py-2 pr-4 font-medium">Path</th>
                      <th className="py-2 font-medium tabular-nums">Views</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trainerPages.map((row) => (
                      <tr key={row.path} className="border-b border-border/60">
                        <td className="py-2 pr-4 font-mono text-xs break-all">{row.path}</td>
                        <td className="py-2 tabular-nums">{row.views}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          <Card className="border-dashed border-border bg-muted/20">
            <CardHeader>
              <CardTitle className="text-base">Roadmap — GA-style metrics</CardTitle>
              <p className="text-xs text-muted-foreground">
                Still to add: UTM campaigns, session duration, device breakdown, retention cohorts.
              </p>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground space-y-2 leading-relaxed">
              <ul className="list-disc pl-4 space-y-1">
                <li>
                  <strong>Acquisition:</strong> channel grouping (organic / paid / direct), campaign &amp; UTM
                  params.
                </li>
                <li>
                  <strong>Engagement:</strong> avg session duration, scroll depth.
                </li>
                <li>
                  <strong>Retention:</strong> cohort tables (signup week × activity week).
                </li>
                <li>
                  <strong>Revenue:</strong> MRR/ARR from Stripe, trial → paid conversion funnels.
                </li>
              </ul>
            </CardContent>
          </Card>
        </>
      )}

      {topPages.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top pages</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Path</th>
                  <th className="py-2 font-medium tabular-nums">Views</th>
                </tr>
              </thead>
              <tbody>
                {topPages.map((row) => (
                  <tr key={row.path} className="border-b border-border/60">
                    <td className="py-2 pr-4 font-mono text-xs break-all">{row.path}</td>
                    <td className="py-2 tabular-nums">{row.views}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {topCountries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top countries (sessions)</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Country</th>
                  <th className="py-2 font-medium tabular-nums">Sessions</th>
                </tr>
              </thead>
              <tbody>
                {topCountries.map((row) => (
                  <tr key={row.country} className="border-b border-border/60">
                    <td className="py-2 pr-4">{row.country}</td>
                    <td className="py-2 tabular-nums">{row.sessions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {recent.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent sessions</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-2 font-medium">Last seen</th>
                  <th className="py-2 pr-2 font-medium">Country</th>
                  <th className="py-2 pr-2 font-medium tabular-nums">PVs</th>
                  <th className="py-2 pr-2 font-medium">User</th>
                  <th className="py-2 font-medium">Referrer</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((row) => (
                  <tr key={row.id} className="border-b border-border/60 align-top">
                    <td className="py-2 pr-2 whitespace-nowrap text-xs">
                      {new Date(row.lastSeenAt).toLocaleString()}
                    </td>
                    <td className="py-2 pr-2">{row.country ?? "—"}</td>
                    <td className="py-2 pr-2 tabular-nums">{row.pageViews}</td>
                    <td className="py-2 pr-2 tabular-nums">{row.userId ?? "—"}</td>
                    <td className="py-2 max-w-[200px] truncate text-xs text-muted-foreground" title={row.referrer ?? ""}>
                      {row.referrer || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
