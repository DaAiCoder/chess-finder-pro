import * as React from "react";
import { Link, useLocation } from "wouter";
import {
  BarChart3,
  BookOpen,
  Brain,
  Calculator,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Compass,
  Crosshair,
  Crown,
  Database,
  Flame,
  Gauge,
  Goal,
  LayoutGrid,
  Layers,
  MessageCircle,
  PlayCircle,
  RotateCcw,
  Search,
  Settings,
  ShieldAlert,
  Shuffle,
  Sparkles,
  Swords,
  Target,
  Timer,
  Trophy,
  TrendingUp,
  Upload,
  X,
  Eye,
  Youtube,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { OrientationBanner, triggerOrientationBanner } from "@/components/OrientationBanner";
import { AppHeader, Brand } from "@/components/layout/AppHeader";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /**
   * Optional nested items. When present, the parent renders as an
   * expand/collapse group: clicking the label still navigates to
   * `href`, but a chevron on the right toggles the children open/closed.
   * Auto-expands when any child route is active.
   */
  children?: NavItem[];
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  {
    title: "Play",
    items: [
      { href: "/play", label: "Play Chess", icon: Cpu },
      { href: "/play/tournaments", label: "Tournaments", icon: Trophy },
      { href: "/play/variants", label: "Variants & Modes", icon: Shuffle },
      { href: "/analysis", label: "Analysis", icon: Search },
      { href: "/opponent-prep", label: "Opponent Prep", icon: Crosshair },
      { href: "/champions", label: "Hall of Champions", icon: Crown },
    ],
  },
  {
    title: "Analyze",
    items: [
      { href: "/library", label: "Game Library", icon: Database },
      { href: "/discover", label: "Discover Lines", icon: Search },
      { href: "/import", label: "Import Games", icon: Upload },
      { href: "/analytics", label: "Analytics", icon: TrendingUp },
      { href: "/statistics", label: "My Statistics", icon: BarChart3 },
    ],
  },
  {
    title: "Watch",
    items: [
      { href: "/watch", label: "Watch Chess", icon: PlayCircle },
      { href: "/watch/cvc", label: "Computer chess", icon: Cpu },
      { href: "/watch/studio", label: "Chess Tube", icon: Youtube },
    ],
  },
  {
    title: "Train",
    items: [
      { href: "/coach", label: "Ask Tal", icon: MessageCircle },
      {
        href: "/training",
        label: "Training Hub",
        icon: Layers,
        children: [
          { href: "/training/360", label: "360 Trainer", icon: Shuffle },
          { href: "/training/tactics", label: "Tactics", icon: Sparkles },
          { href: "/training/blunder-preventer", label: "Blunder Prevention", icon: Target },
          { href: "/training/defender", label: "Defender", icon: ShieldAlert },
          { href: "/training/advantage", label: "Advantage", icon: Gauge },
          { href: "/training/visualization", label: "Visualization", icon: Eye },
          { href: "/training/pawn-structures", label: "Pawn structures", icon: LayoutGrid },
          { href: "/training/plans", label: "Plan finder", icon: Compass },
          { href: "/training/calculation-studio", label: "Calculation studio", icon: Calculator },
          { href: "/training/checkmate-patterns", label: "Checkmate Patterns", icon: Crown },
          { href: "/training/calculation-ladder", label: "Calculation Ladder", icon: TrendingUp },
          { href: "/training/intuition", label: "Intuition", icon: Brain },
          { href: "/training/time-pressure", label: "Time Pressure", icon: Timer },
          { href: "/training/repertoire", label: "Repertoire", icon: BookOpen },
          { href: "/training/retry", label: "Daily Review", icon: RotateCcw },
        ],
      },
      { href: "/onboarding", label: "Calibration", icon: Sparkles },
      { href: "/training/plan", label: "Weekly Plan", icon: Calendar },
      { href: "/openings", label: "Openings", icon: Goal },
      { href: "/endgames", label: "Endgames", icon: Flame },
    ],
  },
  {
    title: "Account",
    items: [{ href: "/account", label: "Account", icon: Settings }],
  },
];

export function MainLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [location] = useLocation();

  return (
    <div className="flex h-full min-h-screen w-full bg-background text-foreground">
      <aside
        className={cn(
          "hidden md:flex flex-col border-r border-border bg-card transition-all",
          collapsed ? "w-16" : "w-60",
        )}
      >
        <SidebarHeader collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
          {NAV.map((group) => (
            <div key={group.title}>
              {!collapsed && (
                <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.title}
                </div>
              )}
              <div className="flex flex-col gap-1">
                {group.items.map((item) => (
                  <NavEntry
                    key={item.href}
                    item={item}
                    location={location}
                    collapsed={collapsed}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>
        <WhatsNewFooter collapsed={collapsed} />
        <PlayComputerButton collapsed={collapsed} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-border bg-card flex flex-col">
            <div className="flex items-center justify-between p-3 border-b border-border">
              <Brand />
              <button
                onClick={() => setMobileOpen(false)}
                className="p-2 rounded hover:bg-secondary"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
              {NAV.map((group) => (
                <div key={group.title}>
                  <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.title}
                  </div>
                  <div className="flex flex-col gap-1">
                    {group.items.map((item) => (
                      <NavEntry
                        key={item.href}
                        item={item}
                        location={location}
                        collapsed={false}
                        onNav={() => setMobileOpen(false)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </nav>
            <WhatsNewFooter collapsed={false} />
            <PlayComputerButton collapsed={false} />
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <AppHeader onOpenMenu={() => setMobileOpen(true)} />
        <OrientationBanner />
        <main className="flex-1 overflow-y-auto pb-16 md:pb-0">{children}</main>
        <MobileBottomNav />
      </div>
    </div>
  );
}

function SidebarHeader({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between p-3 border-b border-border">
      {!collapsed && <Brand />}
      <button
        onClick={onToggle}
        className="ml-auto p-2 rounded hover:bg-secondary"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>
    </div>
  );
}

/**
 * Renders a single nav row, recursively expanding children when the
 * row represents a group. Expanded state persists per-href in
 * localStorage; the group is also auto-expanded when any descendant
 * route is active.
 */
function NavEntry({
  item,
  location,
  collapsed,
  onNav,
  depth = 0,
}: {
  item: NavItem;
  location: string;
  collapsed: boolean;
  onNav?: () => void;
  depth?: number;
}) {
  const hasChildren = !!item.children && item.children.length > 0;
  const childActive = hasChildren
    ? item.children!.some((c) => isActive(location, c.href))
    : false;
  const storageKey = `nav-expanded:${item.href}`;
  const [userOpen, setUserOpen] = React.useState<boolean | null>(() => {
    if (typeof window === "undefined") return null;
    const v = window.localStorage.getItem(storageKey);
    return v == null ? null : v === "1";
  });
  // Effective open state: explicit user choice overrides; otherwise
  // auto-expand when a child route is active.
  const open = hasChildren && (userOpen ?? childActive);

  // If the user navigates into a child, persist the expanded state so
  // subsequent visits remember it.
  React.useEffect(() => {
    if (hasChildren && childActive && userOpen !== true) {
      setUserOpen(true);
      try { window.localStorage.setItem(storageKey, "1"); } catch { /* noop */ }
    }
  }, [hasChildren, childActive, userOpen, storageKey]);

  // Leaves use the standard active-on-prefix logic; groups only
  // highlight when on the parent route itself, so the active style
  // doesn't double up with an active child row.
  const active = hasChildren
    ? location === item.href
    : isActive(location, item.href);

  if (!hasChildren) {
    return <NavLink item={item} active={active} collapsed={collapsed} onNav={onNav} depth={depth} />;
  }

  // When the sidebar is collapsed (desktop icon-only), don't render
  // child rows — just show the parent icon. Users can still click into
  // the hub.
  if (collapsed) {
    return <NavLink item={item} active={active || childActive} collapsed={collapsed} onNav={onNav} depth={depth} />;
  }

  return (
    <div className="flex flex-col">
      <div
        className={cn(
          "flex items-center rounded-md transition-colors",
          active
            ? "nav-link-active"
            : childActive
              ? "text-foreground/90 bg-secondary/40"
              : "text-foreground/80 hover:bg-secondary",
        )}
      >
        <Link
          href={item.href}
          onClick={onNav}
          className="flex flex-1 items-center gap-3 px-3 py-2 text-sm min-w-0"
        >
          <item.icon className="w-4 h-4 shrink-0" />
          <span className="truncate">{item.label}</span>
        </Link>
        <button
          type="button"
          aria-label={open ? `Collapse ${item.label}` : `Expand ${item.label}`}
          aria-expanded={open}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const next = !open;
            setUserOpen(next);
            try { window.localStorage.setItem(storageKey, next ? "1" : "0"); } catch { /* noop */ }
          }}
          className="p-2 mr-1 rounded hover:bg-secondary/80 text-muted-foreground hover:text-foreground"
        >
          <ChevronDown
            className={cn(
              "w-3.5 h-3.5 transition-transform",
              open ? "rotate-0" : "-rotate-90",
            )}
          />
        </button>
      </div>
      {open && (
        <div className="ml-3 mt-0.5 mb-1 pl-2 border-l border-border/60 flex flex-col gap-0.5">
          {item.children!.map((c) => (
            <NavEntry
              key={c.href}
              item={c}
              location={location}
              collapsed={collapsed}
              onNav={onNav}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NavLink({
  item,
  active,
  collapsed,
  onNav,
  depth = 0,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onNav?: () => void;
  depth?: number;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNav}
      className={cn(
        "flex items-center gap-3 rounded-md transition-colors",
        depth > 0 ? "px-2.5 py-1.5 text-[13px]" : "px-3 py-2 text-sm",
        active ? "nav-link-active" : "text-foreground/80 hover:bg-secondary",
      )}
      title={collapsed ? item.label : undefined}
    >
      <Icon className={cn("shrink-0", depth > 0 ? "w-3.5 h-3.5" : "w-4 h-4")} />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
}

/* ---------------------------------------------------------------------- */
/* Mobile bottom-tab nav (Play / Train / Analyze / Coach / Me)            */
/* ---------------------------------------------------------------------- */

const MOBILE_TABS: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { href: "/play", label: "Play", icon: Swords },
  { href: "/training", label: "Train", icon: Layers },
  { href: "/analytics", label: "Analyze", icon: TrendingUp },
  { href: "/coach", label: "Ask Tal", icon: MessageCircle },
  { href: "/account", label: "Account", icon: Settings },
];

function MobileBottomNav() {
  const [location] = useLocation();
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-card/95 backdrop-blur flex justify-around items-stretch h-14">
      {MOBILE_TABS.map(({ href, label, icon: Icon }) => {
        const active = isActive(location, href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px]",
              active ? "text-foreground" : "text-muted-foreground",
            )}
          >
            <Icon className={cn("w-5 h-5", active && "text-emerald-400")} />
            <span className="leading-none">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function WhatsNewFooter({ collapsed }: { collapsed: boolean }) {
  return (
    <div className="px-2 pb-2">
      <button
        type="button"
        onClick={() => triggerOrientationBanner()}
        className={cn(
          "w-full flex items-center justify-center gap-2 rounded-md py-2 text-xs font-medium",
          "border border-dashed border-emerald-600/40 text-emerald-600/90 hover:bg-emerald-950/30",
          "transition-colors",
        )}
      >
        <Sparkles className="w-3.5 h-3.5 shrink-0" />
        {!collapsed && <span>What&apos;s new</span>}
      </button>
    </div>
  );
}

function PlayComputerButton({ collapsed }: { collapsed: boolean }) {
  return (
    <div className="p-3 border-t border-border">
      <Link
        href="/play"
        className="flex items-center justify-center gap-2 rounded-md py-2 text-sm font-semibold text-white transition-colors"
        style={{ backgroundColor: "#769656" }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#5a7a42")}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#769656")}
      >
        <Swords className="w-4 h-4" />
        {!collapsed && "Play Computer"}
      </Link>
    </div>
  );
}

function isActive(location: string, href: string): boolean {
  if (href === "/") return location === "/";
  return location === href || location.startsWith(href + "/");
}
