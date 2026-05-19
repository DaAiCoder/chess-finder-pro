import * as React from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Progress } from "@/components/ui/Progress";
import { cn } from "@/lib/utils";

export function AdminPageHeader({
  title,
  description,
  badge,
  actions,
}: {
  title: string;
  description?: string;
  badge?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-white via-white to-white/60 bg-clip-text text-transparent">
            {title}
          </h1>
          {badge && (
            <span className="text-[10px] uppercase tracking-widest font-semibold px-2.5 py-1 rounded-full border border-[#769656]/40 bg-[#769656]/10 text-[#a8d08d]">
              {badge}
            </span>
          )}
        </div>
        {description && (
          <p className="text-sm text-muted-foreground mt-2 max-w-2xl leading-relaxed">{description}</p>
        )}
      </div>
      {actions}
    </div>
  );
}

export function GlassCard({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card
      className={cn(
        "border-white/[0.08] bg-gradient-to-br from-card/90 via-card/70 to-card/40 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.35)]",
        className,
      )}
    >
      {children}
    </Card>
  );
}

export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  accent = "green",
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: "green" | "blue" | "amber" | "rose";
}) {
  const accents = {
    green: "from-[#769656]/25 to-emerald-500/5 border-[#769656]/30 text-[#a8d08d]",
    blue: "from-blue-500/20 to-blue-500/5 border-blue-500/30 text-blue-300",
    amber: "from-amber-500/20 to-amber-500/5 border-amber-500/30 text-amber-300",
    rose: "from-rose-500/20 to-rose-500/5 border-rose-500/30 text-rose-300",
  }[accent];

  return (
    <GlassCard className="overflow-hidden group hover:border-white/15 transition-colors">
      <CardContent className="p-5 relative">
        <div
          className={cn(
            "absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-br pointer-events-none",
            accents.split(" ").slice(0, 2).join(" "),
          )}
        />
        <div className="relative flex gap-4">
          <div
            className={cn(
              "rounded-xl p-2.5 h-fit border bg-gradient-to-br",
              accents,
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {label}
            </p>
            <p className="text-3xl font-bold tabular-nums tracking-tight mt-1">{value}</p>
            {hint && (
              <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug">{hint}</p>
            )}
          </div>
        </div>
      </CardContent>
    </GlassCard>
  );
}

export function FunnelStep({
  label,
  count,
  total,
  description,
}: {
  label: string;
  count: number;
  total: number;
  description?: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-baseline gap-2">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-sm tabular-nums text-muted-foreground">
          {count.toLocaleString()}{" "}
          <span className="text-[#a8d08d]">({pct}%)</span>
        </span>
      </div>
      <Progress value={pct} className="h-2 bg-white/5" />
      {description && <p className="text-[10px] text-muted-foreground">{description}</p>}
    </div>
  );
}

export function AdminToolbar({
  from,
  to,
  onFrom,
  onTo,
  adminKey,
  onAdminKey,
  sessionOk,
  loading,
  onRefresh,
}: {
  from: string;
  to: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
  adminKey: string;
  onAdminKey: (v: string) => void;
  sessionOk: boolean;
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <GlassCard>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Controls</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="space-y-2">
          <Label>From (UTC)</Label>
          <Input type="date" value={from} onChange={(e) => onFrom(e.target.value)} className="bg-black/20" />
        </div>
        <div className="space-y-2">
          <Label>To (UTC)</Label>
          <Input type="date" value={to} onChange={(e) => onTo(e.target.value)} className="bg-black/20" />
        </div>
        <div className="space-y-2 lg:col-span-2">
          <Label>API key (optional)</Label>
          <Input
            type="password"
            value={adminKey}
            onChange={(e) => onAdminKey(e.target.value)}
            placeholder={sessionOk ? "Operator session active" : "ADMIN_API_KEY"}
            className="bg-black/20"
          />
        </div>
        <div className="flex items-end">
          <Button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="w-full bg-gradient-to-r from-[#769656] to-[#5a7a42] hover:from-[#6a8a4c] hover:to-[#4d6b38] text-white border-0"
          >
            {loading ? "Loading…" : "Refresh"}
          </Button>
        </div>
      </CardContent>
    </GlassCard>
  );
}

export function DataTable({
  columns,
  rows,
  empty,
}: {
  columns: string[];
  rows: (string | React.ReactNode)[][];
  empty?: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">{empty ?? "No data"}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.08] bg-white/[0.03] text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            {columns.map((c) => (
              <th key={c} className="p-3 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-white/[0.05] hover:bg-white/[0.03] transition-colors">
              {row.map((cell, j) => (
                <td key={j} className="p-3">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function QuickLinkCard({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link href={href}>
      <GlassCard className="cursor-pointer hover:border-[#769656]/40 transition-all h-full">
        <CardContent className="p-5">
          <p className="font-semibold">{title}</p>
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        </CardContent>
      </GlassCard>
    </Link>
  );
}
