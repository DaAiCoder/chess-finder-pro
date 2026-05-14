import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { api } from "@/lib/queryClient";

interface SitePricing {
  monthlyUsd: number;
  yearlyUsd: number;
  currency: string;
  updatedAt: string | null;
}

/**
 * Operator-only pricing editor. Requires `ADMIN_API_KEY` on the server;
 * paste the same key below (sent as `Authorization: Bearer …` only for
 * this request — never stored).
 */
export default function AdminPricingPage() {
  const [pricing, setPricing] = React.useState<SitePricing | null>(null);
  const [adminKey, setAdminKey] = React.useState("");
  const [monthly, setMonthly] = React.useState("");
  const [yearly, setYearly] = React.useState("");
  const [currency, setCurrency] = React.useState("USD");
  const [err, setErr] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    void api<SitePricing>("/api/pricing")
      .then((p) => {
        setPricing(p);
        setMonthly(String(p.monthlyUsd));
        setYearly(String(p.yearlyUsd));
        setCurrency(p.currency);
      })
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setErr(null);
    setOk(null);
    if (!adminKey.trim()) {
      setErr("Enter the admin API key from the server environment (ADMIN_API_KEY).");
      return;
    }
    try {
      const res = await fetch("/api/admin/pricing", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminKey.trim()}`,
        },
        body: JSON.stringify({
          monthlyUsd: Number(monthly),
          yearlyUsd: Number(yearly),
          currency: currency.trim() || "USD",
        }),
      });
      const body = (await res.json()) as { error?: string; pricing?: SitePricing };
      if (!res.ok) {
        setErr(body.error ?? res.statusText);
        return;
      }
      if (body.pricing) {
        setPricing(body.pricing);
        setMonthly(String(body.pricing.monthlyUsd));
        setYearly(String(body.pricing.yearlyUsd));
        setCurrency(body.pricing.currency);
      }
      setOk("Pricing saved.");
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  if (loading) {
    return (
      <div className="p-6 text-sm text-muted-foreground max-w-lg mx-auto">Loading current prices…</div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-lg mx-auto space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Admin — subscription pricing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Public prices are read from <code className="text-[11px]">data/site-pricing.json</code>.
            Defaults are $12.99/mo and $79/yr until you change them here.
          </p>
          {pricing?.updatedAt && (
            <p className="text-xs text-muted-foreground">Last updated: {pricing.updatedAt}</p>
          )}
          <div className="space-y-2">
            <Label>Monthly (USD number)</Label>
            <Input value={monthly} onChange={(e) => setMonthly(e.target.value)} inputMode="decimal" />
          </div>
          <div className="space-y-2">
            <Label>Yearly (USD number)</Label>
            <Input value={yearly} onChange={(e) => setYearly(e.target.value)} inputMode="decimal" />
          </div>
          <div className="space-y-2">
            <Label>Currency code</Label>
            <Input value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={8} />
          </div>
          <div className="space-y-2">
            <Label>Admin API key</Label>
            <Input
              type="password"
              autoComplete="off"
              value={adminKey}
              onChange={(e) => setAdminKey(e.target.value)}
              placeholder="ADMIN_API_KEY from server .env"
            />
          </div>
          {err && <p className="text-xs text-destructive">{err}</p>}
          {ok && <p className="text-xs text-emerald-600">{ok}</p>}
          <Button onClick={() => void save()} style={{ backgroundColor: "#769656", color: "white" }}>
            Save pricing
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
