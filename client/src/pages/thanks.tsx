import * as React from "react";
import { Link, useSearch } from "wouter";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/queryClient";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { trackPurchase } from "@/lib/analytics";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { pageTitle } from "@/lib/brand";

interface SubscriptionState {
  status: string;
  plan: "monthly" | "yearly" | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  active: boolean;
}

/**
 * Post-checkout page. Stripe redirects here with `?cs={session_id}`. We poll
 * `/api/billing/subscription` until the webhook flips status to active, then
 * fire the `purchase` GA4 event + Google Ads Subscribe conversion
 * (AW-931139138/i8LQCLjByq8cEMKcgLwD).
 */
export default function ThanksPage() {
  const search = useSearch();
  const params = React.useMemo(() => new URLSearchParams(search), [search]);
  const cs = params.get("cs");

  const { user, refetch } = useCurrentUser();
  const [sub, setSub] = React.useState<SubscriptionState | null>(null);
  const [tries, setTries] = React.useState(0);
  const firedRef = React.useRef(false);

  useDocumentTitle(pageTitle("Welcome to Pro"));

  React.useEffect(() => {
    let stopped = false;
    let attempts = 0;
    async function poll() {
      try {
        const s = await api<SubscriptionState>("/api/billing/subscription");
        if (stopped) return;
        setSub(s);
        setTries(attempts);
        if (s.active) {
          if (!firedRef.current) {
            firedRef.current = true;
            // Conversion fire. We don't know the exact paid amount from the
            // client — use the plan as a stable proxy. Server-side Enhanced
            // Conversions can refine this later.
            trackPurchase({
              transactionId: cs ?? `unknown_${Date.now()}`,
              plan: s.plan ?? "monthly",
              value: s.plan === "yearly" ? 79 : 12.99,
              currency: "USD",
            });
            void refetch();
          }
          return;
        }
        attempts += 1;
        if (attempts < 12) {
          setTimeout(poll, 1500);
        }
      } catch {
        attempts += 1;
        if (attempts < 6) setTimeout(poll, 2500);
      }
    }
    void poll();
    return () => {
      stopped = true;
    };
  }, [cs, refetch]);

  const stillWaiting = !sub?.active && tries < 12;

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <Card className="border-emerald-500/40 shadow-emerald-500/10 shadow-lg">
          <CardContent className="p-6 space-y-4 text-center">
            <div className="mx-auto h-12 w-12 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center justify-center text-2xl">
              ✓
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {sub?.active ? "Welcome to Pro" : "Finishing up your subscription…"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {sub?.active ? (
                <>
                  Your <strong className="text-foreground">{sub.plan ?? ""}</strong>{" "}
                  subscription is active
                  {sub.currentPeriodEnd && (
                    <>
                      {" "}
                      and renews on{" "}
                      <strong className="text-foreground">
                        {new Date(sub.currentPeriodEnd).toLocaleDateString()}
                      </strong>
                    </>
                  )}
                  . Every Pro feature is unlocked for{" "}
                  <strong className="text-foreground">
                    {user?.username ?? "your account"}
                  </strong>
                  .
                </>
              ) : stillWaiting ? (
                "We're just confirming the payment with Stripe — this usually takes a few seconds. You don't need to refresh."
              ) : (
                "We couldn't confirm the subscription automatically. Check the email Stripe sent you, then refresh — or contact support if anything looks off."
              )}
            </p>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <Link href="/analysis">
                <Button variant="outline" className="w-full">
                  Try Analysis
                </Button>
              </Link>
              <Link href="/coach">
                <Button
                  className="w-full"
                  style={{ backgroundColor: "#769656", color: "white" }}
                >
                  Open Ask Tal
                </Button>
              </Link>
            </div>

            <p className="text-[11px] text-muted-foreground pt-2">
              You can{" "}
              <Link href="/account/billing" className="underline-offset-2 hover:underline">
                manage billing
              </Link>{" "}
              or cancel anytime.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
