import * as React from "react";
import { Zap, Mail, UserPlus } from "lucide-react";
import { adminJson, useAdminAuth } from "@/lib/adminApi";
import {
  AdminPageHeader,
  GlassCard,
  KpiCard,
  FunnelStep,
  DataTable,
} from "@/components/admin/admin-ui";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

interface ProductData {
  activation: {
    totalMembers: number;
    withEmail: number;
    importedGame: number;
    analyzedGame: number;
    trainingAttempt: number;
    gameAndTraining: number;
    rates: Record<string, number>;
  };
  signupMethods: { method: string; count: number }[];
  onboarding: { members: number; onboardingFlagInPrefs: number; note: string };
}

export default function AdminProductPage() {
  const { sessionOk, adminKey, setAdminKey, ready } = useAdminAuth();
  const [data, setData] = React.useState<ProductData | null>(null);
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
      setData(await adminJson<ProductData>("/api/admin/product", adminKey.trim() || undefined));
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

  const a = data?.activation;

  return (
    <div className="space-y-8 pb-12">
      <AdminPageHeader
        title="Activation"
        badge="Product"
        description="How sign-ups convert into importers, analyzers, and trainers."
        actions={
          <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </Button>
        }
      />

      {err && <p className="text-sm text-destructive">{err}</p>}

      {a && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <KpiCard label="Members" value={a.totalMembers} icon={UserPlus} />
            <KpiCard label="With email" value={`${a.rates.withEmailPct}%`} hint={`${a.withEmail} users`} icon={Mail} accent="blue" />
            <KpiCard label="Engaged" value={`${a.rates.gameAndTrainingPct}%`} hint="Game + training" icon={Zap} accent="amber" />
          </div>

          <GlassCard>
            <CardHeader>
              <CardTitle className="text-base">Funnel (all members)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 max-w-xl">
              <FunnelStep label="Registered" count={a.totalMembers} total={a.totalMembers} />
              <FunnelStep label="Imported game" count={a.importedGame} total={a.totalMembers} />
              <FunnelStep label="Analyzed game" count={a.analyzedGame} total={a.totalMembers} />
              <FunnelStep label="Training attempt" count={a.trainingAttempt} total={a.totalMembers} />
              <FunnelStep label="Game + training" count={a.gameAndTraining} total={a.totalMembers} />
            </CardContent>
          </GlassCard>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <GlassCard>
              <CardHeader>
                <CardTitle className="text-base">Sign-up methods</CardTitle>
              </CardHeader>
              <CardContent>
                <DataTable
                  columns={["Method", "Count"]}
                  rows={(data?.signupMethods ?? []).map((r) => [
                    <Badge key={r.method} variant="outline">{r.method}</Badge>,
                    r.count.toString(),
                  ])}
                  empty="No sign-up events yet"
                />
              </CardContent>
            </GlassCard>
            <GlassCard>
              <CardHeader>
                <CardTitle className="text-base">Onboarding</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>Members: {data?.onboarding.members ?? 0}</p>
                <p>Prefs flag set: {data?.onboarding.onboardingFlagInPrefs ?? 0}</p>
                <p className="text-xs">{data?.onboarding.note}</p>
              </CardContent>
            </GlassCard>
          </div>
        </>
      )}
    </div>
  );
}
