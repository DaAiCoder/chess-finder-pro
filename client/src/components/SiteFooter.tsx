import { Link } from "wouter";

/**
 * Public-page footer with policy links. Required for Google Ads policy review
 * — every public page that runs ad campaigns must surface Privacy, Terms,
 * Refund, and Contact.
 */
export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-border mt-16 py-8 text-xs text-muted-foreground">
      <div className="max-w-6xl mx-auto px-4 grid gap-6 md:grid-cols-4">
        <div className="space-y-2 md:col-span-2">
          <div className="flex items-center gap-2 text-foreground font-semibold">
            <span
              aria-hidden
              className="inline-flex h-6 w-6 items-center justify-center rounded bg-emerald-600 text-white text-sm"
            >
              ♞
            </span>
            Chess Finder Pro
          </div>
          <p className="leading-relaxed">
            Train smarter. The AI coach, deep analysis, blind tactics,
            opponent prep, and 15+ specialty trainers — all in one place.
          </p>
        </div>

        <div className="space-y-2">
          <div className="text-foreground font-semibold">Product</div>
          <ul className="space-y-1.5">
            <li>
              <Link href="/welcome" className="hover:text-foreground">
                Features
              </Link>
            </li>
            <li>
              <Link href="/pricing" className="hover:text-foreground">
                Pricing
              </Link>
            </li>
            <li>
              <Link href="/account" className="hover:text-foreground">
                Account
              </Link>
            </li>
            <li>
              <Link href="/training" className="hover:text-foreground">
                Trainers
              </Link>
            </li>
            <li>
              <Link href="/coach" className="hover:text-foreground">
                Ask Tal coach
              </Link>
            </li>
          </ul>
        </div>

        <div className="space-y-2">
          <div className="text-foreground font-semibold">Legal</div>
          <ul className="space-y-1.5">
            <li>
              <Link href="/legal/privacy" className="hover:text-foreground">
                Privacy
              </Link>
            </li>
            <li>
              <Link href="/legal/terms" className="hover:text-foreground">
                Terms
              </Link>
            </li>
            <li>
              <Link href="/legal/refund" className="hover:text-foreground">
                Refund policy
              </Link>
            </li>
            <li>
              <Link href="/legal/contact" className="hover:text-foreground">
                Contact
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 mt-6 pt-4 border-t border-border flex flex-wrap items-center justify-between gap-2">
        <div>© {year} Chess Finder Pro. All rights reserved.</div>
        <div className="text-[10px]">
          Secure payments by Stripe · Built on Lichess + chess.com public APIs
        </div>
      </div>
    </footer>
  );
}
