import * as React from "react";
import { Link, useLocation } from "wouter";
import { BarChart3, LayoutDashboard, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin/site-analytics", label: "Site analytics", icon: BarChart3 },
  { href: "/admin/pricing", label: "Pricing", icon: DollarSign },
] as const;

/** Operator sidebar for `goadmingo.*` / `admin.*` hosts (see `isAdminHost`). */
export function AdminLayout({ children }: { children: React.ReactNode }) {
  const [loc] = useLocation();
  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <aside className="w-56 shrink-0 border-r border-border bg-card/40 flex flex-col">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2 font-semibold text-sm tracking-tight">
            <LayoutDashboard className="h-4 w-4 text-muted-foreground" />
            Admin
          </div>
          <p className="text-[10px] text-muted-foreground mt-1 leading-snug">Operator console</p>
        </div>
        <nav className="flex-1 p-2 space-y-0.5">
          {NAV.map((item) => {
            const active = loc === item.href || loc.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href}>
                <span
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors cursor-pointer",
                    active
                      ? "bg-muted text-foreground font-medium"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0 opacity-80" />
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="flex-1 min-w-0 overflow-auto">
        <div className="max-w-6xl mx-auto p-6 md:p-8">{children}</div>
      </main>
    </div>
  );
}
