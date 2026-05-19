import * as React from "react";
import {
  Users,
  Eye,
  UserPlus,
  Wallet,
  Gamepad2,
  Target,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { adminJson, useAdminAuth, useDateRange } from "@/lib/adminApi";
import {
  AdminPageHeader,
  AdminToolbar,
  GlassCard,
  KpiCard,
  FunnelStep,
  QuickLinkCard,
} from "@/components/admin/admin-ui";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

interface OverviewData {
  snapshotUpdatedAt: string | null;
  members: { total: number; paying: number };
  traffic: { pageViews: number; sessions: number };
  signupsInRange: number;
  revenue: { mrrUsdEstimate: number; currency: string };
  activation: {
    totalMembers: number;
    withEmail: number;
    importedGame: number;
    analyzedGame: number;
    trainingAttempt: number;
    gameAndTraining: number;
  };
  engagement: {
    totalGames: number;
    totalAnalyses: number;
    totalAttempts: number;
    coachThreads: number;
  };
}

export default function AdminOverviewPage() {
  const { sessionOk, adminKey, setAdminKey, ready } = useAdminAuth();
  const { from, setFrom, to, setTo, queryString } = useDateRange(30);
  const [data, setData] = React.useState<OverviewData | null>(null);
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
      const res = await adminJson<OverviewData>(`/api/admin/overview?${queryString}`, adminKey.trim() || undefined);
      setData(res);
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

  const a = data?.activation;

  return (
    <div className="space-y-8 pb-12">
      <AdminPageHeader
        title="Command center"
        badge="Live"
        description="Whole-site pulse: members, traffic, activation, and product usage from app_snapshot and first-party analytics."
        actions={
          data?.snapshotUpdatedAt && (
            <p className="text-xs text-muted-foreground">
              Snapshot {new Date(data.snapshotUpdatedAt).toLocaleString()}
            </p>
          )
        }
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
            <KpiCard label="Members" value={data.members.total} hint={`${data.members.paying} paying`} icon={Users} />
            <KpiCard label="Page views" value={data.traffic.pageViews.toLocaleString()} hint="Consent-gated range" icon={Eye} accent="blue" />
            <KpiCard label="New sign-ups" value={data.signupsInRange} hint="analytics_signups + snapshot" icon={UserPlus} accent="amber" />
            <KpiCard
              label="MRR est."
              value={`$${data.revenue.mrrUsdEstimate.toFixed(0)}`}
              hint={data.revenue.currency}
              icon={Wallet}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <GlassCard>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Target className="h-4 w-4 text-[#a8d08d]" />
                  Activation funnel
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {a && (
                  <>
                    <FunnelStep label="Registered" count={a.totalMembers} total={a.totalMembers} />
                    <FunnelStep label="Has email" count={a.withEmail} total={a.totalMembers} />
                    <FunnelStep label="Imported a game" count={a.importedGame} total={a.totalMembers} />
                    <FunnelStep label="Ran analysis" count={a.analyzedGame} total={a.totalMembers} />
                    <FunnelStep label="Training attempt" count={a.trainingAttempt} total={a.totalMembers} />
                    <FunnelStep
                      label="Game + training"
                      count={a.gameAndTraining}
                      total={a.totalMembers}
                      description="North-star engaged member"
                    />
                  </>
                )}
              </CardContent>
            </GlassCard>

            <GlassCard>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-blue-300" />
                  Product totals (all time)
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <KpiCard label="Games" value={data.engagement.totalGames} icon={Gamepad2} accent="blue" />
                <KpiCard label="Analyses" value={data.engagement.totalAnalyses} icon={Sparkles} accent="blue" />
                <KpiCard label="Attempts" value={data.engagement.totalAttempts} icon={Target} accent="green" />
                <KpiCard label="Coach threads" value={data.engagement.coachThreads} icon={Users} accent="amber" />
              </CardContent>
            </GlassCard>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <QuickLinkCard href="/admin/traffic" title="Traffic" description="Sessions, pages, referrers, countries" />
            <QuickLinkCard href="/admin/members" title="Members" description="Directory, CSV, subscriptions" />
            <QuickLinkCard href="/admin/engagement" title="Engagement" description="Trainers, imports, solve rates" />
            <QuickLinkCard href="/admin/product" title="Activation" description="Sign-up methods, onboarding" />
            <QuickLinkCard href="/admin/revenue" title="Revenue" description="MRR, trials, plan mix" />
            <QuickLinkCard href="/admin/ops" title="Ops" description="DB health, env checklist" />
          </div>
        </>
      )}
    </div>
  );
}

