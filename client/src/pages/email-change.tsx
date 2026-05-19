import * as React from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { api } from "@/lib/queryClient";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { pageTitle } from "@/lib/brand";

/** Change email while signed out — requires current email + password. */
export default function EmailChangePage() {
  useDocumentTitle(pageTitle("Change email"));

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [newEmail, setNewEmail] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await api("/api/auth/email-change/request-account", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim(),
          password,
          newEmail: newEmail.trim(),
        }),
      });
      setSent(true);
    } catch (e) {
      const code = (e as Error).message;
      if (code === "invalid_credentials") setErr("Incorrect email or password.");
      else if (code === "email_taken") setErr("That new email is already in use.");
      else if (code === "email_unchanged") setErr("New email must be different.");
      else if (code === "rate_limited") setErr("Wait a few minutes before trying again.");
      else setErr("Could not start email change. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardContent className="p-6 space-y-4">
          <h1 className="text-xl font-semibold tracking-tight">Change email</h1>
          {sent ? (
            <div className="space-y-3 text-sm text-muted-foreground">
              <p className="text-foreground font-medium">Check your new inbox</p>
              <p>
                We sent a confirmation link to <strong className="text-foreground">{newEmail}</strong>.
                Click it to finish updating your email.
              </p>
              <Button variant="outline" asChild>
                <a href="/login">Back to sign in</a>
              </Button>
            </div>
          ) : (
            <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Verify your account, then confirm the new address via email.
              </p>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Current email</label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Password</label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">New email</label>
                <Input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>
              {err && <p className="text-sm text-destructive">{err}</p>}
              <Button
                type="submit"
                disabled={busy}
                className="w-full"
                style={{ backgroundColor: "#769656", color: "white" }}
              >
                {busy ? "Sending…" : "Send confirmation link"}
              </Button>
              <p className="text-center text-[11px] text-muted-foreground">
                <a href="/login" className="hover:underline underline-offset-2">
                  Back to sign in
                </a>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
