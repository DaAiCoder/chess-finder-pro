import * as React from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  BarChart3,
  Users,
  Zap,
  Dumbbell,
  Wallet,
  Server,
  DollarSign,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/brand";

const NAV_GROUPS = [
  {
    label: "Command",
    items: [{ href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true }],
  },
  {
    label: "Growth",
    items: [
      { href: "/admin/traffic", label: "Traffic", icon: BarChart3 },
      { href: "/admin/product", label: "Activation", icon: Zap },
    ],
  },
  {
    label: "Product",
    items: [
      { href: "/admin/engagement", label: "Engagement", icon: Dumbbell },
      { href: "/admin/members", label: "Members", icon: Users },
    ],
  },
  {
    label: "Business",
    items: [
      { href: "/admin/revenue", label: "Revenue", icon: Wallet },
      { href: "/admin/pricing", label: "Pricing", icon: DollarSign },
    ],
  },
  {
    label: "System",
    items: [{ href: "/admin/ops", label: "Ops & health", icon: Server }],
  },
] as const;

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const [loc] = useLocation();

  return (
    <div className="min-h-screen flex text-foreground admin-portal-shell">
      <aside className="w-64 shrink-0 border-r border-white/[0.06] flex flex-col bg-black/40 backdrop-blur-2xl relative z-10">
        <div className="p-5 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-[#769656] to-[#4a5f32] flex items-center justify-center shadow-lg shadow-[#769656]/20">
              <LayoutDashboard className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="font-bold text-sm tracking-tight">{APP_NAME}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Operator</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto p-3 space-y-5">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/80 px-3 mb-2">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active =
                    "exact" in item && item.exact
                      ? loc === item.href
                      : loc === item.href || loc.startsWith(`${item.href}/`);
                  const Icon = item.icon;
                  return (
                    <Link key={item.href} href={item.href}>
                      <span
                        className={cn(
                          "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-all cursor-pointer group",
                          active
                            ? "bg-gradient-to-r from-[#769656]/25 to-transparent text-white font-medium border border-[#769656]/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                            : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]",
                        )}
                      >
                        <Icon
                          className={cn(
                            "h-4 w-4 shrink-0",
                            active ? "text-[#a8d08d]" : "opacity-70",
                          )}
                        />
                        {item.label}
                        {active && (
                          <ChevronRight className="h-3.5 w-3.5 ml-auto text-[#769656]/80" />
                        )}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="p-4 border-t border-white/[0.06] text-[10px] text-muted-foreground">
          chessgm.co · internal only
        </div>
      </aside>
      <main className="flex-1 min-w-0 overflow-auto relative">
        <div className="admin-portal-glow pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative max-w-[1400px] mx-auto p-6 md:p-10">{children}</div>
      </main>
    </div>
  );
}
