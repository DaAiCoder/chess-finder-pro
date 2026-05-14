import { clamp } from "@/lib/utils";

export function EvalBar({ cp, mateIn }: { cp: number; mateIn?: number | null }) {
  // Map cp [-1000..1000] to whiteShare [0..1]
  let whiteShare = 0.5;
  let label = "0.0";
  if (mateIn != null) {
    whiteShare = mateIn > 0 ? 1 : 0;
    label = `M${Math.abs(mateIn)}`;
  } else {
    const v = clamp(cp, -1000, 1000) / 1000;
    whiteShare = 0.5 + v * 0.45;
    label = (cp / 100).toFixed(1);
  }

  return (
    <div className="relative w-6 h-full overflow-hidden rounded border border-border bg-secondary">
      <div className="absolute bottom-0 left-0 w-full bg-white" style={{ height: `${whiteShare * 100}%` }} />
      <div
        className="absolute top-0 left-0 w-full bg-neutral-900"
        style={{ height: `${(1 - whiteShare) * 100}%` }}
      />
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-[10px] font-bold text-neutral-700 mix-blend-difference text-white">
        {label}
      </div>
    </div>
  );
}
