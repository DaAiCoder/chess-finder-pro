import * as React from "react";
import { Wallet, AlertTriangle, TrendingUp } from "lucide-react";
import { Link } from "wouter";
import { adminJson, useAdminAuth } from "@/lib/adminApi";
import { AdminPageHeader, GlassCard, KpiCard } from "@/components/admin/admin-ui";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

interface SubsData {
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
  revenue: { mrrUsdEstimate: number; arrUsdEstimate: number; note: string };
  pricing: { monthlyUsd: number; yearlyUsd: number; currency: string };
  byStatus: { status: string; count: number }[];
  byPlan: { plan: string; count: number }[];
  snapshotUpdatedAt: string | null;
}

export default function AdminRevenuePage() {
  const { sessionOk, adminKey, setAdminKey, ready } = useAdminAuth();
  const [data, setData] = React.useState<SubsData | null>(null);
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
      setData(await adminJson<SubsData>("/api/admin/members/subscriptions", adminKey.trim() || undefined));
    } catch (e) {
      setData(null);
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [sessionOk, adminKey]);

  React.useEffect(() => {
    if (ready && sessionOk) void load();
  }, [ready, sessionOk, load]);

  return (
    <div className="space-y-8 pb-12">
      <AdminPageHeader
        title="Revenue"
        badge="Business"
        description="Subscription mix and MRR estimate from app_snapshot + admin pricing."
        actions={
          <Link href="/admin/members">
            <Button type="button" variant="outline" size="sm">
              Member directory
            </Button>
          </Link>
        }
      />

      {err && <p className="text-sm text-destructive">{err}</p>}

      {data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <KpiCard
              label="MRR estimate"
              value={`$${data.revenue.mrrUsdEstimate.toFixed(2)}`}
              hint={data.revenue.note}
              icon={Wallet}
            />
            <KpiCard
              label="ARR estimate"
              value={`$${data.revenue.arrUsdEstimate.toFixed(0)}`}
              hint={`${data.pricing.monthlyUsd}/mo · ${data.pricing.yearlyUsd}/yr`}
              icon={TrendingUp}
              accent="blue"
            />
            <KpiCard
              label="Paying"
              value={data.totals.activeOrTrialing}
              hint={`${data.totals.active} active · ${data.totals.trialing} trial`}
              icon={Wallet}
              accent="green"
            />
            <KpiCard
              label="Trials ending"
              value={data.totals.trialsEndingWithin7Days}
              hint={`${data.totals.cancelScheduledAtPeriodEnd} cancel scheduled`}
              icon={AlertTriangle}
              accent="amber"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <GlassCard>
              <CardHeader>
                <CardTitle className="text-base">By status</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {data.byStatus.map((r) => (
                  <Badge key={r.status} variant="outline">
                    {r.status}: {r.count}
                  </Badge>
                ))}
              </CardContent>
            </GlassCard>
            <GlassCard>
              <CardHeader>
                <CardTitle className="text-base">By plan</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {data.byPlan.map((r) => (
                  <Badge key={r.plan} variant="outline">
                    {r.plan}: {r.count}
                  </Badge>
                ))}
              </CardContent>
            </GlassCard>
          </div>

          <p className="text-xs text-muted-foreground">
            {data.totals.totalMembers} total members · {data.totals.free} free tier · {data.totals.pastDue} past due ·{" "}
            {data.totals.canceled} canceled
            {data.snapshotUpdatedAt && (
              <> · Snapshot {new Date(data.snapshotUpdatedAt).toLocaleString()}</>
            )}
          </p>
        </>
      )}
    </div>
  );
}
