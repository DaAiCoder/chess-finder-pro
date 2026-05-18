import * as React from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { SoftGate, type GatedFeature } from "./SoftGate";
import { SubscribeGate } from "./SubscribeGate";

/**
 * Renders `children` for signed-in (non-anonymous) users; otherwise
 * swaps in a `<SoftGate />` page that pitches the feature and links
 * back to the embedded preview on /welcome.
 *
 * While the auth probe is in flight we show a lightweight placeholder
 * — not a full-page spinner, because the route is otherwise dark.
 */
export function RequireAuth({
  feature,
  children,
}: {
  feature: GatedFeature;
  children: React.ReactNode;
}) {
  const { user, isLoading } = useCurrentUser();

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!user || user.anonymous) {
    return <SoftGate feature={feature} />;
  }

  if (user.hasProAccess !== true) {
    return <SubscribeGate feature={feature} trialEndsAt={user.trialEndsAt} />;
  }

  return <>{children}</>;
}
