import * as React from "react";
import { Server, Database, CheckCircle2, XCircle } from "lucide-react";
import { adminJson, useAdminAuth } from "@/lib/adminApi";
import { AdminPageHeader, GlassCard, DataTable } from "@/components/admin/admin-ui";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

interface OpsData {
  database: boolean;
  snapshot: { updatedAt: string | null; payloadBytes: number };
  tables: { name: string; rowEstimate: number }[];
  env: Record<string, boolean>;
  links: Record<string, string>;
}

function EnvRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
      <span className="text-sm font-mono text-muted-foreground">{label}</span>
      {ok ? (
        <CheckCircle2 className="h-4 w-4 text-[#a8d08d]" />
      ) : (
        <XCircle className="h-4 w-4 text-rose-400" />
      )}
    </div>
  );
}

export default function AdminOpsPage() {
  const { sessionOk, adminKey, setAdminKey, ready } = useAdminAuth();
  const [data, setData] = React.useState<OpsData | null>(null);
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
      setData(await adminJson<OpsData>("/api/admin/ops", adminKey.trim() || undefined));
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

  const snapKb = data ? Math.round(data.snapshot.payloadBytes / 1024) : 0;

  return (
    <div className="space-y-8 pb-12">
      <AdminPageHeader
        title="Ops & health"
        badge="System"
        description="Database tables, snapshot freshness, and production env checklist."
        actions={
          <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </Button>
        }
      />

      {err && <p className="text-sm text-destructive">{err}</p>}

      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <GlassCard>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Database className="h-4 w-4" />
                Snapshot
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                Status:{" "}
                <span className={data.database ? "text-[#a8d08d]" : "text-rose-400"}>
                  {data.database ? "Connected" : "Offline"}
                </span>
              </p>
              <p>Updated: {data.snapshot.updatedAt ? new Date(data.snapshot.updatedAt).toLocaleString() : "—"}</p>
              <p>Payload size: ~{snapKb.toLocaleString()} KB</p>
            </CardContent>
          </GlassCard>

          <GlassCard>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Server className="h-4 w-4" />
                Environment
              </CardTitle>
            </CardHeader>
            <CardContent>
              {Object.entries(data.env).map(([k, v]) => (
                <EnvRow key={k} label={k} ok={v} />
              ))}
            </CardContent>
          </GlassCard>

          <GlassCard className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Table row estimates</CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={["Table", "Rows (est.)"]}
                rows={data.tables.map((t) => [t.name, t.rowEstimate.toLocaleString()])}
              />
            </CardContent>
          </GlassCard>

          <GlassCard className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">External dashboards</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              {Object.entries(data.links).map(([k, url]) => (
                <a
                  key={k}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm px-4 py-2 rounded-lg border border-white/10 bg-white/5 hover:border-[#769656]/40 transition-colors"
                >
                  {k}
                </a>
              ))}
            </CardContent>
          </GlassCard>
        </div>
      )}
    </div>
  );
}
