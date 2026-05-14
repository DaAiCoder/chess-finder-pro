/**
 * Universal setup / system library.
 *
 * Unlike named openings, a "setup" is a piece-placement pattern that the
 * player aims for *regardless* of the opponent's move order. The Pattern
 * Finder uses these definitions to walk from each plausible opponent
 * first move toward the target structure.
 *
 * Each entry defines:
 *   - `targets`     — squares we want our pieces on, by piece type
 *   - `minMatchCount` — how many targets must be hit to declare success
 *   - `sampleSan`   — a canonical illustrative move order
 *
 * Setup matching is deliberately loose: most setups have flex points
 * (e.g. Hedgehog black bishop on b7 or rare a8; queen on c7 or b8). A
 * partial hit (≥ minMatchCount) counts so transpositions still match.
 */

import type { SetupTemplate } from "../../shared/schema.js";

export const SETUP_TEMPLATES: SetupTemplate[] = [
  /* -------------------------------------------------------------------- */
  /* HEDGEHOG (black) — universal slow setup vs anything                  */
  /* Pawns on a6/b6/d6/e6, bishops on b7/e7, knights on f6/d7, queen c7. */
  /* -------------------------------------------------------------------- */
  {
    id: "hedgehog",
    name: "Hedgehog Defense",
    side: "black",
    description:
      "Universal slow setup for Black: pawns a6/b6/d6/e6, bishops on b7/e7, knights on f6/d7, queen on c7. Aims for equality vs almost any white move order.",
    aliases: ["hedgehog", "hedgehog defense", "hedgehog system", "hedgehog setup"],
    targets: [
      { piece: "p", squares: ["a6"] },
      { piece: "p", squares: ["b6"] },
      { piece: "p", squares: ["d6"] },
      { piece: "p", squares: ["e6"] },
      { piece: "b", squares: ["b7"] },
      { piece: "b", squares: ["e7"] },
      { piece: "n", squares: ["f6"] },
      { piece: "q", squares: ["c7"] },
    ],
    minMatchCount: 6,
    sampleSan: [
      "c4", "c5",
      "Nf3", "Nf6",
      "Nc3", "e6",
      "g3", "b6",
      "Bg2", "Bb7",
      "O-O", "Be7",
      "d4", "cxd4",
      "Nxd4", "d6",
    ],
  },

  /* -------------------------------------------------------------------- */
  /* KING'S INDIAN SETUP (black) — fianchetto + ...e5 or ...c5 break     */
  /* Pawns d6/e7 or e5/g6, Bg7, Nf6, O-O.                                */
  /* -------------------------------------------------------------------- */
  {
    id: "kid-system",
    name: "King's Indian Setup",
    side: "black",
    description:
      "Fianchetto kingside and play …d6/…Nf6/…Bg7/…O-O. Flexible setup against 1.d4, 1.c4, 1.Nf3 and 1.g3 systems.",
    aliases: [
      "kings indian setup", "king's indian setup", "kid setup",
      "kid system", "kings indian system", "king's indian system",
    ],
    targets: [
      { piece: "p", squares: ["g6"] },
      { piece: "p", squares: ["d6"] },
      { piece: "b", squares: ["g7"] },
      { piece: "n", squares: ["f6"] },
      { piece: "k", squares: ["g8"] },
    ],
    minMatchCount: 4,
    sampleSan: [
      "d4", "Nf6",
      "c4", "g6",
      "Nc3", "Bg7",
      "e4", "d6",
      "Nf3", "O-O",
    ],
  },

  /* -------------------------------------------------------------------- */
  /* LONDON SYSTEM (white) — d4/Nf3/Bf4 vs anything                       */
  /* -------------------------------------------------------------------- */
  {
    id: "london",
    name: "London System",
    side: "white",
    description:
      "Quiet system for White: d4, Nf3, Bf4, e3, c3, Bd3. Plays vs any black response.",
    aliases: ["london system", "london", "london setup"],
    targets: [
      { piece: "p", squares: ["d4"] },
      { piece: "p", squares: ["e3"] },
      { piece: "p", squares: ["c3"] },
      { piece: "n", squares: ["f3"] },
      { piece: "b", squares: ["f4"] },
      { piece: "b", squares: ["d3"] },
    ],
    minMatchCount: 5,
    sampleSan: [
      "d4", "d5",
      "Nf3", "Nf6",
      "Bf4", "e6",
      "e3", "c5",
      "c3", "Nc6",
      "Bd3", "Bd6",
    ],
  },

  /* -------------------------------------------------------------------- */
  /* KING'S INDIAN ATTACK (white) — Nf3/g3/Bg2/d3/Nbd2/e4/O-O             */
  /* -------------------------------------------------------------------- */
  {
    id: "kia",
    name: "King's Indian Attack",
    side: "white",
    description:
      "White plays Nf3, g3, Bg2, d3, Nbd2, e4 and castles, regardless of Black's setup.",
    aliases: ["kia", "king's indian attack", "kings indian attack"],
    targets: [
      { piece: "n", squares: ["f3"] },
      { piece: "p", squares: ["g3"] },
      { piece: "b", squares: ["g2"] },
      { piece: "p", squares: ["d3"] },
      { piece: "p", squares: ["e4"] },
      { piece: "k", squares: ["g1"] },
    ],
    minMatchCount: 5,
    sampleSan: [
      "Nf3", "d5",
      "g3", "Nf6",
      "Bg2", "e6",
      "O-O", "Be7",
      "d3", "O-O",
      "Nbd2", "c5",
      "e4", "Nc6",
    ],
  },

  /* -------------------------------------------------------------------- */
  /* STONEWALL ATTACK (white) — d4/e3/f4/Bd3/Nf3                          */
  /* -------------------------------------------------------------------- */
  {
    id: "stonewall-attack",
    name: "Stonewall Attack",
    side: "white",
    description:
      "White builds a stonewall pawn formation: d4, e3, f4, Nf3, Bd3, plus c3 and Nbd2.",
    aliases: ["stonewall attack", "stonewall system"],
    targets: [
      { piece: "p", squares: ["d4"] },
      { piece: "p", squares: ["e3"] },
      { piece: "p", squares: ["f4"] },
      { piece: "p", squares: ["c3"] },
      { piece: "n", squares: ["f3"] },
      { piece: "b", squares: ["d3"] },
    ],
    minMatchCount: 5,
    sampleSan: [
      // Standard Stonewall Attack move order: push f4 BEFORE Nf3, since
      // a knight on f3 would block the pawn's path to f4.
      "d4", "d5",
      "e3", "Nf6",
      "Bd3", "c5",
      "c3", "Nc6",
      "f4", "e6",
      "Nf3", "Bd6",
      "Nbd2", "O-O",
    ],
  },

  /* -------------------------------------------------------------------- */
  /* PIRC / MODERN (black) — ...d6/...g6/...Bg7 vs 1.e4                  */
  /* -------------------------------------------------------------------- */
  {
    id: "pirc-modern",
    name: "Pirc / Modern Setup",
    side: "black",
    description:
      "Flexible black setup against 1.e4: …d6, …Nf6 or …g6, …Bg7, …O-O — playable vs any 1.e4 system.",
    aliases: ["pirc", "modern", "pirc modern", "modern defense setup", "pirc setup"],
    targets: [
      { piece: "p", squares: ["g6"] },
      { piece: "p", squares: ["d6"] },
      { piece: "b", squares: ["g7"] },
      { piece: "n", squares: ["f6"] },
    ],
    minMatchCount: 3,
    sampleSan: [
      "e4", "d6",
      "d4", "Nf6",
      "Nc3", "g6",
      "Nf3", "Bg7",
      "Be2", "O-O",
    ],
  },

  /* -------------------------------------------------------------------- */
  /* HIPPOPOTAMUS (black) — ...g6/...b6/...Nh6/...Nd7 fianchetti          */
  /* -------------------------------------------------------------------- */
  {
    id: "hippopotamus",
    name: "Hippopotamus Defense",
    side: "black",
    description:
      "Universal cramped setup for Black: pawns on a6/b6/d6/e6/g6/h6, bishops fianchettoed on b7/g7, knights on d7/e7.",
    aliases: ["hippopotamus", "hippo", "hippo defense"],
    targets: [
      { piece: "p", squares: ["a6"] },
      { piece: "p", squares: ["b6"] },
      { piece: "p", squares: ["d6"] },
      { piece: "p", squares: ["e6"] },
      { piece: "p", squares: ["g6"] },
      { piece: "p", squares: ["h6"] },
      { piece: "b", squares: ["b7"] },
      { piece: "b", squares: ["g7"] },
    ],
    minMatchCount: 6,
    sampleSan: [
      "e4", "g6",
      "d4", "Bg7",
      "Nf3", "d6",
      "Nc3", "e6",
      "Be2", "Ne7",
      "O-O", "b6",
    ],
  },
];

/** Lookup by id (kebab-case). */
export function getSetup(id: string): SetupTemplate | undefined {
  return SETUP_TEMPLATES.find((s) => s.id === id);
}

/** Resolve a free-text hint to a setup, lowercase + alias match. */
export function resolveSetup(hint: string): SetupTemplate | undefined {
  const q = hint.toLowerCase().replace(/[^a-z0-9 ]/g, " ").trim();
  for (const s of SETUP_TEMPLATES) {
    if (s.aliases.some((a) => q.includes(a))) return s;
    if (q.includes(s.name.toLowerCase())) return s;
  }
  return undefined;
}
