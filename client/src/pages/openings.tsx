import * as React from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { api } from "@/lib/queryClient";
import { ArrowRight, Goal, Search, Sparkles, Trophy } from "lucide-react";

interface CourseSummary {
  slug: string;
  name: string;
  color: "white" | "black";
  description: string;
  tagline?: string;
  lineCount: number;
}

type ColorFilter = "all" | "white" | "black";

const PROGRESS_STORAGE_KEY = "openings-progress-v1";

interface ProgressMap {
  [slug: string]: { mastered: string[] }; // line ids
}

function loadProgress(): ProgressMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PROGRESS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ProgressMap) : {};
  } catch {
    return {};
  }
}

export default function OpeningsCatalog() {
  const { data, isLoading } = useQuery<{ courses: CourseSummary[] }>({
    queryKey: ["openings", "courses"],
    queryFn: () => api("/api/openings/courses"),
    staleTime: 5 * 60_000,
  });

  const [color, setColor] = React.useState<ColorFilter>("all");
  const [search, setSearch] = React.useState("");

  const progress = React.useMemo(() => loadProgress(), []);

  const filtered = React.useMemo(() => {
    const list = data?.courses ?? [];
    return list.filter((c) => {
      if (color !== "all" && c.color !== color) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        if (
          !c.name.toLowerCase().includes(q) &&
          !c.description.toLowerCase().includes(q) &&
          !(c.tagline ?? "").toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [data, color, search]);

  const totalLines = (data?.courses ?? []).reduce((s, c) => s + c.lineCount, 0);
  const mastered = Object.values(progress).reduce(
    (s, p) => s + (p?.mastered?.length ?? 0),
    0,
  );

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      <header className="space-y-3">
        <div className="flex items-center gap-2">
          <Goal className="w-6 h-6 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">Openings</h1>
        </div>
        <p className="text-muted-foreground max-w-2xl">
          Master chess openings with reps. Pick a course, learn the lines,
          drill them under pressure. Built for memorization that sticks.
        </p>
        <div className="flex flex-wrap gap-3 text-xs">
          <Stat icon={Sparkles} label="Courses" value={data?.courses?.length ?? "—"} />
          <Stat icon={Trophy} label="Lines mastered" value={`${mastered} / ${totalLines}`} />
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search openings…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <ColorTabs value={color} onChange={setColor} />
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">Loading courses…</CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No courses match.
          </CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c) => (
            <CourseCard
              key={c.slug}
              course={c}
              mastered={progress[c.slug]?.mastered?.length ?? 0}
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

function ColorTabs({
  value,
  onChange,
}: {
  value: ColorFilter;
  onChange: (v: ColorFilter) => void;
}) {
  const opts: { id: ColorFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "white", label: "For White" },
    { id: "black", label: "For Black" },
  ];
  return (
    <div className="inline-flex rounded-md border border-border bg-card p-0.5">
      {opts.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={
            "px-3 py-1.5 text-xs font-medium rounded-sm transition-colors " +
            (value === o.id
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground")
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function CourseCard({
  course,
  mastered,
}: {
  course: CourseSummary;
  mastered: number;
}) {
  const pct = course.lineCount > 0 ? (mastered / course.lineCount) * 100 : 0;
  const isWhite = course.color === "white";
  return (
    <Link href={`/openings/${course.slug}`}>
      <Card className="h-full transition-all hover:border-primary/60 hover:shadow-lg cursor-pointer group">
        <CardContent className="p-4 flex flex-col gap-3 h-full">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span
                aria-hidden
                className="inline-block w-3 h-3 rounded-full border border-border shrink-0"
                style={{
                  backgroundColor: isWhite ? "#f0d9b5" : "#1e1e1e",
                }}
              />
              <h3 className="font-bold truncate group-hover:text-primary transition-colors">
                {course.name}
              </h3>
            </div>
            <Badge variant="outline" className="text-[10px] uppercase shrink-0">
              {isWhite ? "White" : "Black"}
            </Badge>
          </div>
          {course.tagline && (
            <p className="text-xs italic text-muted-foreground -mt-1">
              {course.tagline}
            </p>
          )}
          <p className="text-sm text-muted-foreground line-clamp-3">
            {course.description}
          </p>

          <div className="mt-auto space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {mastered}/{course.lineCount} lines mastered
              </span>
              <span className="font-mono">{Math.round(pct)}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${pct}%`,
                  backgroundColor: pct === 100 ? "#10b981" : "hsl(var(--primary))",
                }}
              />
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-muted-foreground">{course.lineCount} lines</span>
              <Button size="sm" variant="ghost" className="gap-1 h-7 -mr-2">
                Start <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
