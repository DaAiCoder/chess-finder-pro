/**
 * Fetches PGN Mentor player collections for every champion listed in
 * `server/data/championPgn/manifest.json` and writes one `<id>.pgn` file
 * per champion into the same directory.
 *
 * Run from the repo root:
 *
 *   npm run fetch:pgn-mentor             # fetch all listed champions
 *   npm run fetch:pgn-mentor -- botvinnik tal   # fetch a subset by id
 *
 * The script is dependency-free aside from `adm-zip` (already a devDep).
 * It overwrites any existing `<id>.pgn` files so re-running picks up the
 * latest monthly refresh from pgnmentor.com.
 */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import AdmZip from "adm-zip";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const PGN_DIR = path.join(REPO_ROOT, "server", "data", "championPgn");
const MANIFEST_PATH = path.join(PGN_DIR, "manifest.json");
const BASE_URL = "https://www.pgnmentor.com/players/";
const USER_AGENT = "ChessFinderPro/0.1 (+https://github.com/) PGN Mentor fetcher";

interface Manifest {
  champions: Record<string, string>;
}

async function readManifest(): Promise<Manifest> {
  const raw = await readFile(MANIFEST_PATH, "utf8");
  const parsed = JSON.parse(raw) as Manifest;
  if (!parsed.champions || typeof parsed.champions !== "object") {
    throw new Error(`manifest.json missing "champions" object`);
  }
  return parsed;
}

async function downloadZip(filename: string): Promise<Buffer> {
  const url = `${BASE_URL}${filename}`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  }
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

function extractPgn(zipBuffer: Buffer, filename: string): string {
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries().filter((e) => !e.isDirectory);
  const pgnEntry =
    entries.find((e) => e.entryName.toLowerCase().endsWith(".pgn")) ?? entries[0];
  if (!pgnEntry) {
    throw new Error(`No entries found in ${filename}`);
  }
  return pgnEntry.getData().toString("utf8");
}

async function fetchOne(id: string, filename: string): Promise<{ id: string; bytes: number; games: number }> {
  process.stdout.write(`  ${id.padEnd(14)} ← ${filename} … `);
  const zip = await downloadZip(filename);
  const pgn = extractPgn(zip, filename);
  const out = path.join(PGN_DIR, `${id}.pgn`);
  await writeFile(out, pgn, "utf8");
  // Cheap game count: PGN Mentor files have one [Event ...] header per game.
  const games = (pgn.match(/^\[Event\s/gm) ?? []).length;
  process.stdout.write(`ok (${games.toLocaleString()} games, ${(pgn.length / 1024).toFixed(0)} KB)\n`);
  return { id, bytes: pgn.length, games };
}

async function main(): Promise<void> {
  const manifest = await readManifest();
  const requested = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const ids = requested.length > 0 ? requested : Object.keys(manifest.champions);

  console.log(`Fetching ${ids.length} champion PGN${ids.length === 1 ? "" : "s"} from pgnmentor.com`);
  console.log(`Output: ${PGN_DIR}\n`);

  const results: Array<{ id: string; ok: boolean; games?: number; error?: string }> = [];
  for (const id of ids) {
    const filename = manifest.champions[id];
    if (!filename) {
      console.warn(`  ${id.padEnd(14)} (no manifest entry — skipped)`);
      results.push({ id, ok: false, error: "no manifest entry" });
      continue;
    }
    try {
      const r = await fetchOne(id, filename);
      results.push({ id, ok: true, games: r.games });
    } catch (err) {
      const e = err as Error;
      console.warn(`  ${id.padEnd(14)} FAILED: ${e.message}`);
      results.push({ id, ok: false, error: e.message });
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  const totalGames = results.reduce((s, r) => s + (r.games ?? 0), 0);
  console.log(
    `\nDone. ${okCount}/${results.length} champions, ${totalGames.toLocaleString()} games total.`,
  );

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.log(`Failures:`);
    for (const f of failed) console.log(`  - ${f.id}: ${f.error}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
