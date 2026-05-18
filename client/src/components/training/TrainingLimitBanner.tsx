import { Link } from "wouter";
import { useTrainingUsage } from "@/hooks/useTrainingUsage";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

/** Shows daily puzzle allowance for non-Pro users on trainer pages. */
export function TrainingLimitBanner({ className }: { className?: string }) {
  const { usage, isLoading } = useTrainingUsage();

  if (isLoading || !usage || usage.unlimited) return null;

  const low = usage.remaining <= 3;

  return (
    <div
      className={cn(
        "rounded-lg border px-4 py-3 text-sm flex flex-wrap items-center justify-between gap-3",
        low ? "border-amber-600/40 bg-amber-950/25" : "border-border bg-card/60",
        className,
      )}
    >
      <p className={cn("text-muted-foreground", low && "text-amber-100/90")}>
        <span className="font-medium text-foreground">{usage.remaining}</span> of{" "}
        <span className="font-medium text-foreground">{usage.limit}</span> free training puzzles
        left today.
        {low && " Subscribe for unlimited puzzles and training from your games."}
      </p>
      <Button asChild size="sm" style={{ backgroundColor: "#769656", color: "white" }}>
        <Link href="/pricing">View Pro</Link>
      </Button>
    </div>
  );
}
