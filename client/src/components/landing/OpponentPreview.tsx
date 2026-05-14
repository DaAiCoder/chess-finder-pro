import * as React from "react";
import { Link } from "wouter";
import { ArrowRight, Crosshair, Lock, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { api } from "@/lib/queryClient";
import { usePreviewQuota } from "@/hooks/usePreviewQuota";

interface WDL {
  wins: number;
  draws: number;
  losses: number;
}

interface OpeningRecord {
  name?: string;
  eco?: string;
  count?: number;
  winRate?: number;
}

interface SlimScoutReport {
  id?: string;
  profile?: {
    username?: string;
    displayName?: string | null;
    title?: string | null;
    rating?: number | null;
    avatarUrl?: string | null;
  };
  sample?: { total?: number; asWhite?: number; asBlack?: number };
  wdl?: { overall?: WDL };
  petLines?: OpeningRecord[];
  currentStreak?: { type: "W" | "L" | "D" | "none"; length: number };
}

type Platform = "chess.com" | "lichess";

/**
 * Tiny opponent scout for /welcome. Lets a guest enter a chess.com or
 * lichess handle and renders a compact summary inline. Capped at 3
 * reports via `usePreviewQuota("opponent")`. Heavier server work, so
 * we only fetch ~25 games for the preview.
 */
export function OpponentPreview() {
  const quota = usePreviewQuota("opponent");
  const [username, setUsername] = React.useState("");
  const [platform, setPlatform] = React.useState<Platform>("chess.com");
  const [report, setReport] = React.useState<SlimScoutReport | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const runScout = async () => {
    const u = username.trim();
    if (!u || busy) return;
    if (!quota.spend(1)) return;
    setBusy(true);
    setErr(null);
    setReport(null);
    try {
      const res = await api<SlimScoutReport>("/api/opponent-prep/scout", {
        method: "POST",
        body: JSON.stringify({
          username: u,
          platform,
          maxGames: 25,
          forceRefresh: false,
        }),
      });
      setReport(res);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remaining = quota.unlimited ? "unlimited" : `${quota.remaining}/${quota.budget}`;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          {quota.unlimited
            ? "Opponent scouting is unlimited on your account."
            : `Preview: ${remaining} free reports left.`}
        </span>
        {!quota.unlimited && (
          <Link
            href="/signup?next=%2Fopponent-prep"
            className="text-emerald-300 hover:underline"
          >
            Unlock full scouting →
          </Link>
        )}
      </div>

      {quota.exceeded ? (
        <SignupNudge />
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void runScout();
          }}
          className="flex flex-wrap gap-2"
        >
          <Select value={platform} onValueChange={(v) => setPlatform(v as Platform)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="chess.com">chess.com</SelectItem>
              <SelectItem value="lichess">lichess</SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="username"
            disabled={busy}
            className="flex-1 min-w-[150px]"
          />
          <Button
            type="submit"
            disabled={busy || !username.trim()}
            style={{ backgroundColor: "#769656", color: "white" }}
          >
            <Search className="w-4 h-4 mr-1" />
            Scout
          </Button>
        </form>
      )}

      {busy && (
        <p className="text-xs text-muted-foreground">
          Pulling recent games and crunching the report — this can take 10-20 seconds…
        </p>
      )}

      {err && <p className="text-xs text-destructive">{err}</p>}

      {report && <ScoutSummary report={report} />}
    </div>
  );
}

function ScoutSummary({ report }: { report: SlimScoutReport }) {
  const wdl = report.wdl?.overall;
  const total = report.sample?.total ?? 0;
  const winRate =
    wdl && total > 0 ? Math.round(((wdl.wins ?? 0) / total) * 100) : null;
  const topOpening = report.petLines?.[0];
  const profile = report.profile;

  return (
    <div className="rounded-lg border border-emerald-700/40 bg-background/60 p-3 space-y-2 text-sm">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="font-medium">
          <Crosshair className="w-3.5 h-3.5 inline mr-1 text-emerald-400" />
          {profile?.title ? `${profile.title} ` : ""}
          {profile?.displayName ?? profile?.username ?? "—"}
        </p>
        {profile?.rating != null && (
          <span className="text-xs text-muted-foreground">
            Rating: <span className="text-foreground/90">{profile.rating}</span>
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <Stat label="Games" value={total > 0 ? String(total) : "—"} />
        <Stat
          label="Win rate"
          value={winRate != null ? `${winRate}%` : "—"}
        />
        <Stat
          label="W / D / L"
          value={
            wdl
              ? `${wdl.wins ?? 0} / ${wdl.draws ?? 0} / ${wdl.losses ?? 0}`
              : "—"
          }
        />
      </div>

      {topOpening && (
        <p className="text-xs text-muted-foreground leading-snug">
          <Sparkles className="w-3 h-3 inline mr-1 text-emerald-400" />
          Top opening:{" "}
          <span className="text-foreground/90">
            {topOpening.name ?? topOpening.eco ?? "—"}
          </span>
          {topOpening.count != null && (
            <span className="text-muted-foreground"> ({topOpening.count} games)</span>
          )}
        </p>
      )}

      <p className="text-[11px] text-emerald-300/90">
        Sign up to see the full report — every game, every blunder pattern, every
        opening tendency.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border bg-card/60 px-2 py-1">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="font-mono text-sm text-foreground">{value}</p>
    </div>
  );
}

function SignupNudge() {
  return (
    <div className="rounded-lg border border-emerald-700/60 bg-emerald-950/30 p-3 flex items-center gap-3">
      <Lock className="w-4 h-4 text-emerald-300 shrink-0" />
      <p className="flex-1 text-xs text-foreground/90">
        Out of free scouts. Sign up for unlimited reports, saved opponents, and
        full game-by-game analysis.
      </p>
      <Link href="/signup?next=%2Fopponent-prep">
        <Button size="sm" style={{ backgroundColor: "#769656", color: "white" }}>
          Sign up
          <ArrowRight className="w-3.5 h-3.5 ml-1" />
        </Button>
      </Link>
    </div>
  );
}

OpponentPreview.displayName = "OpponentPreview";
