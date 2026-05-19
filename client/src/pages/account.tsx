import * as React from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/queryClient";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { CreditCard, LogOut, BarChart3, Palette, Shield } from "lucide-react";
import { Input } from "@/components/ui/Input";

/**
 * Signed-in account hub: billing, stats, sign out. Guests are sent to login.
 */
export default function AccountPage() {
  const [, setLoc] = useLocation();
  const search = useSearch();
  const qc = useQueryClient();
  const { user, isLoading: userLoading } = useCurrentUser();
  const [logoutBusy, setLogoutBusy] = React.useState(false);

  const [newEmail, setNewEmail] = React.useState("");
  const [emailBusy, setEmailBusy] = React.useState(false);
  const [emailMsg, setEmailMsg] = React.useState<string | null>(null);
  const [emailErr, setEmailErr] = React.useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [pwBusy, setPwBusy] = React.useState(false);
  const [pwMsg, setPwMsg] = React.useState<string | null>(null);
  const [pwErr, setPwErr] = React.useState<string | null>(null);

  useDocumentTitle("Account — Chess Finder Pro");

  React.useEffect(() => {
    const params = new URLSearchParams(search);
    if (params.get("email_updated") === "1") {
      setEmailMsg("Your email address was updated.");
      void qc.invalidateQueries({ queryKey: ["auth", "me"] });
    } else if (params.get("error") === "email_change_invalid") {
      setEmailErr("That email confirmation link is invalid or expired.");
    } else if (params.get("error") === "email_taken") {
      setEmailErr("That email is already in use.");
    } else if (params.get("error") === "email_change_failed") {
      setEmailErr("Could not update email. Try again.");
    }
  }, [search, qc]);

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

  const onRequestEmailChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailErr(null);
    setEmailMsg(null);
    setEmailBusy(true);
    try {
      await api("/api/auth/email-change/request", {
        method: "POST",
        body: JSON.stringify({ newEmail: newEmail.trim() }),
      });
      setEmailMsg(`Confirmation link sent to ${newEmail.trim()}. Check that inbox.`);
      setNewEmail("");
    } catch (err) {
      const code = (err as Error).message;
      if (code === "email_taken") setEmailErr("That email is already in use.");
      else if (code === "email_unchanged") setEmailErr("Enter a different email.");
      else if (code === "rate_limited") setEmailErr("Wait a few minutes before trying again.");
      else setEmailErr("Could not send confirmation email.");
    } finally {
      setEmailBusy(false);
    }
  };

  const onChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwErr(null);
    setPwMsg(null);
    setPwBusy(true);
    try {
      await api("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });
      setPwMsg("Password updated. We emailed you a confirmation if you have an address on file.");
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      const code = (err as Error).message;
      if (code === "invalid_credentials") setPwErr("Current password is incorrect.");
      else if (code === "no_password_set") setPwErr("Use Forgot password on sign-in to set one.");
      else if (code === "password_too_common") setPwErr("Choose a stronger password.");
      else setPwErr("Could not update password.");
    } finally {
      setPwBusy(false);
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
              an active subscription. Subscribe <strong className="text-foreground">monthly</strong> or{" "}
              <strong className="text-foreground">yearly</strong> to continue.
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Security
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 text-sm">
          <form onSubmit={(e) => void onRequestEmailChange(e)} className="space-y-3">
            <p className="text-muted-foreground">
              Change the email you use to sign in. We send a confirmation link to the new address.
            </p>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">New email</label>
              <Input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder={user.email ?? "you@example.com"}
                required
              />
            </div>
            {emailMsg && <p className="text-emerald-400/90 text-xs">{emailMsg}</p>}
            {emailErr && <p className="text-destructive text-xs">{emailErr}</p>}
            <Button type="submit" variant="outline" size="sm" disabled={emailBusy || !newEmail.trim()}>
              {emailBusy ? "Sending…" : "Send email confirmation"}
            </Button>
          </form>

          <form onSubmit={(e) => void onChangePassword(e)} className="space-y-3 border-t border-border/60 pt-4">
            <p className="text-muted-foreground">Update your password.</p>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Current password</label>
              <Input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">New password (min 8)</label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
              />
            </div>
            {pwMsg && <p className="text-emerald-400/90 text-xs">{pwMsg}</p>}
            {pwErr && <p className="text-destructive text-xs">{pwErr}</p>}
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={pwBusy || !currentPassword || newPassword.length < 8}
            >
              {pwBusy ? "Saving…" : "Change password"}
            </Button>
          </form>
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
