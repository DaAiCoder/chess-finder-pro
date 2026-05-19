import * as React from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/queryClient";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { trackEvent, trackBeginCheckout } from "@/lib/analytics";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { pageTitle, APP_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

interface SitePricing {
  monthlyUsd: number;
  yearlyUsd: number;
  currency: string;
  updatedAt: string | null;
}

type Plan = "monthly" | "yearly";

const PRICING_RESUME_KEY = "cfp_pricing_resume_plan";

export default function PricingPage() {
  const [, setLoc] = useLocation();
  const search = useSearch();
  const params = React.useMemo(() => new URLSearchParams(search), [search]);
  const canceled = params.get("canceled") === "1";

  const { user } = useCurrentUser();
  const signedIn = !!user?.authenticated;

  const { data: pricing, isLoading } = useQuery<SitePricing>({
    queryKey: ["/api/pricing"],
    queryFn: () => api<SitePricing>("/api/pricing"),
    staleTime: 60_000,
  });

  const [plan, setPlan] = React.useState<Plan>("yearly");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  useDocumentTitle(
    pageTitle("Pricing"),
    `3-day full Pro trial, then subscribe monthly or yearly. ${APP_NAME} with Ask Tal, deep analysis, and every trainer.`,
  );

  React.useEffect(() => {
    trackEvent("page_view", { page: "pricing" });
  }, []);

  const fmt = React.useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: pricing?.currency ?? "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [pricing?.currency],
  );

  const monthly = pricing?.monthlyUsd ?? 12.99;
  const yearly = pricing?.yearlyUsd ?? 79;
  const yearlyMonthly = yearly / 12;
  const yearlyAnnual = monthly * 12;
  const savingsPct =
    yearlyAnnual > 0 ? Math.round(((yearlyAnnual - yearly) / yearlyAnnual) * 100) : 0;

  const checkoutResumeRef = React.useRef(false);

  const startCheckout = async (selected: Plan) => {
    setErr(null);
    const value = selected === "monthly" ? monthly : yearly;
    trackBeginCheckout({ plan: selected, value, currency: pricing?.currency ?? "USD" });
    if (!signedIn) {
      try {
        sessionStorage.setItem(PRICING_RESUME_KEY, selected);
      } catch {
        /* private mode */
      }
      setLoc(`/signup?mode=register&next=${encodeURIComponent(`/pricing?plan=${selected}`)}`);
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ url: string }>("/api/billing/checkout-session", {
        method: "POST",
        body: JSON.stringify({ plan: selected }),
      });
      if (res?.url) {
        try {
          sessionStorage.removeItem(PRICING_RESUME_KEY);
        } catch {
          /* noop */
        }
        window.location.href = res.url;
      } else {
        checkoutResumeRef.current = false;
        setErr("Could not start checkout. Please try again.");
      }
    } catch (e) {
      checkoutResumeRef.current = false;
      const msg = (e as Error).message;
      if (msg === "billing_disabled") {
        setErr("Payments aren't enabled on this server yet.");
      } else if (msg === "price_not_configured") {
        setErr("This plan isn't configured on the server yet.");
      } else if (msg === "auth_required") {
        try {
          sessionStorage.setItem(PRICING_RESUME_KEY, selected);
        } catch {
          /* noop */
        }
        setLoc(`/signup?mode=register&next=${encodeURIComponent(`/pricing?plan=${selected}`)}`);
      } else {
        setErr("Checkout failed. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  // Auto-resume checkout after sign-in: URL `?plan=` and/or sessionStorage
  // fallback if `next` was dropped (magic link, bookmarked /signup, etc.).
  React.useEffect(() => {
    if (!signedIn) {
      checkoutResumeRef.current = false;
      return;
    }
    let wantPlan = params.get("plan");
    if (wantPlan !== "monthly" && wantPlan !== "yearly") {
      try {
        const stored = sessionStorage.getItem(PRICING_RESUME_KEY);
        if (stored === "monthly" || stored === "yearly") wantPlan = stored;
      } catch {
        /* noop */
      }
    }
    if (wantPlan === "monthly" || wantPlan === "yearly") {
      try {
        sessionStorage.removeItem(PRICING_RESUME_KEY);
      } catch {
        /* noop */
      }
      if (checkoutResumeRef.current) return;
      checkoutResumeRef.current = true;
      setPlan(wantPlan);
      void startCheckout(wantPlan);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, search]);

  return (
    <div className="px-4 py-10 md:py-14 max-w-5xl mx-auto">
      <div className="text-center mb-8 space-y-3">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-400 font-semibold">
          Pricing
        </p>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
          Pro access after your trial
        </h1>
        <p className="text-sm text-muted-foreground max-w-xl mx-auto">
          Every new account gets <strong className="text-foreground">3 days</strong> of full Pro.
          After that, subscribe <strong className="text-foreground">monthly</strong> or{" "}
          <strong className="text-foreground">yearly</strong>. There is no permanent free tier
          (internal test accounts excepted).
        </p>
      </div>

      {canceled && (
        <p className="text-center text-xs text-amber-400 mb-4">
          Checkout was canceled. You can pick a different plan below.
        </p>
      )}

      <div className="flex items-center justify-center mb-8">
        <PlanToggle plan={plan} onChange={setPlan} savingsPct={savingsPct} />
      </div>

      <div className="grid md:grid-cols-2 gap-4 md:gap-6 mb-10">
        <PlanCard
          tag="Trial"
          title="3-day full Pro"
          price="Free"
          subtitle="once per account, then subscribe"
          features={[
            "Unlimited Ask Tal, Analysis, Blind Tactics, and Opponent Prep during the trial",
            "Same feature set as paid Pro — no watered-down build",
            "After day 3 you need Pro (monthly or yearly)",
            "Guests: limited previews on /welcome only until you register",
          ]}
          cta={{
            label: signedIn ? "Trial status in Account" : "Create account to start trial",
            onClick: () => (signedIn ? setLoc("/account") : setLoc("/signup?mode=register")),
            disabled: false,
            primary: false,
          }}
        />
        <PlanCard
          tag="Pro"
          title={APP_NAME}
          accent
          price={isLoading ? "…" : fmt.format(plan === "monthly" ? monthly : yearlyMonthly)}
          subtitle={
            isLoading
              ? "per month"
              : plan === "monthly"
                ? "per month, billed monthly"
                : `per month, billed ${fmt.format(yearly)} yearly`
          }
          badge={plan === "yearly" && savingsPct > 0 ? `Save ${savingsPct}%` : undefined}
          features={[
            "Unlimited Ask Tal, Analysis, Blind Tactics, Opponent Prep",
            "Priority Stockfish depth + faster coach responses",
            "Cross-device sync for ratings, history, saved positions",
            "Repertoire trainer + deviation drills",
            "Monthly or yearly checkout via Stripe · cancel from billing portal",
            plan === "monthly"
              ? "Billed monthly after your 3-day trial ends"
              : "Billed yearly after your 3-day trial ends (best value)",
          ]}
          cta={{
            label: busy
              ? "Opening checkout…"
              : plan === "monthly"
                ? "Subscribe monthly"
                : "Subscribe yearly",
            onClick: () => void startCheckout(plan),
            disabled: busy,
            primary: true,
          }}
          footer={
            err ? (
              <p className="text-xs text-destructive">{err}</p>
            ) : (
              <p className="text-[10px] text-muted-foreground">
                Secure checkout by Stripe · Refund within 7 days of first charge
              </p>
            )
          }
        />
      </div>

      <FaqBlock currency={pricing?.currency ?? "USD"} monthlyPrice={fmt.format(monthly)} />

      <p className="text-center text-[11px] text-muted-foreground mt-10">
        By starting a subscription you agree to our{" "}
        <a href="/legal/terms" className="underline-offset-2 hover:underline">
          terms
        </a>{" "}
        and{" "}
        <a href="/legal/refund" className="underline-offset-2 hover:underline">
          refund policy
        </a>
        . Read our{" "}
        <a href="/legal/privacy" className="underline-offset-2 hover:underline">
          privacy policy
        </a>{" "}
        for what we do with your data.
      </p>
    </div>
  );
}

function PlanToggle({
  plan,
  onChange,
  savingsPct,
}: {
  plan: Plan;
  onChange: (p: Plan) => void;
  savingsPct: number;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Billing period"
      className="inline-flex rounded-full border border-border bg-card p-1 text-sm"
    >
      <button
        type="button"
        role="radio"
        aria-checked={plan === "monthly"}
        onClick={() => onChange("monthly")}
        className={cn(
          "px-4 py-1.5 rounded-full transition-colors",
          plan === "monthly"
            ? "bg-emerald-500/10 text-emerald-400"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        Monthly
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={plan === "yearly"}
        onClick={() => onChange("yearly")}
        className={cn(
          "px-4 py-1.5 rounded-full transition-colors flex items-center gap-2",
          plan === "yearly"
            ? "bg-emerald-500/10 text-emerald-400"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        Yearly
        {savingsPct > 0 && (
          <span className="text-[10px] font-semibold rounded-full bg-emerald-500/20 text-emerald-300 px-2 py-0.5">
            Save {savingsPct}%
          </span>
        )}
      </button>
    </div>
  );
}

function PlanCard({
  tag,
  title,
  price,
  subtitle,
  features,
  cta,
  accent,
  badge,
  footer,
}: {
  tag: string;
  title: string;
  price: string;
  subtitle: string;
  features: string[];
  cta: { label: string; onClick: () => void; disabled?: boolean; primary: boolean };
  accent?: boolean;
  badge?: string;
  footer?: React.ReactNode;
}) {
  return (
    <Card className={cn(accent && "border-emerald-500/40 shadow-emerald-500/10 shadow-lg")}>
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {tag}
          </span>
          {badge && (
            <span className="text-[10px] font-semibold rounded-full bg-emerald-500/20 text-emerald-300 px-2 py-0.5">
              {badge}
            </span>
          )}
        </div>
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-4xl font-bold tracking-tight">{price}</span>
            <span className="text-xs text-muted-foreground">{subtitle}</span>
          </div>
        </div>
        <ul className="space-y-2 text-sm">
          {features.map((f) => (
            <li key={f} className="flex gap-2">
              <span className="text-emerald-400 shrink-0 mt-0.5">✓</span>
              <span className="text-muted-foreground">{f}</span>
            </li>
          ))}
        </ul>
        <Button
          type="button"
          disabled={cta.disabled}
          onClick={cta.onClick}
          className={cn(
            "w-full h-11 text-sm font-medium",
            cta.primary && "bg-emerald-500 hover:bg-emerald-600 text-white",
          )}
          variant={cta.primary ? "default" : "outline"}
          style={cta.primary ? { backgroundColor: "#769656", color: "white" } : undefined}
        >
          {cta.label}
        </Button>
        {footer}
      </CardContent>
    </Card>
  );
}

function FaqBlock({ currency, monthlyPrice }: { currency: string; monthlyPrice: string }) {
  void currency;
  const faqs: Array<{ q: string; a: React.ReactNode }> = [
    {
      q: "What do I get with Pro?",
      a: (
        <>
          Unlimited access to every flagship feature — Ask Tal (the AI coach in
          the voice of any world champion), deep Analysis on your imported games,
          Blind Tactics, Opponent Prep, the Repertoire Trainer, and priority
          Stockfish depth. New accounts get a <strong>3-day full trial</strong>;
          after that you need a paid monthly or yearly plan.
        </>
      ),
    },
    {
      q: "Can I cancel anytime?",
      a: (
        <>
          Yes. Use the "Manage billing" link in your account to cancel in one
          click — you'll keep Pro access until the end of the period you paid for.
          No emails to send, no friction.
        </>
      ),
    },
    {
      q: "Is my payment secure?",
      a: (
        <>
          Checkout runs on Stripe's hosted page; we never see or store your card
          details. Stripe is PCI-DSS Level 1 certified and handles billions of
          dollars in subscriptions every year.
        </>
      ),
    },
    {
      q: "What if I'm not happy?",
      a: (
        <>
          Email us within 7 days of your first paid charge and we'll refund the
          period in full — no questions asked. Details on the{" "}
          <a href="/legal/refund" className="underline-offset-2 hover:underline">
            refund page
          </a>
          .
        </>
      ),
    },
    {
      q: "How does the yearly plan save money?",
      a: (
        <>
          Yearly billing is one upfront payment that comes out to less per month
          than the {monthlyPrice} monthly plan. If you cancel mid-year, the
          remaining time on your plan stays active until renewal.
        </>
      ),
    },
    {
      q: "Will I lose my training progress if I cancel?",
      a: (
        <>
          No — your account, history, and stats stay intact. If you cancel after
          subscribing, Pro-only pages lock again until you resubscribe (there is no
          permanent free Pro tier except for internal test accounts).
        </>
      ),
    },
    {
      q: "Do you offer student / coach / multi-seat pricing?",
      a: (
        <>
          We don't yet, but we plan to. If you teach chess and want bulk access
          for your students, email us via the{" "}
          <a href="/legal/contact" className="underline-offset-2 hover:underline">
            contact page
          </a>{" "}
          and we'll work something out.
        </>
      ),
    },
    {
      q: "Does Pro include Lichess / Chess.com integration?",
      a: (
        <>
          You can sign in with Lichess and import your games from Lichess or
          Chess.com on any plan. Pro adds unlimited analysis depth on those
          imported games.
        </>
      ),
    },
  ];

  return (
    <section className="mt-10 max-w-3xl mx-auto space-y-3">
      <h2 className="text-center text-xl font-semibold tracking-tight mb-2">
        Frequently asked questions
      </h2>
      <div className="space-y-2">
        {faqs.map(({ q, a }) => (
          <FaqItem key={q} q={q} a={a} />
        ))}
      </div>
    </section>
  );
}

function FaqItem({ q, a }: { q: string; a: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
      className="border border-border rounded-lg bg-card/40 group"
    >
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium flex items-center justify-between gap-3">
        <span>{q}</span>
        <span className="text-muted-foreground text-xs">{open ? "−" : "+"}</span>
      </summary>
      <div className="px-4 pb-4 text-sm text-muted-foreground leading-relaxed">{a}</div>
    </details>
  );
}
