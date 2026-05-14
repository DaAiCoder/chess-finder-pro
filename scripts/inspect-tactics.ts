/**
 * Probe the running dev server's tactics pool to count problems eligible
 * for blind-tactics (i.e. solutions long enough to hide K plies + the
 * answer).
 *
 * Run: npx tsx scripts/inspect-tactics.ts
 */

interface Problem {
  id: number;
  fen: string;
  solution: string[];
}

async function main() {
  const res = await fetch("http://localhost:5000/api/training/problems?module=tactics");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as Problem[];
  console.log(`Total tactics: ${data.length}`);
  const buckets: Record<number, number> = {};
  for (const p of data) {
    const n = (p.solution ?? []).length;
    buckets[n] = (buckets[n] ?? 0) + 1;
  }
  for (const k of Object.keys(buckets).sort((a, b) => +a - +b)) {
    console.log(`  solutions of length ${k}: ${buckets[+k]}`);
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
