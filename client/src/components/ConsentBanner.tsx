import * as React from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/Button";
import { setConsent, hasConsentDecision } from "@/lib/analytics";

/**
 * Cookie consent banner — Consent Mode v2 compliant.
 *
 * Renders only when the visitor hasn't yet picked Accept / Reject. The two
 * buttons are deliberately equal-weight (same prominence) — required for
 * valid GDPR / CPRA consent. On a choice, we update Google's consent
 * signals via `setConsent` (no-op safe when gtag isn't loaded yet) and
 * remember the decision in localStorage.
 */
export function ConsentBanner() {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    // Defer the visibility check to next tick so the banner doesn't flash
    // before our localStorage read has settled in the analytics module.
    const id = setTimeout(() => setOpen(!hasConsentDecision()), 50);
    return () => clearTimeout(id);
  }, []);

  if (!open) return null;

  const decide = (grant: boolean) => {
    setConsent(grant);
    setOpen(false);
  };

  return (
    <div
      role="region"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4 pointer-events-none"
    >
      <div className="pointer-events-auto max-w-3xl mx-auto rounded-lg border border-border bg-card/95 backdrop-blur shadow-lg p-4 md:p-5 flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
        <p className="text-xs md:text-sm text-muted-foreground leading-relaxed md:flex-1">
          We use a single strictly-necessary cookie to keep you signed in. We'd
          also like to use Google Analytics + Google Ads cookies to understand
          which features people use and measure ads — but only if you agree.
          You can change your mind anytime by clearing the{" "}
          <code className="text-[10px]">cfp_consent</code> key in localStorage.{" "}
          <Link href="/legal/privacy" className="underline-offset-2 hover:underline">
            Read our privacy policy
          </Link>
          .
        </p>
        <div className="flex gap-2 md:flex-col lg:flex-row md:shrink-0">
          <Button
            type="button"
            variant="outline"
            className="flex-1 md:flex-none"
            onClick={() => decide(false)}
          >
            Reject all
          </Button>
          <Button
            type="button"
            className="flex-1 md:flex-none"
            style={{ backgroundColor: "#769656", color: "white" }}
            onClick={() => decide(true)}
          >
            Accept all
          </Button>
        </div>
      </div>
    </div>
  );
}
