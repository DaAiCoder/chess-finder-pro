import * as React from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/queryClient";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { CreditCard, LogOut, BarChart3, Palette } from "lucide-react";

/**
 * Signed-in account hub: billing, stats, sign out. Guests are sent to login.
 */
export default function AccountPage() {
  const [, setLoc] = useLocation();
  const qc = useQueryClient();
  const { user, isLoading: userLoading } = useCurrentUser();
  const [logoutBusy, setLogoutBusy] = React.useState(false);

  useDocumentTitle("Account — Chess Finder Pro");

  React.useEffect(() => {
    if (!userLoading && user && !user.authenticated) {
      setLoc(`/login?next=${encodeURIComponent("/account")}`);
    }
  }, [user, userLoading, setLoc]);

  const onLogout = async () => {
    setLogoutBusy(true);
    try {
      await api<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
      await qc.invalidateQueries({ queryKey: ["auth", "me"] });
      setLoc("/");
    } catch {
      setLogoutBusy(false);
    }
  };

  if (userLoading || !user) {
    return (
      <div className="px-4 py-10 max-w-xl mx-auto text-sm text-muted-foreground">Loading account…</div>
    );
  }

  if (!user.authenticated) {
    return null;
  }

  const needsSub = user.hasProAccess !== true && user.complimentary !== true;
  const trialEnds =
    user.trialEndsAt &&
    (() => {
      try {
        return new Date(user.trialEndsAt).toLocaleString();
      } catch {
        return null;
      }
    })();

  return (
    <div className="px-4 py-10 max-w-xl mx-auto space-y-6">
      {needsSub && (
        <Card className="border-amber-500/40 bg-amber-950/25">
          <CardContent className="p-4 text-sm text-muted-foreground space-y-2">
            <p className="font-medium text-amber-200/95">Pro access required</p>
            <p>
              Your <strong className="text-foreground">3-day trial</strong> has ended or you need
              an active subscription. Subscribe to the <strong className="text-foreground">yearly</strong>{" "}
              plan to continue. Monthly billing is waitlisted — use{" "}
              <Link href="/legal/contact" className="underline text-foreground">
                Contact
              </Link>{" "}
              to join the list.
            </p>
            {trialEnds && <p className="text-xs text-muted-foreground">Access window ended: {trialEnds}</p>}
            <Button asChild className="mt-1" style={{ backgroundColor: "#769656", color: "white" }}>
              <Link href="/pricing">View pricing</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Signed in as <span className="text-foreground font-medium">{user.username}</span>
          {user.email ? (
            <>
              {" "}
              · <span className="text-foreground/90">{user.email}</span>
            </>
          ) : null}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Subscription
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>Upgrade, manage your card, invoices, or cancel from the billing page.</p>
          <Button asChild style={{ backgroundColor: "#769656", color: "white" }}>
            <Link href="/account/billing">Billing &amp; plan</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Progress
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>Training stats, streaks, and rating-style views.</p>
          <Button variant="outline" asChild>
            <Link href="/statistics">My statistics</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Palette className="h-4 w-4" />
            Appearance
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            Board theme and piece set are chosen from the <strong className="text-foreground">settings</strong>{" "}
            control on the Play and Analysis boards and sync to your account.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="outline" size="sm" asChild>
              <Link href="/play">Open Play</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/analysis">Open Analysis</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <LogOut className="h-4 w-4" />
            Session
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Sign out on this device.</p>
          <Button
            type="button"
            variant="destructive"
            disabled={logoutBusy}
            onClick={() => void onLogout()}
          >
            {logoutBusy ? "Signing out…" : "Sign out"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
