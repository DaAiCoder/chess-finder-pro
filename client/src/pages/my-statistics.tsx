import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearch } from "wouter";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/queryClient";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useBoardTheme, type BoardTheme } from "@/hooks/useBoardTheme";
import { Chessboard } from "@/components/chess/Chessboard";
import {
  BarChart3,
  Flame,
  Target,
  Trophy,
  Sparkles,
  Palette,
  ArrowRight,
} from "lucide-react";

const SKILL_KEYS = [
  "advantageCapitalization",
  "opening",
  "tactics",
  "timeManagement",
  "resourcefulness",
  "endgame",
] as const;
type SkillKey = (typeof SKILL_KEYS)[number];

const SKILL_TITLE: Record<SkillKey, string> = {
  advantageCapitalization: "Advantage Capitalization",
  opening: "Opening",
  tactics: "Tactics",
  timeManagement: "Time Management",
  resourcefulness: "Resourcefulness",
  endgame: "Endgame",
};

const SKILL_TRAINER: Record<SkillKey, string> = {
  advantageCapitalization: "/training/advantage",
  opening: "/training/opening-improver",
  tactics: "/training/tactics",
  timeManagement: "/training/time-pressure",
  resourcefulness: "/training/blunder-preventer",
  endgame: "/training/endgame",
};

interface StatsResponse {
  skills: Record<
    SkillKey,
    { history: { date: string; value: number }[]; current: number; baseline: number }
  >;
  totals: {
    solved: number;
    attempts: number;
    accuracy: number;
    streak: number;
    bestStreak: number;
  };
  perModule: {
    module: string;
    rating: number;
    problemsSolved: number;
    totalAttempts: number;
    accuracy: number;
    lastPracticed: string | null;
  }[];
}

export default function MyStatistics() {
  const search = useSearch();
  const { userId } = useCurrentUser();
  const username = React.useMemo(() => {
    const params = new URLSearchParams(search);
    return params.get("username") ?? "";
  }, [search]);

  const stats = useQuery<StatsResponse>({
    queryKey: ["statistics", userId, username],
    enabled: userId != null,
    queryFn: () => {
      const uid = userId ?? "";
      return api(
        `/api/statistics?userId=${encodeURIComponent(String(uid))}${
          username ? `&username=${encodeURIComponent(username)}` : ""
        }`,
      );
    },
  });

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-primary" /> My Statistics
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Your full training history. Solved totals, streaks, per-skill
            sparklines, and per-module accuracy.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={username ? `/analytics?username=${encodeURIComponent(username)}` : "/analytics"}>
            <Button variant="outline" size="sm">
              Back to analytics
            </Button>
          </Link>
          <Link
            href={username ? `/training/plan?username=${encodeURIComponent(username)}` : "/training/plan"}
          >
            <Button size="sm">
              Weekly plan <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </Link>
        </div>
      </div>

      {!username && (
        <Card>
          <CardContent className="p-3 text-xs text-muted-foreground">
            Tip: pass <code>?username=&lt;your-name&gt;</code> in the URL to
            include the per-skill sparklines from your imported games.
          </CardContent>
        </Card>
      )}

      {/* Top totals row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile
          icon={<Target className="w-4 h-4" />}
          label="Problems solved"
          value={stats.data?.totals.solved ?? 0}
        />
        <StatTile
          icon={<Sparkles className="w-4 h-4" />}
          label="Overall accuracy"
          value={`${Math.round((stats.data?.totals.accuracy ?? 0) * 100)}%`}
          sub={`${stats.data?.totals.attempts ?? 0} attempts`}
        />
        <StatTile
          icon={<Flame className="w-4 h-4 text-orange-400" />}
          label="Current streak"
          value={`${stats.data?.totals.streak ?? 0}d`}
        />
        <StatTile
          icon={<Trophy className="w-4 h-4 text-amber-400" />}
          label="Best streak"
          value={`${stats.data?.totals.bestStreak ?? 0}d`}
        />
      </div>

      {/* Six skill sparklines */}
      <div className="grid lg:grid-cols-2 gap-3">
        {SKILL_KEYS.map((k) => (
          <SkillSparkline
            key={k}
            title={SKILL_TITLE[k]}
            trainerPath={SKILL_TRAINER[k]}
            history={stats.data?.skills?.[k]?.history ?? []}
            current={stats.data?.skills?.[k]?.current}
            baseline={stats.data?.skills?.[k]?.baseline}
          />
        ))}
      </div>

      {/* Per-module table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Training modules</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Module</th>
                  <th className="px-3 py-2 text-right">Rating</th>
                  <th className="px-3 py-2 text-right">Solved</th>
                  <th className="px-3 py-2 text-right">Attempts</th>
                  <th className="px-3 py-2 text-right">Accuracy</th>
                  <th className="px-3 py-2 text-left">Last practiced</th>
                </tr>
              </thead>
              <tbody>
                {(stats.data?.perModule ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground text-xs">
                      No module activity yet — start any trainer to populate this table.
                    </td>
                  </tr>
                ) : (
                  (stats.data?.perModule ?? []).map((row) => (
                    <tr key={row.module} className="border-t border-border">
                      <td className="px-3 py-2 font-mono">{row.module}</td>
                      <td className="px-3 py-2 text-right font-mono">{row.rating}</td>
                      <td className="px-3 py-2 text-right font-mono">{row.problemsSolved}</td>
                      <td className="px-3 py-2 text-right font-mono">{row.totalAttempts}</td>
                      <td className="px-3 py-2 text-right font-mono">
                        {Math.round(row.accuracy * 100)}%
                      </td>
                      <td className="px-3 py-2 text-muted-foreground text-xs">
                        {row.lastPracticed
                          ? new Date(row.lastPracticed).toLocaleDateString()
                          : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <BoardThemePicker />
    </div>
  );
}

function BoardThemePicker() {
  const { theme, setTheme } = useBoardTheme();
  const themes: { id: BoardTheme; label: string }[] = [
    { id: "green", label: "Green" },
    { id: "wood", label: "Wood" },
    { id: "brown", label: "Brown" },
    { id: "blue", label: "Blue" },
    { id: "gray", label: "Gray" },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Palette className="w-4 h-4 text-emerald-400" /> Board theme
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {themes.map((t) => (
            <Button
              key={t.id}
              size="sm"
              variant={theme === t.id ? "default" : "outline"}
              onClick={() => setTheme(t.id)}
            >
              {t.label}
            </Button>
          ))}
        </div>
        <div className="max-w-[260px]">
          <Chessboard
            fen="rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1"
            theme={theme}
            interactive={false}
          />
        </div>
        <p className="text-[11px] text-muted-foreground">
          Your choice syncs across devices when you sign in.
        </p>
      </CardContent>
    </Card>
  );
}

function StatTile({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {icon}
          <span>{label}</span>
        </div>
        <div className="text-2xl font-bold font-mono mt-1">{value}</div>
        {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function SkillSparkline({
  title,
  trainerPath,
  history,
  current,
  baseline,
}: {
  title: string;
  trainerPath: string;
  history: { date: string; value: number }[];
  current?: number;
  baseline?: number;
}) {
  const data = React.useMemo(
    () =>
      history.map((h, i) => ({
        idx: i,
        value: h.value,
        date: h.date,
      })),
    [history],
  );
  const delta =
    current != null && baseline != null ? Math.round(current - baseline) : null;
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-sm flex items-center justify-between">
          <span>{title}</span>
          <div className="flex items-center gap-2">
            {current != null && (
              <Badge variant="outline" className="font-mono text-[10px]">
                {Math.round(current)}
              </Badge>
            )}
            {delta != null && (
              <Badge
                variant={delta >= 0 ? "success" : "destructive"}
                className="font-mono text-[10px]"
              >
                {delta >= 0 ? "+" : ""}
                {delta}
              </Badge>
            )}
            <Link href={trainerPath}>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]">
                Practice
              </Button>
            </Link>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 h-[140px]">
        {data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
            No history yet — import games to populate.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="idx" hide />
              <YAxis domain={["auto", "auto"]} width={40} tick={{ fontSize: 10 }} />
              <Tooltip
                contentStyle={{
                  background: "hsl(220, 20%, 12%)",
                  border: "1px solid hsl(220, 15%, 20%)",
                  fontSize: 11,
                }}
                formatter={(v: number) => [Math.round(v), "score"]}
                labelFormatter={(_, p) => {
                  const d = (p?.[0]?.payload as { date?: string } | undefined)?.date;
                  return d ? new Date(d).toLocaleDateString() : "";
                }}
              />
              {baseline != null && (
                <ReferenceLine
                  y={baseline}
                  stroke="hsl(215, 20%, 65%)"
                  strokeDasharray="4 4"
                  label={{
                    value: "Your baseline",
                    fontSize: 9,
                    fill: "hsl(215, 20%, 65%)",
                    position: "right",
                  }}
                />
              )}
              <Line
                type="monotone"
                dataKey="value"
                stroke="hsl(217, 91%, 60%)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
