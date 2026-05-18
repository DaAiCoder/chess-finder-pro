import { Link } from "wouter";
import { Lock, Sparkles, ArrowRight, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

const COPY: Record<
  string,
  { title: string; pitch: string }
> = {
  weekly_plan: {
    title: "Weekly training plan",
    pitch: "A 7-day schedule built from your weakest skills is included with Pro.",
  },
  repertoire: {
    title: "Repertoire trainer",
    pitch: "Upload PGNs and drill your openings with Pro.",
  },
  calculation_ladder: {
    title: "Calculation ladder",
    pitch: "Step up through forced calculation rungs with Pro.",
  },
  time_pressure: {
    title: "Time pressure trainer",
    pitch: "Timed puzzles plus engine reasoning after each solve — Pro.",
  },
  plan_finder: {
    title: "Plan finder",
    pitch: "Strategic plan MCQs and full play-outs are Pro trainers.",
  },
  pawn_structures: {
    title: "Pawn structures",
    pitch: "Structure drills, plans, and breaks — Pro.",
  },
  calculation_studio: {
    title: "Calculation studio",
    pitch: "Multi-move blind calculation lines — Pro.",
  },
  library_generate: {
    title: "Train from your library",
    pitch: "Generate puzzles mined from your imported games with Pro.",
  },
  default: {
    title: "Pro trainer",
    pitch: "Personalized and advanced trainers require an active Pro subscription.",
  },
};

export function TrainingProGate({ feature = "default" }: { feature?: string }) {
  const copy = COPY[feature] ?? COPY.default;
  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center p-4 md:p-8">
      <Card className="w-full max-w-2xl p-6 md:p-8 space-y-6 border-amber-700/35 bg-gradient-to-br from-amber-950/25 to-card">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-amber-600/20 text-amber-200">
            <Lock className="w-6 h-6" />
          </span>
          <div className="min-w-0">
            <Badge variant="outline" className="mb-1 text-[10px] border-amber-700/60 text-amber-200">
              Pro trainer
            </Badge>
            <h1 className="text-xl md:text-2xl font-bold leading-tight">{copy.title}</h1>
            <p className="text-sm text-amber-200/90 leading-snug">{copy.pitch}</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          New accounts get <strong className="text-foreground">3 days</strong> of full Pro. After that,
          subscribe yearly to unlock unlimited training puzzles and every advanced module.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button asChild style={{ backgroundColor: "#769656", color: "white" }}>
            <Link href="/pricing">
              <CreditCard className="w-4 h-4 mr-2" />
              View pricing
              <ArrowRight className="w-4 h-4 ml-1" />
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/training/tactics">
              <Sparkles className="w-4 h-4 mr-2" />
              Free tactics trainer
            </Link>
          </Button>
        </div>
      </Card>
    </div>
  );
}
