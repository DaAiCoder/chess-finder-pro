import * as React from "react";
import { useSearch } from "wouter";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { api } from "@/lib/queryClient";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export default function ResetPasswordPage() {
  const search = useSearch();
  const token = React.useMemo(() => new URLSearchParams(search).get("token") ?? "", [search]);

  useDocumentTitle("Reset password — Chess Finder Pro");

  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!token) {
      setErr("This reset link is invalid. Request a new one from the sign-in page.");
      return;
    }
    if (password.length < 8) {
      setErr("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setErr("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await api("/api/auth/password-reset/confirm", {
        method: "POST",
        body: JSON.stringify({ token, newPassword: password }),
      });
      setDone(true);
    } catch (e) {
      const code = (e as Error).message;
      if (code === "reset_invalid") {
        setErr("This link is invalid or expired. Request a new reset link.");
      } else if (code === "password_too_common") {
        setErr("Choose a stronger password — that one is too common.");
      } else {
        setErr("Could not reset password. Try again or request a new link.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardContent className="p-6 space-y-4">
          <h1 className="text-xl font-semibold tracking-tight">Reset password</h1>
          {done ? (
            <div className="space-y-3 text-sm text-muted-foreground">
              <p className="text-foreground font-medium">Password updated.</p>
              <p>You can sign in with your new password.</p>
              <Button asChild style={{ backgroundColor: "#769656", color: "white" }}>
                <a href="/login">Sign in</a>
              </Button>
            </div>
          ) : (
            <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Choose a new password for your account.
              </p>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">New password</label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Confirm password</label>
                <Input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
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
                {busy ? "Saving…" : "Update password"}
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
