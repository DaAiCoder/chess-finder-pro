import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";

/** Unsplash — nature / landscape (static IDs, HTTPS). */
const NATURE_BACKGROUNDS = [
  "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&q=80",
  "https://images.unsplash.com/photo-1472214103451-9374bd1c798e?w=1920&q=80",
  "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1920&q=80",
  "https://images.unsplash.com/photo-1518173946683-a1c8892bbd9f?w=1920&q=80",
  "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=1920&q=80",
  "https://images.unsplash.com/photo-1426604966848-d7adac402bff?w=1920&q=80",
] as const;

export function OperatorLoginScreen({
  mode,
  onSuccess,
}: {
  mode: "fullscreen" | "card";
  onSuccess: () => void;
}) {
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [bgIdx, setBgIdx] = React.useState(0);

  React.useEffect(() => {
    if (mode !== "fullscreen") return;
    const id = window.setInterval(() => {
      setBgIdx((i) => (i + 1) % NATURE_BACKGROUNDS.length);
    }, 10_000);
    return () => window.clearInterval(id);
  }, [mode]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch("/api/operator/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) {
        if (res.status === 503) {
          setErr(body.message ?? "Operator login is not configured on the server.");
        } else {
          setErr(body.error === "invalid_credentials" ? "Invalid username or password." : (body.message ?? "Sign-in failed."));
        }
        return;
      }
      onSuccess();
    } catch {
      setErr("Network error.");
    } finally {
      setLoading(false);
    }
  };

  const form = (
    <Card className={mode === "fullscreen" ? "w-full max-w-md shadow-xl border-border/60" : "w-full max-w-md"}>
      <CardHeader className="space-y-1 pb-2">
        <CardTitle className="text-xl font-semibold tracking-tight">Operator sign in</CardTitle>
        <p className="text-xs text-muted-foreground">Use the server credentials (not your player account).</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void submit(e)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="op-user">Username</Label>
            <Input
              id="op-user"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              className="h-11"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="op-pass">Password</Label>
            <Input
              id="op-pass"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="h-11"
            />
          </div>
          {err && <p className="text-xs text-destructive">{err}</p>}
          <Button
            type="submit"
            disabled={loading || !username.trim() || !password}
            className="w-full h-11 font-medium rounded-full bg-foreground text-background hover:bg-foreground/90"
          >
            {loading ? "Signing in…" : "Log in"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );

  if (mode === "card") {
    return <div className="flex justify-center py-6">{form}</div>;
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-cover bg-center transition-all duration-[1200ms] ease-out"
        style={{ backgroundImage: `url(${NATURE_BACKGROUNDS[bgIdx]})` }}
        aria-hidden
      />
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" aria-hidden />
      <div className="relative z-10 w-full flex justify-center">{form}</div>
    </div>
  );
}
