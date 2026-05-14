/**
 * Pull the default coach model for local Ollama (no cloud API keys).
 * Retries while winget / OllamaSetup is still finishing ("upgrade in progress").
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const model = process.env.COACH_OLLAMA_MODEL || "llama3.2";

function findOllama() {
  if (process.platform === "win32") {
    const p = path.join(process.env.LOCALAPPDATA || "", "Programs", "Ollama", "ollama.exe");
    if (fs.existsSync(p)) return p;
  }
  const t = spawnSync("ollama", ["--version"], { encoding: "utf8" });
  if (t.status === 0) return "ollama";
  return null;
}

async function main() {
  const bin = findOllama();
  if (!bin) {
    console.error(
      "[setup:ollama] Ollama not found. Install: winget install -e --id Ollama.Ollama\n" +
        "Then re-run: npm run setup:ollama",
    );
    process.exit(1);
  }
  console.log(`[setup:ollama] using ${bin} — pulling ${model} (may take a few minutes)…`);
  for (let i = 0; i < 18; i++) {
    const r = spawnSync(bin, ["pull", model], { stdio: "inherit", encoding: "utf8" });
    if (r.status === 0) {
      console.log(`[setup:ollama] ${model} is ready. Restart npm run dev and keep Ollama running in the tray.`);
      process.exit(0);
    }
    console.log(`[setup:ollama] pull exited ${r.status}; retry in 25s (${i + 1}/18)…`);
    await delay(25_000);
  }
  console.error("[setup:ollama] giving up — finish Ollama install, open the Ollama app once, then run this script again.");
  process.exit(1);
}

await main();
