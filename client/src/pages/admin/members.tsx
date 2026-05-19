import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Badge } from "@/components/ui/Badge";
import {
  Users,
  Wallet,
  Sparkles,
  AlertTriangle,
  Download,
  Search,
  RefreshCw,
} from "lucide-react";
interface MemberRow {
  userId: number;
  username: string;
  email: string | null;
  subscriptionStatus: string;
  subscriptionPlan: string;
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  createdAt: string | null;
  signupMethod: string | null;
  lastSeenAt: string | null;
  trainingAttempts: number;
}

interface SubscriptionSnapshot {
  source: string;
  snapshotUpdatedAt: string | null;
  pricing: { monthlyUsd: number; yearlyUsd: number; currency: string };
  totals: {
    totalMembers: number;
    activeOrTrialing: number;
    trialing: number;
    active: number;
    canceled: number;
    pastDue: number;
    free: number;
    trialsEndingWithin7Days: number;
    cancelScheduledAtPeriodEnd: number;
  };
  revenue: {
    mrrUsdEstimate: number;
    arrUsdEstimate: number;
    note: string;
  };
  byStatus: { status: string; count: number }[];
  byPlan: { plan: string; count: number }[];
}

async function adminJson<T>(path: string, adminKey: string | undefined): Promise<T> {
  const headers: Record<string, string> = {};
  if (adminKey?.trim()) headers.Authorization = `Bearer ${adminKey.trim()}`;
  const res = await fetch(path, { headers, credentials: "include" });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error((body as { error?: string }).error ?? res.statusText);
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
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="text-2xl font-semibold tabular-nums tracking-tight mt-0.5">{value}</p>
          {hint && <p className="text-[10px] text-muted-foreground mt-1 leading-snug">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(undefined, { dateStyle: "medium" });
}

function statusBadge(status: string) {
  const s = status.toLowerCase();
  if (s === "active" || s === "trialing") {
    return <Badge variant="default">{status}</Badge>;
  }
  if (s === "past_due" || s === "canceled") {
    return <Badge variant="destructive">{status}</Badge>;
  }
  return <Badge variant="secondary">{status}</Badge>;
}

function exportCsv(rows: MemberRow[]) {
  const header = [
    "userId",
    "username",
    "email",
    "signupMethod",
    "subscriptionStatus",
    "subscriptionPlan",
    "createdAt",
    "lastSeenAt",
    "trainingAttempts",
  ];
  const lines = rows.map((r) =>
    [
      r.userId,
      r.username,
      r.email ?? "",
      r.signupMethod ?? "",
      r.subscriptionStatus,
      r.subscriptionPlan,
      r.createdAt ?? "",
      r.lastSeenAt ?? "",
      r.trainingAttempts,
    ]
      .map((c) => `"${String(c).replace(/"/g, '""')}"`)
      .join(","),
  );
  const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `chessgm-members-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminMembersPage() {
  const [sessionOk, setSessionOk] = React.useState(false);
  const [adminKey, setAdminKey] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [members, setMembers] = React.useState<MemberRow[]>([]);
  const [subs, setSubs] = React.useState<SubscriptionSnapshot | null>(null);
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

  const load = async () => {
    setErr(null);
    if (!sessionOk && !adminKey.trim()) {
      setErr("Sign in with operator credentials, or enter ADMIN_API_KEY below.");
      return;
    }
    setLoading(true);
    try {
      const key = adminKey.trim() || undefined;
      const q = search.trim() ? `?q=${encodeURIComponent(search.trim())}` : "";
      const [memberRes, subRes] = await Promise.all([
        adminJson<{ items: MemberRow[] }>(`/api/admin/members${q}`, key),
        adminJson<SubscriptionSnapshot>("/api/admin/members/subscriptions", key),
      ]);
      setMembers(memberRes.items);
      setSubs(subRes);
    } catch (e) {
      setMembers([]);
      setSubs(null);
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Members</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Registered accounts from <code className="text-xs">app_snapshot</code> (not the empty
            SQL <code className="text-xs">users</code> table).
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {!sessionOk && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <Label htmlFor="admin-key">ADMIN_API_KEY (optional if signed in)</Label>
            <Input
              id="admin-key"
              type="password"
              value={adminKey}
              onChange={(e) => setAdminKey(e.target.value)}
              placeholder="Bearer key for API calls"
            />
          </CardContent>
        </Card>
      )}

      {err && (
        <Card className="border-destructive/50">
          <CardContent className="p-4 text-sm text-destructive">{err}</CardContent>
        </Card>
      )}

      {subs && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
              label="Total members"
              value={subs.totals.totalMembers}
              hint="Non-anonymous accounts"
              icon={Users}
            />
            <KpiCard
              label="Paying (active + trial)"
              value={subs.totals.activeOrTrialing}
              hint={`${subs.totals.active} active · ${subs.totals.trialing} trialing`}
              icon={Wallet}
            />
            <KpiCard
              label="MRR estimate"
              value={`$${subs.revenue.mrrUsdEstimate.toFixed(2)}`}
              hint={subs.revenue.note}
              icon={Sparkles}
            />
            <KpiCard
              label="Trials ending (7d)"
              value={subs.totals.trialsEndingWithin7Days}
              hint={`${subs.totals.cancelScheduledAtPeriodEnd} cancel at period end`}
              icon={AlertTriangle}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">By status</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {subs.byStatus.map((r) => (
                  <Badge key={r.status} variant="outline">
                    {r.status}: {r.count}
                  </Badge>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">By plan</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {subs.byPlan.map((r) => (
                  <Badge key={r.plan} variant="outline">
                    {r.plan}: {r.count}
                  </Badge>
                ))}
                <p className="text-[10px] text-muted-foreground w-full mt-2">
                  Pricing: ${subs.pricing.monthlyUsd}/mo · ${subs.pricing.yearlyUsd}/yr (
                  {subs.pricing.currency}). ARR est. ${subs.revenue.arrUsdEstimate.toFixed(0)}.
                  {subs.snapshotUpdatedAt && (
                    <> Snapshot updated {fmtDate(subs.snapshotUpdatedAt)}.</>
                  )}
                </p>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 pb-3">
          <CardTitle className="text-sm font-medium">Member directory</CardTitle>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={members.length === 0}
              onClick={() => exportCsv(members)}
            >
              <Download className="h-4 w-4 mr-1" />
              CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void load();
            }}
          >
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search username or email"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={loading}>
              Search
            </Button>
          </form>

          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="p-2 font-medium">User</th>
                  <th className="p-2 font-medium">Email</th>
                  <th className="p-2 font-medium">Sign-up</th>
                  <th className="p-2 font-medium">Method</th>
                  <th className="p-2 font-medium">Subscription</th>
                  <th className="p-2 font-medium">Last seen</th>
                  <th className="p-2 font-medium text-right">Attempts</th>
                </tr>
              </thead>
              <tbody>
                {members.length === 0 && !loading && (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-muted-foreground">
                      No members found.
                    </td>
                  </tr>
                )}
                {members.map((m) => (
                  <tr key={m.userId} className="border-b border-border/60 hover:bg-muted/20">
                    <td className="p-2">
                      <span className="font-medium">{m.username}</span>
                      <span className="text-[10px] text-muted-foreground block">#{m.userId}</span>
                    </td>
                    <td className="p-2 text-muted-foreground">{m.email || "—"}</td>
                    <td className="p-2 whitespace-nowrap text-xs">{fmtDate(m.createdAt)}</td>
                    <td className="p-2">
                      {m.signupMethod ? (
                        <Badge variant="outline" className="text-[10px]">
                          {m.signupMethod}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="p-2">
                      <div className="flex flex-col gap-1 items-start">
                        {statusBadge(m.subscriptionStatus)}
                        {m.subscriptionPlan !== "none" && (
                          <span className="text-[10px] text-muted-foreground">{m.subscriptionPlan}</span>
                        )}
                        {m.cancelAtPeriodEnd && (
                          <span className="text-[10px] text-amber-600">Cancels at period end</span>
                        )}
                      </div>
                    </td>
                    <td className="p-2 whitespace-nowrap text-xs">{fmtDate(m.lastSeenAt)}</td>
                    <td className="p-2 text-right tabular-nums">{m.trainingAttempts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
