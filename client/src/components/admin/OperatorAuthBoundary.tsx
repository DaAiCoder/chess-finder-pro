import * as React from "react";
import { OperatorLoginScreen } from "@/components/admin/OperatorLoginScreen";

export function OperatorAuthBoundary({
  mode,
  children,
}: {
  mode: "fullscreen" | "card";
  children: React.ReactNode;
}) {
  const [state, setState] = React.useState<"loading" | "in" | "out">("loading");

  const refresh = React.useCallback(() => {
    setState("loading");
    void fetch("/api/operator/session", { credentials: "include" })
      .then((r) => r.json())
      .then((d: { ok?: boolean }) => setState(d.ok ? "in" : "out"))
      .catch(() => setState("out"));
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  if (state === "loading") {
    return (
      <div className="flex min-h-[30vh] items-center justify-center text-sm text-muted-foreground">
        Checking session…
      </div>
    );
  }

  if (state === "out") {
    return <OperatorLoginScreen mode={mode} onSuccess={() => setState("in")} />;
  }

  return <>{children}</>;
}
