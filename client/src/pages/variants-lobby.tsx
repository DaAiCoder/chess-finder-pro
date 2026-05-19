/**
 * Variant Arena — waiting-lobby + matchmaking room before bot games.
 *
 * Variants are grouped by tier. "Live lobby" stats are decorative ambiance
 * (no multiplayer backend). XP persists locally. Match flow shows a short
 * waiting room before `/play/variants/:id`.
 */

import * as React from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  Home,
  Sparkles,
  Crown,
  Zap,
  Users,
  Radio,
  Loader2,
  Swords,
  Trophy,
  Flame,
} from "lucide-react";
import { api } from "@/lib/queryClient";
import { track, Events } from "@/lib/analytics";
import { toast } from "@/components/ui/Toaster";
import { APP_NAME } from "@/lib/brand";

interface VariantDef {
  id: string;
  name: string;
  tier: 1 | 2 | 3;
  blurb: string;
  randomStart?: boolean;
  useStockfish: boolean;
}

interface VariantsResp {
  variants: VariantDef[];
}

const TIER_INFO: Record<number, { label: string; icon: React.ReactNode; subtitle: string }> = {
  1: {
    label: "Mainstream",
    icon: <Crown className="w-4 h-4 text-amber-500" />,
    subtitle: "Standard + the most popular variants",
  },
  2: {
    label: "Coaching modes",
    icon: <Sparkles className="w-4 h-4 text-violet-400" />,
    subtitle: "Modes that teach while you play",
  },
  3: {
    label: "Exotic",
    icon: <Zap className="w-4 h-4 text-rose-400" />,
    subtitle: "Lichess-style alternative rule sets",
  },
};

const TIME_CONTROLS = [
  { id: "1+0", label: "1 + 0 (Bullet)" },
  { id: "3+0", label: "3 + 0 (Blitz)" },
  { id: "5+3", label: "5 + 3 (Blitz)" },
  { id: "10+0", label: "10 + 0 (Rapid)" },
  { id: "15+10", label: "15 + 10 (Rapid)" },
  { id: "30+0", label: "30 + 0 (Classical)" },
];

const PERSONAS = [
  { id: "level-1", label: "Beginner bot" },
  { id: "level-4", label: "Club player" },
  { id: "level-7", label: "Strong" },
  { id: "magnus", label: "Magnus persona" },
  { id: "tal", label: "Tal persona" },
  { id: "knight-odds", label: "Knight odds (you take piece odds)" },
  { id: "time-30-600", label: "Time odds: 30s vs 10 min" },
];

const XP_KEY = "cfp_variant_lobby_xp";
const STREAK_KEY = "cfp_variant_lobby_streak";
const LAST_VISIT_KEY = "cfp_variant_lobby_last_visit";

const HANDLES = [
  "BlitzBadger",
  "EndgameEcho",
  "ForkFox",
  "CastleKing",
  "PawnStorm",
  "KnightRider_92",
  "SiliconSpar",
  "TacticianTea",
  "960Fan",
  "FogWalker",
];

const LOBBY_ACTIONS = [
  "queued for",
  "opened a table ·",
  "re-matched on",
  "joined",
  "started",
];

const MIN_MATCHMAKING_MS = 1650;

function readXp(): number {
  const n = Number(localStorage.getItem(XP_KEY));
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

function writeXp(n: number) {
  localStorage.setItem(XP_KEY, String(Math.max(0, n)));
}

function lobbyRankFromXp(xp: number): { title: string; tier: number; pct: number; next: number; bandMin: number } {
  const tiers = [
    { min: 0, title: "Lobby rookie" },
    { min: 40, title: "Arena regular" },
    { min: 120, title: "Mode surfer" },
    { min: 280, title: "Variant veteran" },
    { min: 520, title: "Hall legend" },
  ];
  let i = 0;
  for (let t = 0; t < tiers.length; t++) {
    if (xp >= tiers[t]!.min) i = t;
  }
  const cur = tiers[i]!;
  const nextTier = tiers[i + 1];
  const next = nextTier ? nextTier.min : cur.min + 400;
  const span = next - cur.min;
  const pct = span > 0 ? Math.min(100, Math.round(((xp - cur.min) / span) * 100)) : 100;
  return { title: cur.title, tier: i, pct, next, bandMin: cur.min };
}

function bumpDailyStreak(): number {
  const today = todayKey();
  const raw = localStorage.getItem(STREAK_KEY);
  let streak = 1;
  try {
    const o = raw ? (JSON.parse(raw) as { last: string; n: number }) : null;
    if (o?.last && typeof o.n === "number") {
      if (o.last === today) return o.n;
      const prev = parseDayKey(o.last);
      const cur = parseDayKey(today);
      const diff = (cur.getTime() - prev.getTime()) / 86400000;
      if (diff >= 1 && diff < 2) streak = o.n + 1;
      else if (diff >= 2) streak = 1;
      else streak = o.n;
    }
  } catch {
    streak = 1;
  }
  localStorage.setItem(STREAK_KEY, JSON.stringify({ last: today, n: streak }));
  return streak;
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function pad(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

function parseDayKey(key: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y!, (m ?? 1) - 1, d ?? 1);
  }
  const d = new Date(key);
  return Number.isNaN(d.getTime()) ? new Date(0) : d;
}

export default function VariantsLobby() {
  const variants = useQuery<VariantsResp>({
    queryKey: ["variants"],
    queryFn: () => api("/api/variants"),
  });

  const [_loc, navigate] = useLocation();
  const [timeControl, setTimeControl] = React.useState("10+0");
  const [persona, setPersona] = React.useState("level-4");
  const [color, setColor] = React.useState<"white" | "black" | "random">("white");

  const [matchPhase, setMatchPhase] = React.useState<"idle" | "finding">("idle");
  const [pendingVariantName, setPendingVariantName] = React.useState<string>("");
  const [findingStep, setFindingStep] = React.useState(0);
  const matchStartedAt = React.useRef(0);

  const [lobbyPulse, setLobbyPulse] = React.useState(0);
  const [xp, setXp] = React.useState(0);
  const [streak, setStreak] = React.useState(1);
  const [ticker, setTicker] = React.useState<string[]>([]);

  React.useEffect(() => {
    let x = readXp();
    setStreak(bumpDailyStreak());
    const last = localStorage.getItem(LAST_VISIT_KEY);
    const today = todayKey();
    if (last !== today) {
      localStorage.setItem(LAST_VISIT_KEY, today);
      x += 4;
      writeXp(x);
    }
    setXp(x);
  }, []);

  React.useEffect(() => {
    const t = setInterval(() => setLobbyPulse((p) => p + 1), 2200);
    return () => clearInterval(t);
  }, []);

  React.useEffect(() => {
    if (matchPhase !== "finding") {
      setFindingStep(0);
      return;
    }
    const i = setInterval(() => {
      setFindingStep((s) => (s < 3 ? s + 1 : s));
    }, 520);
    return () => clearInterval(i);
  }, [matchPhase]);

  React.useEffect(() => {
    let tick = 0;
    const pushLine = () => {
      tick += 1;
      const h = HANDLES[tick % HANDLES.length]!;
      const a = LOBBY_ACTIONS[tick % LOBBY_ACTIONS.length]!;
      const modes = ["Chess960", "Fog of War", "Horde", "Atomic", "Crazyhouse", "Standard"];
      const mode = modes[tick % modes.length]!;
      const line = `${h} ${a} ${mode}`;
      setTicker((prev) => [line, ...prev].slice(0, 10));
    };
    pushLine();
    const id = setInterval(pushLine, 4200);
    return () => clearInterval(id);
  }, []);

  const playersOnline = 34 + (lobbyPulse % 19) + Math.floor((lobbyPulse % 7) * 1.5);
  const activeTables = 8 + (lobbyPulse % 11);

  const rank = lobbyRankFromXp(xp);

  const start = useMutation<{ game: { id: number } }, Error, string>({
    mutationFn: (variant) =>
      api("/api/variants/new-game", {
        method: "POST",
        body: JSON.stringify({ variant, persona, timeControl, color }),
      }),
    onSuccess: (data, variant) => {
      track(Events.VariantStart, { variant, persona, timeControl });
      const n = readXp() + 18;
      writeXp(n);
      setXp(n);
      const elapsed = Date.now() - matchStartedAt.current;
      const wait = Math.max(0, MIN_MATCHMAKING_MS - elapsed);
      const go = () => {
        navigate(`/play/variants/${data.game.id}`);
        setMatchPhase("idle");
      };
      if (wait <= 0) go();
      else setTimeout(go, wait);
    },
    onError: (e) => {
      setMatchPhase("idle");
      toast({ title: "Could not open table", description: e.message, variant: "destructive" });
    },
  });

  const goPlay = (v: VariantDef) => {
    matchStartedAt.current = Date.now();
    setPendingVariantName(v.name);
    setMatchPhase("finding");
    start.mutate(v.id);
  };

  if (variants.isLoading) {
    return <CenteredMessage>Entering lobby…</CenteredMessage>;
  }
  const grouped = groupByTier(variants.data?.variants ?? []);

  return (
    <div className="min-h-screen bg-[#0f1729] text-white relative overflow-x-hidden">
      {/* soft grid + vignette */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.07]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,.12) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.08) 1px, transparent 1px)`,
          backgroundSize: "48px 48px",
        }}
      />

      <header className="relative z-10 flex flex-wrap items-center gap-3 px-4 md:px-6 min-h-14 py-2 border-b border-cyan-500/20 bg-gradient-to-r from-[#152238] via-[#1a2f45] to-[#152238]">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <Home className="w-4 h-4 text-cyan-300" />
          <span className="font-semibold tracking-tight">{APP_NAME}</span>
        </Link>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-[0.2em] px-2 py-1 rounded-md bg-cyan-500/15 text-cyan-200 border border-cyan-500/30">
            Variant Arena
          </span>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-300/90">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
            </span>
            Lobby open
          </span>
        </div>
        <Link href="/play" className="ml-auto text-sm text-cyan-100/80 hover:text-white shrink-0">
          Standard quick-play →
        </Link>
      </header>

      <main className="relative z-10 max-w-6xl mx-auto p-4 md:p-8 pb-24 lg:pb-8">
        <div className="lg:grid lg:grid-cols-[1fr_300px] lg:gap-8 lg:items-start">
          <div className="space-y-6 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
              <div>
                <h1 className="text-2xl md:text-3xl font-black tracking-tight bg-gradient-to-r from-white via-cyan-100 to-violet-200 bg-clip-text text-transparent">
                  Waiting lobby
                </h1>
                <p className="text-sm text-white/65 mt-1 max-w-xl">
                  Queue a table, tweak clocks and personas, then step through matchmaking into your
                  variant game — same rules as before, now with an arena-style flow.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-white/50 shrink-0">
                <Flame className="w-4 h-4 text-orange-400" />
                <span>
                  Streak <span className="text-orange-300 font-mono font-bold">{streak}</span> day
                  {streak === 1 ? "" : "s"}
                </span>
              </div>
            </div>

            <Card className="bg-white/[0.04] border-white/10 text-white backdrop-blur-sm shadow-lg shadow-black/20">
              <CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-cyan-200/70 mb-2">
                    Time control
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {TIME_CONTROLS.map((t) => (
                      <Button
                        key={t.id}
                        size="sm"
                        variant={timeControl === t.id ? "default" : "outline"}
                        className={
                          timeControl === t.id
                            ? "bg-cyan-600 hover:bg-cyan-500 border-0"
                            : "border-white/20 text-white/90 hover:bg-white/10"
                        }
                        onClick={() => setTimeControl(t.id)}
                      >
                        {t.label}
                      </Button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-cyan-200/70 mb-2">
                    Opponent
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {PERSONAS.map((p) => (
                      <Button
                        key={p.id}
                        size="sm"
                        variant={persona === p.id ? "default" : "outline"}
                        className={
                          persona === p.id
                            ? "bg-violet-600 hover:bg-violet-500 border-0"
                            : "border-white/20 text-white/90 hover:bg-white/10"
                        }
                        onClick={() => setPersona(p.id)}
                      >
                        {p.label}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="md:col-span-2">
                  <div className="text-[10px] uppercase tracking-wider text-cyan-200/70 mb-2">
                    Your color
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(["white", "black", "random"] as const).map((c) => (
                      <Button
                        key={c}
                        size="sm"
                        variant={color === c ? "default" : "outline"}
                        className={
                          color === c
                            ? "bg-amber-600 hover:bg-amber-500 border-0"
                            : "border-white/20 text-white/90 hover:bg-white/10"
                        }
                        onClick={() => setColor(c)}
                      >
                        {c === "white" ? "White" : c === "black" ? "Black" : "Random"}
                      </Button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {[1, 2, 3].map((tier) => {
              const tierVariants = grouped.get(tier) ?? [];
              if (tierVariants.length === 0) return null;
              const info = TIER_INFO[tier];
              return (
                <section key={tier} className="space-y-3">
                  <div className="flex items-end justify-between gap-2">
                    <div>
                      <h2 className="text-lg font-bold flex items-center gap-2">
                        {info.icon} {info.label}
                      </h2>
                      <div className="text-xs text-white/55">{info.subtitle}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {tierVariants.map((v) => (
                      <Card
                        key={v.id}
                        className="group bg-gradient-to-b from-white/[0.07] to-white/[0.02] border-white/10 text-white hover:border-cyan-400/40 hover:shadow-lg hover:shadow-cyan-500/10 transition-all duration-300"
                      >
                        <CardHeader className="py-3 pb-0">
                          <CardTitle className="text-sm flex items-center justify-between gap-2">
                            <span className="group-hover:text-cyan-100 transition-colors">{v.name}</span>
                            {v.randomStart && (
                              <Badge
                                variant="outline"
                                className="border-amber-400/40 text-amber-200/90 text-[10px]"
                              >
                                random start
                              </Badge>
                            )}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 pt-2">
                          <p className="text-xs text-white/65 leading-snug min-h-[2.5rem]">{v.blurb}</p>
                          <Button
                            size="sm"
                            className="w-full bg-gradient-to-r from-cyan-600 to-violet-600 hover:from-cyan-500 hover:to-violet-500 border-0 font-semibold shadow-md"
                            onClick={() => goPlay(v)}
                            disabled={start.isPending || matchPhase === "finding"}
                          >
                            <Swords className="w-4 h-4 mr-2 opacity-90" />
                            Enter queue
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>

          {/* Lobby rail — desktop */}
          <aside className="hidden lg:block space-y-4 sticky top-6">
            <LobbyRailCard
              playersOnline={playersOnline}
              activeTables={activeTables}
              ticker={ticker}
              rankTitle={rank.title}
              xp={xp}
              xpPct={rank.pct}
              xpNext={rank.next}
            />
          </aside>
        </div>

        {/* Mobile lobby summary */}
        <div className="lg:hidden mt-8">
          <LobbyRailCard
            playersOnline={playersOnline}
            activeTables={activeTables}
            ticker={ticker}
            rankTitle={rank.title}
            xp={xp}
            xpPct={rank.pct}
            xpNext={rank.next}
            compact
          />
        </div>
      </main>

      {matchPhase === "finding" && (
        <MatchmakingOverlay
          variantName={pendingVariantName}
          step={findingStep}
          timeControl={timeControl}
          persona={PERSONAS.find((p) => p.id === persona)?.label ?? persona}
        />
      )}
    </div>
  );
}

function LobbyRailCard({
  playersOnline,
  activeTables,
  ticker,
  rankTitle,
  xp,
  xpPct,
  xpNext,
  compact,
}: {
  playersOnline: number;
  activeTables: number;
  ticker: string[];
  rankTitle: string;
  xp: number;
  xpPct: number;
  xpNext: number;
  compact?: boolean;
}) {
  return (
    <Card className="bg-[#121c2c]/90 border-cyan-500/20 text-white backdrop-blur-md shadow-xl shadow-black/40">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 text-cyan-100">
          <Radio className="w-4 h-4 text-cyan-400 animate-pulse" />
          Live lobby
        </CardTitle>
        <p className="text-[10px] text-white/45 leading-snug">
          Decorative traffic — training tables only. No real matchmaking queue.
        </p>
      </CardHeader>
      <CardContent className={`space-y-4 ${compact ? "pt-0" : ""}`}>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-black/30 border border-white/10 p-3 text-center">
            <Users className="w-4 h-4 mx-auto text-cyan-300 mb-1" />
            <div className="text-[10px] uppercase tracking-wider text-white/50">Online</div>
            <div className="text-2xl font-black text-white tabular-nums">{playersOnline}</div>
          </div>
          <div className="rounded-lg bg-black/30 border border-white/10 p-3 text-center">
            <Trophy className="w-4 h-4 mx-auto text-amber-300 mb-1" />
            <div className="text-[10px] uppercase tracking-wider text-white/50">Tables</div>
            <div className="text-2xl font-black text-white tabular-nums">{activeTables}</div>
          </div>
        </div>

        <div>
          <div className="flex justify-between text-[10px] uppercase tracking-wider text-white/50 mb-1">
            <span>Lobby rank</span>
            <span className="text-cyan-200/90">{xp} XP</span>
          </div>
          <div className="text-xs font-semibold text-white/90 mb-2">{rankTitle}</div>
          <div className="h-2 rounded-full bg-black/40 overflow-hidden border border-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-violet-500 transition-all duration-700"
              style={{ width: `${xpPct}%` }}
            />
          </div>
          <div className="text-[10px] text-white/40 mt-1">Next tier near {xpNext} XP</div>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wider text-white/50 mb-2">Ticker</div>
          <ul
            className={`space-y-1.5 text-[11px] text-white/70 font-mono ${compact ? "max-h-32" : "max-h-48"} overflow-y-auto pr-1`}
          >
            {ticker.map((line, i) => (
              <li key={`${line}-${i}`} className="border-l-2 border-cyan-500/30 pl-2 py-0.5 leading-tight">
                {line}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

function MatchmakingOverlay({
  variantName,
  step,
  timeControl,
  persona,
}: {
  variantName: string;
  step: number;
  timeControl: string;
  persona: string;
}) {
  const steps = [
    { label: "Reserving table", sub: "Locking variant rules & clock" },
    { label: "Pairing coach bot", sub: persona },
    { label: "Syncing pieces", sub: `${variantName} · ${timeControl}` },
    { label: "Boards hot", sub: "Launching match…" },
  ];
  const cur = steps[Math.min(step, steps.length - 1)]!;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="matchmaking-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-cyan-500/30 bg-gradient-to-b from-[#1a2740] to-[#0f1729] p-6 shadow-2xl shadow-cyan-500/10 text-center space-y-5">
        <Loader2 className="w-10 h-10 mx-auto text-cyan-400 animate-spin" aria-hidden />
        <div>
          <h2 id="matchmaking-title" className="text-xl font-black tracking-tight text-white">
            Waiting room
          </h2>
          <p className="text-sm text-cyan-100/70 mt-1">Setting up your variant session…</p>
        </div>

        <div className="rounded-xl bg-black/40 border border-white/10 p-4 text-left space-y-2">
          <div className="text-xs text-cyan-200/80 font-semibold">{cur.label}</div>
          <div className="text-[11px] text-white/60">{cur.sub}</div>
          <div className="flex gap-1.5 pt-2">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  i <= step ? "bg-cyan-400" : "bg-white/15"
                }`}
              />
            ))}
          </div>
        </div>

        <p className="text-[10px] text-white/40">
          Tip: lobby XP rises each time you start a variant — purely local flair.
        </p>
      </div>
    </div>
  );
}

function groupByTier(variants: VariantDef[]): Map<number, VariantDef[]> {
  const out = new Map<number, VariantDef[]>();
  for (const v of variants) {
    const arr = out.get(v.tier) ?? [];
    arr.push(v);
    out.set(v.tier, arr);
  }
  return out;
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-white/70 bg-[#0f1729]">
      <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
      {children}
    </div>
  );
}
