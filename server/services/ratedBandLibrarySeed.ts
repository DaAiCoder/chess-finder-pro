/**
 * Seed the library with realistic rating bands so the Game Library explorer
 * has local data when Lichess rate-limits unauthenticated clients.
 *
 * Games are short opening lines with synthetic club names + Elo headers;
 * tiers come from `classifyTier` (avg rating). Idempotent: stable Event ids
 * dedupe on re-run.
 */

import { ingestPgn } from "./libraryIngest.js";
import type { IStorage } from "../storage.js";

const TARGET: Record<"titled" | "expert" | "intermediate" | "amateur", number> = {
  titled: Number(process.env.LIBRARY_RATED_SEED_TITLED ?? 100),
  expert: Number(process.env.LIBRARY_RATED_SEED_EXPERT ?? 220),
  intermediate: Number(process.env.LIBRARY_RATED_SEED_INTERMEDIATE ?? 220),
  amateur: Number(process.env.LIBRARY_RATED_SEED_AMATEUR ?? 220),
};

/** First ~8–14 moves — varied EPDs for explorer coverage. */
const MOVETEXTS: string[] = [
  "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O",
  "1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be3 e5 7. Nb3 Be6 8. f3 Nbd7",
  "1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 5. e3 O-O 6. Nf3 h6 7. Bh4 b6 8. cxd5 exd5",
  "1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6 5. Nf3 O-O 6. Be2 e5 7. O-O Nc6 8. d5 Ne7",
  "1. Nf3 Nf6 2. g3 g6 3. Bg2 Bg7 4. O-O O-O 5. d4 d6 6. c4 c5 7. Nc3 Nc6 8. d5",
  "1. e4 e6 2. d4 d5 3. Nd2 Nf6 4. e5 Nfd7 5. c3 c5 6. Bd3 Nc6 7. Ne2 cxd4 8. cxd4",
  "1. e4 c5 2. Nf3 e6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 Bb4 6. e5 Nd5 7. Bd2 Nxc3 8. bxc3",
  "1. c4 e5 2. Nc3 Nf6 3. Nf3 Nc6 4. g3 Bb4 5. Bg2 O-O 6. O-O Re8 7. d3 h6 8. a3",
  "1. e4 d5 2. exd5 Qxd5 3. Nc3 Qa5 4. d4 Nf6 5. Nf3 Bf5 6. Ne5 c6 7. g4 Be6 8. Bg2",
  "1. f4 d5 2. Nf3 g6 3. g3 Bg7 4. Bg2 Nf6 5. O-O O-O 6. d3 c5 7. c3 Nc6 8. Qe1",
  "1. b3 e5 2. Bb2 Nc6 3. e3 Nf6 4. Bb5 Bd6 5. Ne2 O-O 6. O-O a6 7. Bxc6 dxc6 8. d4",
  "1. d4 f5 2. c4 Nf6 3. Nc3 g6 4. h4 Bg7 5. h5 O-O 6. hxg6 hxg6 7. Nf3 d6 8. e3",
  "1. e4 Nc6 2. d4 d5 3. e5 Bf5 4. c3 e6 5. f4 Qd7 6. Nf3 O-O-O 7. Be3 f6 8. Bd3",
  "1. Nf3 d5 2. g3 c6 3. Bg2 Bg4 4. O-O Nd7 5. d4 e6 6. Nbd2 Ngf6 7. c4 Bd6 8. b3",
  "1. e4 e5 2. Bc4 Nf6 3. d3 Bc5 4. Nc3 O-O 5. Nf3 d6 6. O-O h6 7. a4 a6 8. h3",
  "1. d4 d5 2. Nf3 Nf6 3. c4 e6 4. Nc3 Be7 5. Bg5 h6 6. Bh4 O-O 7. e3 b6 8. Bd3",
  "1. e4 c5 2. c3 d5 3. exd5 Qxd5 4. d4 Nf6 5. Nf3 e6 6. Be2 Be7 7. O-O O-O 8. h3",
  "1. e4 g6 2. d4 Bg7 3. Nc3 d6 4. f4 c5 5. dxc5 Qa5 6. Bd2 Qxc5 7. Nf3 Nf6 8. Bd3",
  "1. d4 Nf6 2. Nf3 g6 3. Bf4 Bg7 4. e3 d6 5. Be2 O-O 6. O-O Nbd7 7. h3 c5 8. c3",
  "1. c4 Nf6 2. Nc3 e6 3. e4 d5 4. e5 d4 5. exf6 dxc3 6. bxc3 Qxf6 7. Nf3 Bd6 8. d4",
  "1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Nxd4 Bc5 5. Be3 Qf6 6. c3 Nge7 7. Bc4 d6 8. O-O",
  "1. e4 c5 2. Nc3 Nc6 3. f4 g6 4. Nf3 Bg7 5. Bb5 Nd4 6. O-O a6 7. Bd3 d6 8. Kh1",
  "1. d4 Nf6 2. c4 e6 3. g3 d5 4. Bg2 dxc4 5. Qa4+ Nbd7 6. Qxc4 a6 7. Nf3 b5 8. Qd3",
  "1. e4 d6 2. d4 Nf6 3. Nc3 g6 4. Nf3 Bg7 5. Be2 O-O 6. O-O c5 7. d5 e6 8. Nd2",
];

const RESULTS = ["1-0", "0-1", "1/2-1/2"] as const;

function whiteBlackForTier(tier: "titled" | "expert" | "intermediate" | "amateur", i: number): {
  w: number;
  b: number;
} {
  const k = i * 17 + (tier.length % 5);
  switch (tier) {
    case "titled":
      return { w: 2240 + (k % 80), b: 2280 + ((k * 3) % 90) };
    case "expert":
      return { w: 2010 + (k % 90), b: 2070 + ((k * 5) % 100) };
    case "intermediate":
      return { w: 1620 + (k % 120), b: 1760 + ((k * 7) % 140) };
    case "amateur":
      return { w: 1120 + (k % 200), b: 1380 + ((k * 11) % 180) };
  }
}

function buildRatedSeedPgn(tier: "titled" | "expert" | "intermediate" | "amateur", i: number): string {
  const { w, b } = whiteBlackForTier(tier, i);
  const movetext = MOVETEXTS[i % MOVETEXTS.length]!;
  const result = RESULTS[i % 3]!;
  const white = `Club_${tier}_${(i * 7) % 200}`;
  const black = `Arena_${tier}_${(i * 11) % 200}`;
  const event = `CFP rated seed ${tier} #${i}`;
  return (
    `[Event "${event}"]\n` +
    `[Site "https://chessfinderpro.local/seed"]\n` +
    `[Date "2024.06.${String(1 + (i % 28)).padStart(2, "0")}"]\n` +
    `[White "${white}"]\n` +
    `[Black "${black}"]\n` +
    `[WhiteElo "${w}"]\n` +
    `[BlackElo "${b}"]\n` +
    `[Result "${result}"]\n\n` +
    `${movetext} ${result}`
  );
}

/**
 * Top up expert / intermediate / amateur / titled rows until each band hits
 * TARGET — safe to call on every boot (dedupe via pgnHash).
 */
export async function ensureRatedBandGames(storage: IStorage): Promise<void> {
  const tiers = ["titled", "expert", "intermediate", "amateur"] as const;
  for (const tier of tiers) {
    const cap = TARGET[tier];
    const have = await storage.countLibraryGames({ tier });
    const need = cap - have;
    if (need <= 0) continue;

    let inserted = 0;
    let dup = 0;
    let err = 0;
    for (let i = 0; i < need; i++) {
      try {
        const pgn = buildRatedSeedPgn(tier, i);
        const r = await ingestPgn(pgn, { source: "pgn", maxIndexedPlies: 24 });
        if (r.duplicate) dup++;
        else inserted++;
      } catch {
        err++;
      }
      if ((i + 1) % 80 === 0) await new Promise((r) => setImmediate(r));
    }
    console.log(
      `[rated-seed] tier=${tier}: had ${have}, needed ${need}, +${inserted} inserted, ${dup} dup, ${err} err`,
    );
  }
}
