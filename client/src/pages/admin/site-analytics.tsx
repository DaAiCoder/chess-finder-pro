import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";

interface SummaryResponse {
  from: string;
  to: string;
  series: { day: string; pageViews: number; sessions: number }[];
  totals: { pageViews: number; sessions: number };
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

/**
 * First-party web analytics (page views + sessions). Auth: operator session
 * cookie and/or ADMIN_API_KEY (Bearer) on each request.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load after session only
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
      const [sum, pages, countries, rec] = await Promise.all([
        adminJson<SummaryResponse>(`/api/admin/analytics/summary?${qs}`, key),
        adminJson<{ items: TopRow[] }>(`/api/admin/analytics/top-pages?${qs}`, key),
        adminJson<{ items: CountryRow[] }>(`/api/admin/analytics/top-countries?${qs}`, key),
        adminJson<{ items: RecentSession[] }>(`/api/admin/analytics/recent-sessions?limit=40`, key),
      ]);
      setSummary(sum);
      setTopPages(pages.items);
      setTopCountries(countries.items);
      setRecent(rec.items);
    } catch (e) {
      setSummary(null);
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Site analytics</h1>
        <p className="text-sm text-muted-foreground mt-1">
          On the main site: <strong>Analyze → Analytics</strong>, tab <strong>Site traffic (ops)</strong>.
          On <strong>{"goadmingo.<your-apex>"}</strong> you get this operator shell (set{" "}
          <code className="text-[11px]">VITE_SITE_APEX</code> at build). Page views and sessions after
          visitors accept analytics cookies. Requires Postgres (
          <code className="text-[11px]">DATABASE_URL</code>) on the server.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Query</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>From (UTC date)</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>To (UTC date)</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2 max-w-md">
            <Label>Admin API key (optional)</Label>
            <Input
              type="password"
              autoComplete="off"
              value={adminKey}
              onChange={(e) => setAdminKey(e.target.value)}
              placeholder={sessionOk ? "Session active — override with key if needed" : "ADMIN_API_KEY"}
            />
            {sessionOk && (
              <p className="text-[11px] text-muted-foreground">You are signed in as operator; key is optional.</p>
            )}
          </div>
          {err && <p className="text-xs text-destructive">{err}</p>}
          <Button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            style={{ backgroundColor: "#769656", color: "white" }}
          >
            {loading ? "Loading…" : "Load reports"}
          </Button>
        </CardContent>
      </Card>

      {summary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Totals ({summary.from.slice(0, 10)} → {summary.to.slice(0, 10)})</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <p>
              <span className="text-muted-foreground">Page views:</span>{" "}
              <span className="font-medium tabular-nums">{summary.totals.pageViews}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Sessions (distinct):</span>{" "}
              <span className="font-medium tabular-nums">{summary.totals.sessions}</span>
            </p>
          </CardContent>
        </Card>
      )}

      {summary && summary.series.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">By day</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Day (UTC)</th>
                  <th className="py-2 pr-4 font-medium tabular-nums">Page views</th>
                  <th className="py-2 font-medium tabular-nums">Sessions</th>
                </tr>
              </thead>
              <tbody>
                {summary.series.map((row) => (
                  <tr key={row.day} className="border-b border-border/60">
                    <td className="py-2 pr-4">{row.day}</td>
                    <td className="py-2 pr-4 tabular-nums">{row.pageViews}</td>
                    <td className="py-2 tabular-nums">{row.sessions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {topPages.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top paths</CardTitle>
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
