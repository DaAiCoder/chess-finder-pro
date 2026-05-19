import * as React from "react";
import { Link } from "wouter";
import {
  X,
  Sparkles,
  MessageCircle,
  Swords,
  Trophy,
  Palette,
  Smartphone,
  Compass,
  Calculator,
  LayoutGrid,
  Shuffle,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/brand";

const STORAGE_KEY = "cfp-orientation-v2-dismissed";

type LinkRow = {
  href: string;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
};

const LINKS: LinkRow[] = [
  {
    href: "/welcome#coach-preview",
    label: "Ask Tal (chat)",
    hint: "Try the coach inline on the landing page; signed-in unlocks unlimited.",
    icon: MessageCircle,
  },
  {
    href: "/play",
    label: "Play vs engine",
    hint: 'Footer: turn on "Coach" for a line after each of your moves.',
    icon: Swords,
  },
  {
    href: "/welcome#analysis-preview",
    label: "Analysis board",
    hint: "Try Stockfish + coach commentary right on the landing page.",
    icon: Sparkles,
  },
  {
    href: "/play/tournaments",
    label: "Tournaments",
    hint: "Swiss rounds vs named persona bots.",
    icon: Trophy,
  },
  {
    href: "/play/variants",
    label: "Variants lobby",
    hint: "Pick White, Black, or Random before starting.",
    icon: Shuffle,
  },
  {
    href: "/training/pawn-structures",
    label: "Pawn structures",
    hint: "Overview → quiz → drills (IQP, Stonewall, Maroczy, …).",
    icon: LayoutGrid,
  },
  {
    href: "/training/plans",
    label: "Plan finder",
    hint: "Pick the right strategic plan, then play the line.",
    icon: Compass,
  },
  {
    href: "/training/calculation-studio",
    label: "Calculation studio",
    hint: "4–8 move blind forcing lines (extends blind tactics).",
    icon: Calculator,
  },
  {
    href: "/statistics",
    label: "My statistics",
    hint: "Board theme preview + other account stats.",
    icon: Palette,
  },
];

/**
 * Shown under the top bar until dismissed. Re-open from the sidebar
 * "What's new" control (dispatches `cfp-show-orientation`).
 */
export function OrientationBanner() {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    try {
      setVisible(window.localStorage.getItem(STORAGE_KEY) !== "1");
    } catch {
      setVisible(true);
    }
  }, []);

  React.useEffect(() => {
    const onShow = () => {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* noop */
      }
      setVisible(true);
    };
    window.addEventListener("cfp-show-orientation", onShow);
    return () => window.removeEventListener("cfp-show-orientation", onShow);
  }, []);

  const dismiss = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* noop */
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      className={cn(
        "border-b border-border bg-gradient-to-r from-emerald-950/40 via-card to-card",
        "px-4 py-3 md:px-6",
      )}
      role="region"
      aria-label={`What is new in ${APP_NAME}`}
    >
      <div className="max-w-5xl mx-auto space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex gap-2 min-w-0">
            <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-600/20 text-emerald-400">
              <Sparkles className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">What changed recently</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                The layout and Analysis page look familiar on purpose. New work is mostly{" "}
                <strong className="text-foreground/90 font-medium">new pages</strong>,{" "}
                <strong className="text-foreground/90 font-medium">coach modes</strong>, and{" "}
                <strong className="text-foreground/90 font-medium">trainers</strong> linked below. On a phone, use the{" "}
                <span className="inline-flex items-center gap-0.5 align-middle">
                  <Smartphone className="w-3 h-3 inline" /> bottom tabs
                </span>{" "}
                (Coach is there too).
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0 h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={dismiss}
            aria-label="Dismiss what is new"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
          {LINKS.map(({ href, label, hint, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                className={cn(
                  "flex gap-2 rounded-lg border border-border/80 bg-background/60 p-2.5",
                  "hover:bg-secondary/80 hover:border-border transition-colors",
                )}
              >
                <Icon className="w-4 h-4 shrink-0 mt-0.5 text-emerald-500/90" />
                <span className="min-w-0">
                  <span className="font-medium text-foreground block leading-tight">{label}</span>
                  <span className="text-muted-foreground leading-snug block mt-0.5">{hint}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <p className="text-[11px] text-muted-foreground text-center md:text-left">
          In the sidebar under <strong className="text-foreground/80">Train</strong>, open{" "}
          <strong className="text-foreground/80">Ask Tal</strong> directly, or expand{" "}
          <strong className="text-foreground/80">Training Hub</strong> for the full trainer list (including the three new
          structure / plan / calculation pages). Show this panel again anytime from{" "}
          <strong className="text-foreground/80">What&apos;s new</strong> above Play Computer.
        </p>
      </div>
    </div>
  );
}

export function triggerOrientationBanner(): void {
  window.dispatchEvent(new Event("cfp-show-orientation"));
}
