import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearch } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/queryClient";
import {
  Calendar,
  Sparkles,
  ArrowRight,
  RotateCcw,
  CheckCircle2,
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

interface SkillMeta {
  title: string;
  trainerPath: string;
  weaknessSlug: string;
  shortLabel: string;
}

const SKILL_META: Record<SkillKey, SkillMeta> = {
  advantageCapitalization: {
    title: "Advantage Capitalization",
    trainerPath: "/training/advantage",
    weaknessSlug: "advantage-capitalization",
    shortLabel: "Advantage",
  },
  opening: {
    title: "Opening",
    trainerPath: "/training/opening-improver",
    weaknessSlug: "opening",
    shortLabel: "Opening",
  },
  tactics: {
    title: "Tactics",
    trainerPath: "/training/tactics",
    weaknessSlug: "tactics",
    shortLabel: "Tactics",
  },
  timeManagement: {
    title: "Time Management",
    trainerPath: "/training/time-pressure",
    weaknessSlug: "time-management",
    shortLabel: "Time",
  },
  resourcefulness: {
    title: "Resourcefulness",
    trainerPath: "/training/blunder-preventer",
    weaknessSlug: "resourcefulness",
    shortLabel: "Defense",
  },
  endgame: {
    title: "Endgame",
    trainerPath: "/training/endgame",
    weaknessSlug: "endgame",
    shortLabel: "Endgame",
  },
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface AnalyticsResponse {
  current: Record<SkillKey, number>;
  delta: Record<SkillKey, number>;
  baseline: Record<SkillKey, number>;
  buckets: { date: string }[];
}

interface PlanSlot {
  day: string;
  trainerPath: string;
  trainerLabel: string;
  weaknessSlug: string;
  weaknessTitle: string;
  minutes: number;
  isMix: boolean;
}

/* ISO week key (e.g. 2026-W19) so completion state rolls over each Monday. */
function isoWeekKey(d = new Date()): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function buildSchedule(weakest: SkillKey[], current: Record<SkillKey, number> | null): PlanSlot[] {
  // Each of the three weakest skills gets two slots; the seventh is a 360 mix.
  const w0 = weakest[0] ?? "tactics";
  const w1 = weakest[1] ?? "endgame";
  // Must match `SKILL_META` keys (camelCase). A typo here (`advantage-capitalization`)
  // made `SKILL_META[o.skill]` undefined and crashed the page.
  const w2 = weakest[2] ?? "advantageCapitalization";
  const order: Array<{ skill: SkillKey | null }> = [
    { skill: w0 },
    { skill: w1 },
    { skill: w2 },
    { skill: w0 },
    { skill: w1 },
    { skill: w2 },
    { skill: null }, // 360 mix
  ];
  return order.map((o, i) => {
    if (o.skill == null) {
      return {
        day: DAYS[i],
        trainerPath: "/training/360",
        trainerLabel: "360 Mix",
        weaknessSlug: "mixed",
        weaknessTitle: "Mixed deck",
        minutes: 15,
        isMix: true,
      };
    }
    const meta = SKILL_META[o.skill] ?? SKILL_META.tactics;
    return {
      day: DAYS[i],
      trainerPath: meta.trainerPath,
      trainerLabel: meta.shortLabel,
      weaknessSlug: meta.weaknessSlug,
      weaknessTitle: meta.title,
      minutes: 10,
      isMix: false,
    };
  });
}

function buildHref(slot: PlanSlot, score?: number, delta?: number, username?: string | null): string {
  if (slot.isMix) return slot.trainerPath;
  const params = new URLSearchParams({
    from: "analytics",
    weakness: slot.weaknessSlug,
  });
  if (score != null) params.set("score", String(Math.round(score)));
  if (delta != null) params.set("delta", String(Math.round(delta)));
  if (username) params.set("username", username);
  return `${slot.trainerPath}?${params.toString()}`;
}

export default function WeeklyPlan() {
  const search = useSearch();
  const username = React.useMemo(() => {
    const params = new URLSearchParams(search);
    return params.get("username") ?? "";
  }, [search]);

  const analytics = useQuery<AnalyticsResponse>({
    queryKey: ["analytics", username || "(none)"],
    queryFn: () =>
      api(`/api/analytics?username=${encodeURIComponent(username || "guest")}`),
    enabled: true,
  });

  const weakest: SkillKey[] = React.useMemo(() => {
    const cur = analytics.data?.current;
    if (!cur) return ["tactics", "endgame", "advantageCapitalization"];
    return [...SKILL_KEYS]
      .filter((k) => Number.isFinite(cur[k]))
      .sort((a, b) => cur[a] - cur[b])
      .slice(0, 3);
  }, [analytics.data]);

  const schedule = React.useMemo(
    () => buildSchedule(weakest, analytics.data?.current ?? null),
    [weakest, analytics.data],
  );

  const week = isoWeekKey();
  const storageKey = `weekly-plan:${week}`;
  const [done, setDone] = React.useState<Record<number, boolean>>(() => {
    if (typeof window === "undefined") return {};
    try {
      return JSON.parse(window.localStorage.getItem(storageKey) ?? "{}");
    } catch {
      return {};
    }
  });

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(storageKey, JSON.stringify(done));
  }, [done, storageKey]);

  function toggle(i: number) {
    setDone((d) => ({ ...d, [i]: !d[i] }));
  }
  function resetAll() {
    setDone({});
  }

  const completedCount = Object.values(done).filter(Boolean).length;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Calendar className="w-6 h-6 text-primary" /> Weekly Study Plan
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Seven days of targeted drills built from your three weakest skills.
            Check off slots as you go — progress saves locally.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono">{week}</Badge>
          <Badge variant="outline" className="font-mono">
            {completedCount} / 7 done
          </Badge>
          <Button variant="outline" size="sm" onClick={resetAll}>
            <RotateCcw className="w-4 h-4 mr-2" /> Reset
          </Button>
        </div>
      </div>

      {!username && (
        <Card>
          <CardContent className="p-4 text-xs text-muted-foreground">
            Tip: open this page from the analytics card (it passes your username)
            to seed the plan from your real skill scores. Without a username, we
            fall back to a default tactics/endgame/advantage rotation.
          </CardContent>
        </Card>
      )}

      <Card className="border-primary/40 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            This week's focus
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {analytics.data
              ? `Targeting your three weakest skills: ${weakest
                  .map((k) => SKILL_META[k].title)
                  .join(", ")}.`
              : "Loading your skill scores…"}
          </p>
        </CardHeader>
      </Card>

      <div className="grid sm:grid-cols-2 lg:grid-cols-7 gap-3">
        {schedule.map((slot, i) => {
          const skillKey = SKILL_KEYS.find(
            (k) => SKILL_META[k].weaknessSlug === slot.weaknessSlug,
          );
          const score = skillKey ? analytics.data?.current?.[skillKey] : undefined;
          const delta = skillKey ? analytics.data?.delta?.[skillKey] : undefined;
          const checked = !!done[i];
          return (
            <Card
              key={i}
              className={
                checked
                  ? "border-emerald-500/40 bg-emerald-500/5"
                  : slot.isMix
                    ? "border-primary/40 bg-primary/5"
                    : ""
              }
            >
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-muted-foreground tracking-wider">
                    {slot.day}
                  </span>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(i)}
                    aria-label={`Mark ${slot.day} done`}
                    className="w-4 h-4 rounded border-border accent-primary cursor-pointer"
                  />
                </div>
                <div className="font-semibold text-sm">{slot.trainerLabel}</div>
                <div className="text-[11px] text-muted-foreground">
                  {slot.weaknessTitle} · {slot.minutes} min
                </div>
                <Link href={buildHref(slot, score, delta, username)}>
                  <Button
                    size="sm"
                    variant={checked ? "outline" : "default"}
                    className="w-full"
                  >
                    {checked ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Re-do
                      </>
                    ) : (
                      <>
                        Start <ArrowRight className="w-3.5 h-3.5 ml-1" />
                      </>
                    )}
                  </Button>
                </Link>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
