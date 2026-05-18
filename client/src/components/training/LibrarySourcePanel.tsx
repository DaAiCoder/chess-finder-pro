/**
 * LibrarySourcePanel — hero card on the Training Hub that lets the user
 * generate a fresh batch of puzzles for any module by mining the Game
 * Library (Lichess masters, club, amateur or locally imported games).
 *
 * Each module's "Train from library" button hits
 * `POST /api/library/generate-training`; the server returns and persists
 * the generated `training_problems`, which immediately show up in the
 * module's normal trainer.
 */
import * as React from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { api } from "@/lib/queryClient";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Database, Sparkles, Loader2, Lock } from "lucide-react";
import { Link } from "wouter";

const MODULES = [
  { id: "tactics", label: "Tactics" },
  { id: "blunder-preventer", label: "Blunder Prevention" },
  { id: "opening-improver", label: "Openings" },
  { id: "advantage-capitalization", label: "Advantage" },
  { id: "defender", label: "Defender" },
  { id: "visualization", label: "Visualization" },
  { id: "checkmate-patterns", label: "Checkmate" },
  { id: "360", label: "360 Mixed" },
  { id: "retry-mistakes", label: "Retry Mistakes" },
];

const TIERS = [
  { id: "", label: "Any tier" },
  { id: "masters", label: "Masters (2400+)" },
  { id: "titled", label: "Titled (2200-2399)" },
  { id: "expert", label: "Expert (2000-2199)" },
  { id: "intermediate", label: "Club (1600-1999)" },
  { id: "amateur", label: "Amateur (<1600)" },
  { id: "broadcast", label: "Broadcast" },
];

export function LibrarySourcePanel() {
  const { user } = useCurrentUser();
  const pro = user?.hasProAccess === true;
  const qc = useQueryClient();
  const [module, setModule] = React.useState("tactics");
  const [tier, setTier] = React.useState("");
  const [count, setCount] = React.useState(5);
  const [lastResult, setLastResult] = React.useState<{
    module: string;
    count: number;
  } | null>(null);

  const overview = useQuery<{ total: number }>({
    queryKey: ["library-overview"],
    queryFn: () => api("/api/library/overview"),
    staleTime: 30_000,
  });

  const generate = useMutation({
    mutationFn: () =>
      api<{ problems: { id: number }[] }>("/api/library/generate-training", {
        method: "POST",
        body: JSON.stringify({
          module,
          tier: tier || undefined,
          count,
          persist: true,
        }),
      }),
    onSuccess: (data) => {
      setLastResult({ module, count: data.problems.length });
      qc.invalidateQueries({ queryKey: ["problems", module] });
      qc.invalidateQueries({ queryKey: ["progress"] });
    },
  });

  const empty = overview.data?.total === 0;

  return (
    <Card className="border-primary/40 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader>
        <div className="flex items-center gap-3">
          <Database className="w-5 h-5 text-primary" />
          <div>
            <CardTitle className="text-base">Train from the Game Library</CardTitle>
            <CardDescription>
              Mine real master / amateur games to generate puzzles for any
              trainer module. The library currently holds{" "}
              <strong>{(overview.data?.total ?? 0).toLocaleString()}</strong>{" "}
              local games + millions via the Lichess explorer.
            </CardDescription>
          </div>
          <Link href="/library" className="ml-auto">
            <Badge variant="outline">Open library</Badge>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!pro && (
          <p className="text-xs rounded-md border border-amber-600/35 bg-amber-950/20 px-3 py-2 text-amber-100/90 flex items-start gap-2">
            <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              Generating puzzles from <strong>your</strong> games is a Pro feature. Free accounts
              can still drill the seed puzzle library in Tactics and 360 Trainer.{" "}
              <Link href="/pricing" className="underline text-foreground">
                View Pro
              </Link>
            </span>
          </p>
        )}
        {empty && (
          <p className="text-xs text-muted-foreground">
            Your local library is empty. Engine-mined puzzles will fall back
            to the Lichess masters database when needed, but{" "}
            <Link href="/library" className="text-primary underline">
              import a few user accounts or paste a PGN dump
            </Link>{" "}
            for the richest training set.
          </p>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <label className="text-xs">
            <div className="text-muted-foreground mb-1">Module</div>
            <select
              className="w-full text-xs bg-background border border-border rounded px-2 py-1"
              value={module}
              onChange={(e) => setModule(e.target.value)}
            >
              {MODULES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs">
            <div className="text-muted-foreground mb-1">Skill tier</div>
            <select
              className="w-full text-xs bg-background border border-border rounded px-2 py-1"
              value={tier}
              onChange={(e) => setTier(e.target.value)}
            >
              {TIERS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs">
            <div className="text-muted-foreground mb-1">Puzzles</div>
            <input
              type="number"
              min={1}
              max={20}
              value={count}
              onChange={(e) => setCount(Number(e.target.value) || 5)}
              className="w-full text-xs bg-background border border-border rounded px-2 py-1"
            />
          </label>
          <div className="flex items-end">
            <Button
              size="sm"
              onClick={() => generate.mutate()}
              disabled={generate.isPending || !pro}
              className="w-full"
            >
              {generate.isPending ? (
                <>
                  <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                  Mining…
                </>
              ) : (
                <>
                  <Sparkles className="h-3 w-3 mr-2" />
                  Generate
                </>
              )}
            </Button>
          </div>
        </div>
        {lastResult && (
          <p className="text-xs text-muted-foreground">
            Added <strong>{lastResult.count}</strong>{" "}
            <strong>{lastResult.module}</strong> puzzles. Open the matching
            trainer to drill them.
          </p>
        )}
        {generate.isError && (
          <p className="text-xs text-red-500">
            {(generate.error as Error).message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
