import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCp(cp: number): string {
  if (cp > 9000) return `M${cp - 90000}`; // sentinel — not used
  if (Math.abs(cp) >= 100000) return cp > 0 ? "M+" : "M-";
  const v = cp / 100;
  return (v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2));
}

export function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}
