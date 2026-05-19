import * as React from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/queryClient";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { pageTitle } from "@/lib/brand";

interface SubscriptionState {
  status: string;
  plan: "monthly" | "yearly" | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  active: boolean;
}

export default function AccountBillingPage() {
  const [, setLoc] = useLocation();
  const { user, isLoading: userLoading } = useCurrentUser();
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  useDocumentTitle(pageTitle("Billing"));

  const { data: sub, isLoading } = useQuery<SubscriptionState>({
    queryKey: ["/api/billing/subscription"],
    queryFn: () => api<SubscriptionState>("/api/billing/subscription"),
    enabled: !!user?.authenticated,
    staleTime: 30_000,
  });

  React.useEffect(() => {
    if (!userLoading && user && !user.authenticated) {
      setLoc(`/login?next=${encodeURIComponent("/account/billing")}`);
    }
  }, [user, userLoading, setLoc]);

  const openPortal = async () => {
    setErr(null);
    setBusy(true);
    try {
      const res = await api<{ url: string }>("/api/billing/portal", { method: "POST" });
      if (res?.url) {
        window.location.href = res.url;
      } else {
        setErr("Could not open the billing portal.");
      }
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === "no_customer") {
        setErr("You don't have a Stripe customer yet — start a subscription first.");
      } else if (msg === "billing_disabled") {
        setErr("Payments aren't enabled on this server yet.");
      } else {
        setErr("Could not open the billing portal. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  if (userLoading || isLoading) {
    return (
      <div className="px-4 py-10 max-w-xl mx-auto text-sm text-muted-foreground">
        Loading account…
      </div>
    );
  }

  const isActive = !!sub?.active;
  const planLabel = sub?.plan === "yearly" ? "Yearly" : sub?.plan === "monthly" ? "Monthly" : "—";
  const renewLabel = sub?.currentPeriodEnd
    ? new Date(sub.currentPeriodEnd).toLocaleDateString()
    : "—";

  return (
    <div className="px-4 py-10 max-w-xl mx-auto space-y-4">
      <p className="text-sm">
        <Link href="/account" className="text-muted-foreground hover:text-foreground underline-offset-2 hover:underline">
          ← Account
        </Link>
      </p>
      <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>

      <Card>
        <CardHeader>
          <CardTitle>Subscription</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Row label="Plan" value={planLabel} />
          <Row
            label="Status"
            value={
              <span
                className={
                  isActive
                    ? "text-emerald-400"
                    : sub?.status === "past_due"
                      ? "text-amber-400"
                      : "text-muted-foreground"
                }
              >
                {sub?.status ?? "none"}
              </span>
            }
          />
          <Row
            label={sub?.cancelAtPeriodEnd ? "Access until" : "Next renewal"}
            value={renewLabel}
          />
          {sub?.cancelAtPeriodEnd && (
            <p className="text-xs text-amber-400">
              Your subscription is set to cancel at the end of the current period.
              Re-enable it from the Stripe billing portal.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Manage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Update your card, view invoices, switch plans, or cancel from the
            Stripe billing portal. Everything happens on Stripe's secure page;
            we never see your card details.
          </p>
          <div className="flex flex-wrap gap-2">
            {isActive ? (
              <Button
                type="button"
                disabled={busy}
                onClick={() => void openPortal()}
                style={{ backgroundColor: "#769656", color: "white" }}
              >
                {busy ? "Opening…" : "Manage billing"}
              </Button>
            ) : (
              <Link href="/pricing">
                <Button style={{ backgroundColor: "#769656", color: "white" }}>
                  See plans
                </Button>
              </Link>
            )}
            <Link href="/legal/refund">
              <Button variant="outline">Refund policy</Button>
            </Link>
            <Link href="/legal/contact">
              <Button variant="outline">Contact support</Button>
            </Link>
          </div>
          {err && <p className="text-xs text-destructive">{err}</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
