import * as React from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Flame,
  Menu,
  MessageCircle,
  Search,
  Trophy,
  User as UserIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { api } from "@/lib/queryClient";

/** Rotating placeholders for the header “Ask Tal” search; submit uses the visible line if the box is empty. */
const ASK_TAL_HEADER_PROMPTS = [
  "How do I beat the Caro-Kann?",
  "What should I play against the Sicilian?",
  "How do I improve my calculation?",
  "Best plan in a closed center?",
  "How do I convert a queen-up endgame?",
  "What should I work on this week?",
];

export function AppHeader({
  chromeless = false,
  onOpenMenu,
}: {
  chromeless?: boolean;
  onOpenMenu?: () => void;
}) {
  return (
    <header className="flex h-14 items-center gap-2 sm:gap-3 border-b border-border bg-card/50 px-3 sm:px-4 md:px-6 min-w-0">
      <div className="flex items-center gap-2 shrink-0">
        {!chromeless && onOpenMenu && (
          <button
            type="button"
            onClick={onOpenMenu}
            className="md:hidden p-2 rounded hover:bg-secondary"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <div className={cn(chromeless ? "flex" : "md:hidden")}>
          <Brand small={chromeless} />
        </div>
      </div>
      <div className="flex-1 min-w-0 flex justify-center px-1 sm:px-3">
        <AskTalSearchBar />
      </div>
      <TopNavStatus />
    </header>
  );
}

export function Brand({ small = false }: { small?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2 group">
      <span
        className="inline-flex items-center justify-center w-8 h-8 rounded font-bold text-white"
        style={{ backgroundColor: "#769656" }}
      >
        ♞
      </span>
      <span className={cn("font-bold tracking-tight", small ? "text-base" : "text-lg")}>
        ChessFinderPro
      </span>
    </Link>
  );
}

function AskTalSearchBar() {
  const [, setLocation] = useLocation();
  const [value, setValue] = React.useState("");
  const [promptIdx, setPromptIdx] = React.useState(0);

  React.useEffect(() => {
    const id = window.setInterval(() => {
      setPromptIdx((i) => (i + 1) % ASK_TAL_HEADER_PROMPTS.length);
    }, 4500);
    return () => window.clearInterval(id);
  }, []);

  const placeholder = ASK_TAL_HEADER_PROMPTS[promptIdx]!;

  return (
    <form
      className="w-full max-w-md flex items-center gap-1.5 rounded-full border border-border bg-background/90 pl-2.5 sm:pl-3 pr-1 py-0.5 shadow-sm focus-within:border-emerald-600/50 focus-within:ring-2 focus-within:ring-emerald-500/15 transition-shadow"
      onSubmit={(e) => {
        e.preventDefault();
        const q = value.trim() || placeholder;
        setLocation(`/coach?q=${encodeURIComponent(q)}`);
        setValue("");
      }}
    >
      <MessageCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500 shrink-0" aria-hidden />
      <input
        type="search"
        name="ask-tal"
        enterKeyHint="search"
        className="flex-1 min-w-0 bg-transparent text-xs sm:text-sm outline-none placeholder:text-muted-foreground/90 py-1.5"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label="Ask Tal — chess question"
      />
      <button
        type="submit"
        className="shrink-0 rounded-full p-2 text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
        aria-label="Open Ask Tal with this question"
      >
        <Search className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
      </button>
    </form>
  );
}

interface StreakResponse {
  currentStreak: number;
  longestStreak: number;
  xp: number;
  level: number;
  weeklyXp: number;
}

function TopNavStatus() {
  const { user } = useCurrentUser();
  const streak = useQuery<StreakResponse | null>({
    queryKey: ["streak", user?.id],
    enabled: !!user,
    queryFn: () => api<StreakResponse | null>("/api/streak"),
    staleTime: 30_000,
  });

  const days = streak.data?.currentStreak ?? 0;
  const xp = streak.data?.xp ?? 0;
  const level = streak.data?.level ?? 1;
  const xpThis = xp % 500;
  const xpPct = Math.min(100, Math.round((xpThis / 500) * 100));

  return (
    <div className="flex items-center gap-2 text-xs shrink-0">
      <Link
        href="/training"
        className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-md bg-secondary/60 hover:bg-secondary border border-border/60 text-foreground/90"
        title={`${days}-day streak — longest ${streak.data?.longestStreak ?? 0}`}
      >
        <Flame className={cn("w-3.5 h-3.5", days > 0 ? "text-orange-400" : "text-muted-foreground")} />
        <span className="font-medium">{days}</span>
      </Link>
      <Link
        href="/statistics"
        className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-md bg-secondary/60 hover:bg-secondary border border-border/60 text-foreground/90"
        title={`Level ${level} — ${xpThis}/500 XP to next`}
      >
        <Trophy className="w-3.5 h-3.5 text-amber-400" />
        <span className="font-medium">Lv {level}</span>
        <span className="hidden md:inline w-12 h-1 rounded bg-border overflow-hidden">
          <span
            className="block h-full bg-amber-400 transition-all"
            style={{ width: `${xpPct}%` }}
          />
        </span>
      </Link>
      <UserBadge user={user} />
    </div>
  );
}

function UserBadge({
  user,
}: {
  user: ReturnType<typeof useCurrentUser>["user"];
}) {
  if (!user) {
    return (
      <Link
        href="/login"
        className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-secondary/60 hover:bg-secondary border border-border/60 text-foreground/90"
      >
        <UserIcon className="w-3.5 h-3.5" />
        <span>Sign in</span>
      </Link>
    );
  }
  if (user.anonymous) {
    return (
      <Link
        href="/login"
        className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-secondary/60 hover:bg-secondary border border-border/60 text-foreground/90"
        title="You're using a guest account. Click to sign up or sign in to keep your progress on every device."
      >
        <UserIcon className="w-3.5 h-3.5 text-muted-foreground" />
        <span>Guest</span>
      </Link>
    );
  }
  return (
    <Link
      href="/account"
      className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-secondary/60 hover:bg-secondary border border-border/60 text-foreground/90"
    >
      <UserIcon className="w-3.5 h-3.5 text-emerald-400" />
      <span className="font-medium truncate max-w-[7rem]">{user.username}</span>
    </Link>
  );
}
