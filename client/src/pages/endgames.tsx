import * as React from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { api } from "@/lib/queryClient";
import { Crown, Flame, Search, Sparkles, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

interface CategoryMeta {
  id: string;
  name: string;
  description: string;
  count: number;
}

interface LessonSummary {
  id: string;
  name: string;
  category: string;
  tagline: string;
  objective: "win" | "draw" | "checkmate";
  userSide: "white" | "black";
  fen: string;
  plyCount: number;
}

const PROGRESS_KEY = "endgames-progress-v1";

interface ProgressMap {
  [lessonId: string]: { completed?: boolean; bestPlies?: number };
}

function loadProgress(): ProgressMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PROGRESS_KEY);
    return raw ? (JSON.parse(raw) as ProgressMap) : {};
  } catch {
    return {};
  }
}

export default function EndgamesCatalog() {
  const cats = useQuery<{ categories: CategoryMeta[] }>({
    queryKey: ["endgames", "categories"],
    queryFn: () => api("/api/endgames/categories"),
    staleTime: 5 * 60_000,
  });
  const lessons = useQuery<{ lessons: LessonSummary[] }>({
    queryKey: ["endgames", "lessons"],
    queryFn: () => api("/api/endgames/lessons"),
    staleTime: 5 * 60_000,
  });

  const [search, setSearch] = React.useState("");
  const [activeCat, setActiveCat] = React.useState<string | "all">("all");

  const progress = React.useMemo(() => loadProgress(), []);

  const filtered = React.useMemo(() => {
    let list = lessons.data?.lessons ?? [];
    if (activeCat !== "all") list = list.filter((l) => l.category === activeCat);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (l) =>
          l.name.toLowerCase().includes(q) ||
          l.tagline.toLowerCase().includes(q),
      );
    }
    return list;
  }, [lessons.data, activeCat, search]);

  const totalLessons = lessons.data?.lessons.length ?? 0;
  const completed = Object.values(progress).filter((p) => p?.completed).length;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      <header className="space-y-3">
        <div className="flex items-center gap-2">
          <Crown className="w-6 h-6 text-amber-400" />
          <h1 className="text-3xl font-bold tracking-tight">Endgames</h1>
        </div>
        <p className="text-muted-foreground max-w-2xl">
          Master the technical endgames every player needs cold. Each lesson is
          a famous theoretical position — learn the principle, then play it out
          against Stockfish to make it stick.
        </p>
        <div className="flex flex-wrap gap-3 text-xs">
          <Stat icon={Sparkles} label="Lessons" value={totalLessons} />
          <Stat icon={Trophy} label="Completed" value={`${completed} / ${totalLessons}`} />
        </div>
      </header>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Material categories
        </h2>
        <CategoryHeatmap
          categories={cats.data?.categories ?? []}
          active={activeCat}
          onChange={setActiveCat}
          progress={progress}
          allLessons={lessons.data?.lessons ?? []}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search lessons (e.g. Lucena, Philidor, B+N)…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        {activeCat !== "all" && (
          <button
            onClick={() => setActiveCat("all")}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Clear filter
          </button>
        )}
      </div>

      {lessons.isLoading ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">Loading…</CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">No lessons match.</CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((l) => (
            <LessonCard
              key={l.id}
              lesson={l}
              completed={!!progress[l.id]?.completed}
              bestPlies={progress[l.id]?.bestPlies}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-md border border-border bg-card/50 px-3 py-1.5">
      <Icon className="w-3.5 h-3.5 text-muted-foreground" />
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-mono font-semibold">{value}</span>
    </div>
  );
}

function CategoryHeatmap({
  categories,
  active,
  onChange,
  progress,
  allLessons,
}: {
  categories: CategoryMeta[];
  active: string | "all";
  onChange: (id: string | "all") => void;
  progress: ProgressMap;
  allLessons: LessonSummary[];
}) {
  // Compute completion ratio per category to color the cell intensity.
  const completionMap = React.useMemo(() => {
    const map = new Map<string, { done: number; total: number }>();
    for (const l of allLessons) {
      const cur = map.get(l.category) ?? { done: 0, total: 0 };
      cur.total++;
      if (progress[l.id]?.completed) cur.done++;
      map.set(l.category, cur);
    }
    return map;
  }, [allLessons, progress]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
      <HeatmapCell
        label="All"
        sublabel={`${allLessons.length} lessons`}
        active={active === "all"}
        onClick={() => onChange("all")}
        ratio={
          allLessons.length === 0
            ? 0
            : Object.values(progress).filter((p) => p?.completed).length /
              allLessons.length
        }
      />
      {categories.map((c) => {
        const stats = completionMap.get(c.id);
        const ratio = stats && stats.total ? stats.done / stats.total : 0;
        return (
          <HeatmapCell
            key={c.id}
            label={c.name}
            sublabel={`${stats?.done ?? 0}/${c.count} done`}
            active={active === c.id}
            onClick={() => onChange(c.id)}
            ratio={ratio}
            tooltip={c.description}
          />
        );
      })}
    </div>
  );
}

function HeatmapCell({
  label,
  sublabel,
  active,
  onClick,
  ratio,
  tooltip,
}: {
  label: string;
  sublabel: string;
  active: boolean;
  onClick: () => void;
  ratio: number;
  tooltip?: string;
}) {
  // Capa-style heatmap: green intensity scales with completion.
  const intensity = Math.min(1, Math.max(0.05, ratio));
  const bg = `rgba(16, 185, 129, ${intensity * 0.55})`;
  return (
    <button
      onClick={onClick}
      title={tooltip}
      className={cn(
        "rounded-md border p-3 text-left transition-all",
        active
          ? "border-primary ring-2 ring-primary/40"
          : "border-border hover:border-primary/40",
      )}
      style={{ backgroundColor: bg }}
    >
      <div className="text-sm font-bold leading-tight">{label}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{sublabel}</div>
    </button>
  );
}

function LessonCard({
  lesson,
  completed,
  bestPlies,
}: {
  lesson: LessonSummary;
  completed: boolean;
  bestPlies?: number;
}) {
  const objColor =
    lesson.objective === "draw"
      ? "bg-blue-500/15 text-blue-300 border-blue-500/40"
      : lesson.objective === "checkmate"
        ? "bg-red-500/15 text-red-300 border-red-500/40"
        : "bg-emerald-500/15 text-emerald-300 border-emerald-500/40";
  return (
    <Link href={`/endgames/${lesson.id}`}>
      <Card
        className={cn(
          "h-full transition-all cursor-pointer group",
          completed
            ? "border-emerald-500/40 hover:border-emerald-500/60"
            : "hover:border-primary/60 hover:shadow-lg",
        )}
      >
        <CardContent className="p-4 flex flex-col gap-2 h-full">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-bold flex-1 group-hover:text-primary transition-colors">
              {lesson.name}
            </h3>
            <Badge variant="outline" className={cn("text-[10px] uppercase", objColor)}>
              {lesson.objective}
            </Badge>
          </div>
          <p className="text-xs italic text-muted-foreground -mt-1">{lesson.tagline}</p>
          <MiniBoard fen={lesson.fen} orientation={lesson.userSide} />
          <div className="flex items-center justify-between text-xs pt-1">
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <span
                className="w-2.5 h-2.5 inline-block rounded-full border border-border"
                style={{ backgroundColor: lesson.userSide === "white" ? "#f0d9b5" : "#1e1e1e" }}
              />
              You play {lesson.userSide}
            </span>
            {completed && (
              <span className="inline-flex items-center gap-1 text-emerald-400">
                <Flame className="w-3 h-3" /> {bestPlies != null ? `${bestPlies} ply best` : "Done"}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

/**
 * Tiny static thumbnail of the position — pure SVG so it doesn't pull in
 * Chessground for every card.
 */
function MiniBoard({
  fen,
  orientation,
}: {
  fen: string;
  orientation: "white" | "black";
}) {
  const board = parseFenToBoard(fen);
  const rows = orientation === "white" ? [...board].reverse() : board;
  const files = orientation === "white" ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
  return (
    <div
      className="grid grid-cols-8 w-full aspect-square rounded overflow-hidden border border-border"
      role="img"
      aria-label="Endgame starting position"
    >
      {rows.map((row, r) =>
        files.map((c) => {
          const piece = row[c];
          const isLight = (r + c) % 2 === (orientation === "white" ? 0 : 1);
          return (
            <div
              key={`${r}-${c}`}
              className="flex items-center justify-center text-base sm:text-lg font-serif select-none"
              style={{
                backgroundColor: isLight ? "#eeeed2" : "#769656",
                color: piece && piece === piece.toUpperCase() ? "#fff" : "#111",
                textShadow:
                  piece && piece === piece.toUpperCase()
                    ? "0 0 2px #000"
                    : undefined,
                lineHeight: 1,
              }}
            >
              {piece ? PIECE_GLYPH[piece] : ""}
            </div>
          );
        }),
      )}
    </div>
  );
}

const PIECE_GLYPH: Record<string, string> = {
  K: "♔",
  Q: "♕",
  R: "♖",
  B: "♗",
  N: "♘",
  P: "♙",
  k: "♚",
  q: "♛",
  r: "♜",
  b: "♝",
  n: "♞",
  p: "♟",
};

function parseFenToBoard(fen: string): (string | null)[][] {
  const piecePart = fen.split(" ")[0];
  const ranks = piecePart.split("/");
  const board: (string | null)[][] = [];
  for (const rank of ranks) {
    const row: (string | null)[] = [];
    for (const ch of rank) {
      if (/[1-8]/.test(ch)) {
        for (let i = 0; i < Number(ch); i++) row.push(null);
      } else {
        row.push(ch);
      }
    }
    board.push(row);
  }
  // FEN ranks come from rank 8 to rank 1 (top to bottom). To plot with
  // [row 0 = rank 1 ... row 7 = rank 8], reverse:
  return board.reverse();
}
