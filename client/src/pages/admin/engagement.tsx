import * as React from "react";
import { Dumbbell, Gamepad2, Brain, Users } from "lucide-react";
import { adminJson, useAdminAuth, useDateRange } from "@/lib/adminApi";
import {
  AdminPageHeader,
  AdminToolbar,
  GlassCard,
  KpiCard,
  DataTable,
} from "@/components/admin/admin-ui";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

interface EngagementData {
  totals: {
    totalGames: number;
    totalAnalyses: number;
    totalAttempts: number;
    coachThreads: number;
  };
  importSources: { source: string; count: number }[];
  trainingModules: {
    module: string;
    attempts: number;
    solved: number;
    uniqueUsers: number;
    solveRatePct: number;
  }[];
  activeTrainersInRange: number;
}

export default function AdminEngagementPage() {
  const { sessionOk, adminKey, setAdminKey, ready } = useAdminAuth();
  const { from, setFrom, to, setTo, queryString } = useDateRange(30);
  const [data, setData] = React.useState<EngagementData | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    setErr(null);
    if (!sessionOk && !adminKey.trim()) {
      setErr("Sign in as operator or enter ADMIN_API_KEY.");
      return;
    }
    setLoading(true);
    try {
      setData(await adminJson<EngagementData>(`/api/admin/engagement?${queryString}`, adminKey.trim() || undefined));
    } catch (e) {
      setData(null);
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [sessionOk, adminKey, queryString]);

  React.useEffect(() => {
    if (ready && sessionOk) void load();
  }, [ready, sessionOk, load]);

  return (
    <div className="space-y-8 pb-12">
      <AdminPageHeader
        title="Engagement"
        badge="Product"
        description="Games, analyses, training modules, and import sources across the platform."
      />

      <AdminToolbar
        from={from}
        to={to}
        onFrom={setFrom}
        onTo={setTo}
        adminKey={adminKey}
        onAdminKey={setAdminKey}
        sessionOk={sessionOk}
        loading={loading}
        onRefresh={() => void load()}
      />

      {err && <p className="text-sm text-destructive">{err}</p>}

      {data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <KpiCard label="Games" value={data.totals.totalGames} icon={Gamepad2} accent="blue" />
            <KpiCard label="Analyses" value={data.totals.totalAnalyses} icon={Brain} accent="blue" />
            <KpiCard label="Attempts (all)" value={data.totals.totalAttempts} icon={Dumbbell} />
            <KpiCard
              label="Active trainers"
              value={data.activeTrainersInRange}
              hint="Distinct users with attempts in range"
              icon={Users}
              accent="amber"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <GlassCard>
              <CardHeader>
                <CardTitle className="text-base">Import sources</CardTitle>
              </CardHeader>
              <CardContent>
                <DataTable
                  columns={["Source", "Games"]}
                  rows={data.importSources.map((r) => [r.source, r.count.toString()])}
                  empty="No games in snapshot"
                />
              </CardContent>
            </GlassCard>
            <GlassCard>
              <CardHeader>
                <CardTitle className="text-base">Coach</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold tabular-nums">{data.totals.coachThreads}</p>
                <p className="text-xs text-muted-foreground mt-1">Conversation threads in snapshot</p>
              </CardContent>
            </GlassCard>
          </div>

          <GlassCard>
            <CardHeader>
              <CardTitle className="text-base">Training by module (range)</CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={["Module", "Attempts", "Solved", "Users", "Solve %"]}
                rows={data.trainingModules.map((r) => [
                  <Badge key={r.module} variant="outline" className="font-mono text-[10px]">{r.module}</Badge>,
                  r.attempts.toString(),
                  r.solved.toString(),
                  r.uniqueUsers.toString(),
                  `${r.solveRatePct}%`,
                ])}
                empty="No attempts in range (check training_attempts mirror)"
              />
            </CardContent>
          </GlassCard>
        </>
      )}
    </div>
  );
}
