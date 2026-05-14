import * as React from "react";
import { Redirect } from "wouter";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import LandingPage from "./landing";

/**
 * Root route. Anonymous / signed-out users see the marketing landing
 * page; signed-in users go straight to the analysis board.
 *
 * The redirect uses `wouter`'s declarative `<Redirect />` so the browser
 * URL actually changes to `/analysis` — that way bookmarking the right
 * page just works.
 */
export default function Home() {
  const { user, isLoading } = useCurrentUser();
  if (isLoading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (user && !user.anonymous) {
    return <Redirect to="/analysis" />;
  }
  return <LandingPage />;
}
