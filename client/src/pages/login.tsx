import * as React from "react";
import { useLocation, useSearch } from "wouter";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import { api } from "@/lib/queryClient";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { resetPreviewQuotaAll } from "@/hooks/usePreviewQuota";
import { cn } from "@/lib/utils";
import { trackSignUp, trackEvent } from "@/lib/analytics";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { APP_NAME, pageTitle } from "@/lib/brand";

/**
 * Aimchess-style login / registration:
 *   - Tabbed "Registration" / "Sign in"
 *   - Email + password (toggle to magic link for passwordless / forgot)
 *   - "or" divider, then Continue with Lichess
 *
 * Server contracts:
 *   POST /api/auth/login              { username, password }   (username may be an email)
 *   POST /api/auth/register           { username, password, email? }
 *   POST /api/auth/magic-link/request { email, next }
 *   GET  /api/auth/lichess/start?next=…
 */
export default function LoginPage() {
  const [loc, setLoc] = useLocation();
  const search = useSearch();
  const params = React.useMemo(() => new URLSearchParams(search), [search]);

  const initialMode = React.useMemo<"login" | "register">(() => {
    const q = params.get("mode");
    if (q === "register" || q === "login") return q;
    if (loc.startsWith("/signup")) return "register";
    return "login";
  }, [loc, params]);

  const { refetch } = useCurrentUser();
  const [mode, setMode] = React.useState<"login" | "register">(initialMode);

  useDocumentTitle(
    mode === "register" ? pageTitle("Create account") : pageTitle("Sign in"),
  );
  const [usePasswordless, setUsePasswordless] = React.useState(false);

  const [email, setEmail] = React.useState("");
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPw, setShowPw] = React.useState(false);

  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [magicMsg, setMagicMsg] = React.useState<string | null>(null);

  const nextPath = React.useMemo(() => {
    const n = params.get("next");
    return n && n.startsWith("/") && !n.startsWith("//") ? n : "/analysis";
  }, [params]);

  React.useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  React.useEffect(() => {
    const e = params.get("error");
    if (e === "magic_invalid") setErr("That sign-in link is invalid or has expired.");
    else if (e === "magic_failed") setErr("Could not complete sign-in. Try requesting a new link.");
    else if (e === "session") setErr("Session error — try again.");
    else if (e === "oauth_state") setErr("Sign-in interrupted. Please try again.");
    else if (e === "oauth_token") setErr("Lichess sign-in failed at the token step.");
    else if (e === "oauth_account") setErr("Could not read your Lichess account info.");
    else if (e === "oauth_failed") setErr("Lichess sign-in failed. Please try again.");
  }, [params]);

  const errorLabel = (code: string): string => {
    switch (code) {
      case "invalid_credentials":
        return "Incorrect email or password.";
      case "too_many_attempts":
        return "Too many attempts. Wait a few minutes and try again.";
      case "rate_limited":
        return "You're going a bit fast — try again in a minute.";
      case "username_taken":
        return "That username is already taken.";
      case "email_taken":
        return "An account with that email already exists.";
      case "reserved_username":
        return "That username is reserved.";
      case "password_too_common":
        return "That password is too common. Pick something stronger.";
      case "password_contains_username":
        return "Your password can't contain your username or email.";
      case "invalid_body":
        return "Please check the form for issues.";
      default:
        return code;
    }
  };

  const afterAuth = async () => {
    await refetch();
    resetPreviewQuotaAll();
    setLoc(nextPath);
  };

  const submitPassword = async () => {
    setErr(null);
    setBusy(true);
    try {
      if (mode === "register") {
        await api("/api/auth/register", {
          method: "POST",
          body: JSON.stringify({
            username: username.trim(),
            email: email.trim() || undefined,
            password,
          }),
        });
        trackSignUp("email");
      } else {
        await api("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({
            username: email.trim(),
            password,
          }),
        });
        trackEvent("login", { method: "email" });
      }
      await afterAuth();
    } catch (e) {
      setErr(errorLabel((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  const sendMagic = async () => {
    setErr(null);
    setMagicMsg(null);
    setBusy(true);
    try {
      await api("/api/auth/magic-link/request", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), next: nextPath }),
      });
      trackEvent("magic_link_requested", { mode });
      setMagicMsg(
        "If that email is registered (or available), we sent a one-time sign-in link. Check your inbox.",
      );
    } catch (e) {
      setErr(errorLabel((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  const sendPasswordReset = async () => {
    setErr(null);
    setMagicMsg(null);
    if (!isValidEmail(email.trim())) {
      setErr("Enter your account email first, then click Forgot.");
      return;
    }
    setBusy(true);
    try {
      await api("/api/auth/password-reset/request", {
        method: "POST",
        body: JSON.stringify({ email: email.trim() }),
      });
      setMagicMsg(
        "If an account exists with that email, we sent a password reset link. Check your inbox.",
      );
    } catch (e) {
      setErr(errorLabel((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  const lichessHref = `/api/auth/lichess/start?next=${encodeURIComponent(nextPath)}`;

  const pwStrength = React.useMemo(() => scorePassword(password), [password]);

  const identifierOk =
    mode === "register" ? isValidEmail(email.trim()) : isValidLoginIdentifier(email.trim());

  const primaryDisabled =
    busy ||
    !email.trim() ||
    !identifierOk ||
    (!usePasswordless && password.length < (mode === "register" ? 8 : 1)) ||
    (mode === "register" && !usePasswordless && username.trim().length < 2);

  const primaryLabel = usePasswordless
    ? busy
      ? "Sending…"
      : mode === "register"
        ? "Create account with link"
        : "Email me a sign-in link"
    : busy
      ? "Working…"
      : mode === "register"
        ? "Sign up"
        : "Sign in";

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4 bg-gradient-to-b from-background to-muted/30">
      <div className="w-full max-w-[420px]">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">{APP_NAME}</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Train smarter. Find your next study, opening, or breakthrough.
          </p>
        </div>

        <Card className="shadow-lg border-border/60">
          <CardContent className="p-6 space-y-5">
            <Tabs
              value={mode}
              onValueChange={(v) => {
                setMode(v as "login" | "register");
                setErr(null);
                setMagicMsg(null);
              }}
            >
              <TabsList className="grid grid-cols-2 w-full h-11">
                <TabsTrigger value="register" className="text-sm">
                  Registration
                </TabsTrigger>
                <TabsTrigger value="login" className="text-sm">
                  Sign in
                </TabsTrigger>
              </TabsList>

              {(["register", "login"] as const).map((m) => (
                <TabsContent key={m} value={m} className="mt-5 space-y-4">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (busy) return;
                      void (usePasswordless ? sendMagic() : submitPassword());
                    }}
                    className="space-y-3"
                    noValidate
                    autoComplete="on"
                  >
                    {m === "register" && !usePasswordless && (
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">
                          Username
                        </label>
                        <Input
                          value={username}
                          onChange={(e) =>
                            setUsername(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ""))
                          }
                          placeholder="your-handle"
                          autoComplete="username"
                          maxLength={30}
                          required
                        />
                        <p className="text-[10px] text-muted-foreground">
                          Letters, numbers, dashes, underscores. 2–30 characters.
                        </p>
                      </div>
                    )}

                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">
                        {m === "login" ? "Email or username" : "Email"}
                      </label>
                      <Input
                        type={m === "login" ? "text" : "email"}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder={m === "login" ? "you@example.com or username" : "you@example.com"}
                        autoComplete={m === "login" ? "username" : "email"}
                        maxLength={254}
                        spellCheck={false}
                        required
                      />
                    </div>

                    {!usePasswordless && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-medium text-muted-foreground">
                            Password{" "}
                            {m === "register" && (
                              <span className="text-[10px]">(min 8)</span>
                            )}
                          </label>
                          {m === "login" && (
                            <button
                              type="button"
                              className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                              onClick={() => {
                                setErr(null);
                                setMagicMsg(null);
                                void sendPasswordReset();
                              }}
                            >
                              Forgot?
                            </button>
                          )}
                        </div>
                        <div className="relative">
                          <Input
                            type={showPw ? "text" : "password"}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            autoComplete={m === "register" ? "new-password" : "current-password"}
                            required
                            minLength={m === "register" ? 8 : undefined}
                            maxLength={128}
                            className="pr-14"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPw((v) => !v)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
                            tabIndex={-1}
                            aria-label={showPw ? "Hide password" : "Show password"}
                          >
                            {showPw ? "Hide" : "Show"}
                          </button>
                        </div>
                        {m === "register" && password.length > 0 && (
                          <PasswordStrength score={pwStrength} />
                        )}
                      </div>
                    )}

                    {err && (
                      <p
                        role="alert"
                        className="text-xs text-destructive bg-destructive/10 rounded px-2 py-1.5"
                      >
                        {err}
                      </p>
                    )}
                    {magicMsg && (
                      <p className="text-xs text-emerald-600 bg-emerald-500/10 rounded px-2 py-1.5">
                        {magicMsg}
                      </p>
                    )}

                    <Button
                      type="submit"
                      disabled={primaryDisabled}
                      className="w-full h-11 text-sm font-medium"
                      style={{ backgroundColor: "#769656", color: "white" }}
                    >
                      {primaryLabel}
                    </Button>

                    <button
                      type="button"
                      className="w-full text-[11px] text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setUsePasswordless((v) => !v);
                        setErr(null);
                        setMagicMsg(null);
                      }}
                    >
                      {usePasswordless
                        ? "Use a password instead"
                        : "Send me a magic link instead (passwordless)"}
                    </button>
                  </form>

                  <Divider />

                  <a href={lichessHref} className="block">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full h-11 text-sm font-medium gap-2"
                    >
                      <LichessIcon className="h-4 w-4" />
                      Continue with Lichess
                    </Button>
                  </a>
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>

        <p className="text-center text-[11px] text-muted-foreground mt-4 px-4 leading-relaxed">
          Protected by rate-limiting and password hashing (scrypt). We never
          store your password — only a salted hash. By continuing you agree to
          our{" "}
          <a href="/terms" className="underline-offset-2 hover:underline">
            terms
          </a>{" "}
          and{" "}
          <a href="/privacy" className="underline-offset-2 hover:underline">
            privacy policy
          </a>
          .{" "}
          <a href="/email-change" className="underline-offset-2 hover:underline">
            Change email
          </a>
          .
        </p>
      </div>
    </div>
  );
}

function Divider() {
  return (
    <div className="relative py-1">
      <div className="absolute inset-0 flex items-center">
        <span className="w-full border-t border-border" />
      </div>
      <div className="relative flex justify-center text-[10px] uppercase tracking-wider">
        <span className="bg-card px-2 text-muted-foreground">or</span>
      </div>
    </div>
  );
}

function LichessIcon({ className }: { className?: string }) {
  return (
    <svg
      className={cn("inline-block", className)}
      viewBox="0 0 50 50"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M25 4c-1.7 0-3.3.4-4.6 1.1l.6 1.7c-1.6.5-3.6 1.9-4.4 4.5-1 3 .3 6.3 1.4 8.6-2.7 1.9-4.7 4.6-5.6 7.8L9.7 35.1c-.3 1.3.4 2.7 1.6 3.2l4.6 1.7c.4.1.7.2 1.1.2.9 0 1.7-.4 2.2-1.1l3-4.1c1.1 1.5 2.4 2.8 3.9 3.7l-1.1 4.6c-.3 1.3.4 2.7 1.6 3.2.3.1.5.1.8.1.5 0 1-.1 1.4-.4l4.1-2.8c2.7-1.8 4.7-4.4 5.8-7.4 1.2-3.3 1.3-7-.1-10.4-.3-.7-.6-1.4-1-2 1.1-1.5 1.7-3.4 1.7-5.4 0-5-4-9.1-9.1-9.1-2.3 0-4.3.8-5.9 2.1l-.6-1.7c1.6-.7 3.4-1.1 5.3-1.1z" />
    </svg>
  );
}

function PasswordStrength({ score }: { score: number }) {
  const label = ["Very weak", "Weak", "Fair", "Strong", "Excellent"][score] ?? "Weak";
  const colors = [
    "bg-red-500",
    "bg-orange-500",
    "bg-yellow-500",
    "bg-emerald-500",
    "bg-emerald-400",
  ];
  return (
    <div className="space-y-1">
      <div className="flex gap-1 h-1">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              "flex-1 rounded-full transition-colors",
              i < score ? colors[score - 1] : "bg-border",
            )}
          />
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground">Strength: {label}</p>
    </div>
  );
}

function scorePassword(pw: string): number {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 8) s += 1;
  if (pw.length >= 12) s += 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s += 1;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s += 1;
  // Penalize all-same-character or sequences.
  if (/^(.)\1+$/.test(pw)) s = 0;
  if (/^(?:0123|1234|2345|3456|4567|5678|6789|abcd|qwer|asdf)/i.test(pw)) s = Math.min(s, 1);
  return Math.max(0, Math.min(4, s));
}

function isValidEmail(s: string): boolean {
  // Conservative — server is the source of truth.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254;
}

/** Sign-in accepts email or username. */
function isValidLoginIdentifier(s: string): boolean {
  const t = s.trim();
  if (!t || t.length > 254) return false;
  if (isValidEmail(t)) return true;
  return /^[a-zA-Z0-9_-]{2,30}$/.test(t);
}
