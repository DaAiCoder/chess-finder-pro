import * as React from "react";
import { Link } from "wouter";
import {
  MessageCircle,
  Search,
  Crosshair,
  Lock,
  Sparkles,
  ArrowRight,
  CreditCard,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { GatedFeature } from "./SoftGate";

const COPY: Record<
  GatedFeature,
  { title: string; pitch: string; icon: React.ComponentType<{ className?: string }> }
> = {
  coach: {
    title: "Ask Tal — full coach chat",
    pitch: "Your 3-day trial has ended, or you need an active Pro subscription.",
    icon: MessageCircle,
  },
  analysis: {
    title: "Best-Move Analysis Board",
    pitch: "Subscribe to Pro (yearly available) or use a complimentary test account.",
    icon: Search,
  },
  opponent: {
    title: "Opponent Prep",
    pitch: "Full scouting reports are included with Pro after your trial.",
    icon: Crosshair,
  },
};

/**
 * Shown to signed-in members whose 3-day trial ended without a subscription.
 */
export function SubscribeGate({
  feature,
  trialEndsAt,
}: {
  feature: GatedFeature;
  trialEndsAt?: string | null;
}) {
  const copy = COPY[feature];
  const Icon = copy.icon;
  const trialEndLabel =
    trialEndsAt &&
    (() => {
      try {
        return new Date(trialEndsAt).toLocaleString();
      } catch {
        return null;
      }
    })();
  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center p-4 md:p-8">
      <Card className="w-full max-w-2xl p-6 md:p-8 space-y-6 border-amber-700/35 bg-gradient-to-br from-amber-950/25 to-card">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-amber-600/20 text-amber-200">
            <Icon className="w-6 h-6" />
          </span>
          <div className="min-w-0">
            <Badge variant="outline" className="mb-1 text-[10px] border-amber-700/60 text-amber-200">
              <Lock className="w-3 h-3 mr-1" /> Pro required
            </Badge>
            <h1 className="text-xl md:text-2xl font-bold leading-tight">{copy.title}</h1>
            <p className="text-sm text-amber-200/90 leading-snug">{copy.pitch}</p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed">
          New accounts get <strong className="text-foreground">3 days</strong> of full Pro access.
          After that, subscribe to the <strong className="text-foreground">yearly</strong> plan to
          continue. The <strong className="text-foreground">$12.99/mo</strong> option is waitlisted —
          join the list from pricing if you prefer monthly billing later.
        </p>

        {trialEndLabel && (
          <p className="text-xs text-muted-foreground">
            Your trial window ended: <span className="text-foreground">{trialEndLabel}</span>
          </p>
        )}

        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <Link href="/pricing" className="flex-1">
            <Button className="w-full" style={{ backgroundColor: "#769656", color: "white" }}>
              <CreditCard className="w-4 h-4 mr-2" />
              View yearly Pro
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
          <Link href="/account" className="flex-1">
            <Button variant="outline" className="w-full">
              Account
            </Button>
          </Link>
        </div>

        <p className="text-[11px] text-center text-muted-foreground flex items-center justify-center gap-1">
          <Sparkles className="w-3 h-3" />
          Internal testers: ask for a complimentary flag on your account.
        </p>
      </Card>
    </div>
  );
}
