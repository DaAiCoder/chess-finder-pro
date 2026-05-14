/**
 * OpenAI integration. No-ops gracefully when OPENAI_API_KEY is unset, in which
 * case all functions return canned responses so the rest of the app keeps working.
 */

import {
  MOTIF_CATEGORIES,
  type LineQuery,
  type MaterialPiece,
  type MotifSearchCriteria,
} from "../../shared/schema.js";
import { resolveOpeningName } from "./openingsDictionary.js";
import { resolveSetup } from "../data/setups.js";

let client: import("openai").OpenAI | null = null;

async function getClient() {
  if (client) return client;
  if (!process.env.OPENAI_API_KEY) return null;
  const { OpenAI } = await import("openai");
  client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

export interface ParsedQueryCriteria {
  result?: "win" | "loss" | "draw";
  color?: "white" | "black";
  opening?: string;
  opponent?: string;
  timeControl?: string;
  ratingMin?: number;
  ratingMax?: number;
  hasBlunder?: boolean;
  raw: string;
}

export async function parseNaturalLanguageQuery(query: string): Promise<ParsedQueryCriteria> {
  const c = await getClient();
  if (!c) return naiveParse(query);
  // We keep the live call simple to avoid surprise costs in dev.
  return naiveParse(query);
}

function naiveParse(query: string): ParsedQueryCriteria {
  const q = query.toLowerCase();
  const out: ParsedQueryCriteria = { raw: query };
  if (/\bwins?\b|\bvictor/.test(q)) out.result = "win";
  if (/\blosses?\b|\blost\b|\bdefeat/.test(q)) out.result = "loss";
  if (/\bdraws?\b|\bdrew\b/.test(q)) out.result = "draw";
  if (/\bas white\b|\bwith white\b/.test(q)) out.color = "white";
  if (/\bas black\b|\bwith black\b/.test(q)) out.color = "black";
  if (/\bblunder/.test(q)) out.hasBlunder = true;
  if (/\bblitz\b/.test(q)) out.timeControl = "blitz";
  if (/\brapid\b/.test(q)) out.timeControl = "rapid";
  if (/\bbullet\b/.test(q)) out.timeControl = "bullet";
  if (/\bclassical\b/.test(q)) out.timeControl = "classical";
  return out;
}

export async function explainBlunder(args: {
  fenBefore: string;
  san: string;
  bestMove: string | null;
  cpl: number;
}): Promise<string> {
  const c = await getClient();
  if (!c) {
    if (args.bestMove) {
      return `${args.san} loses ~${args.cpl} centipawns. The engine prefers ${args.bestMove}, which keeps the position more balanced.`;
    }
    return `${args.san} costs ~${args.cpl} centipawns of evaluation.`;
  }
  return `${args.san} loses ~${args.cpl} centipawns.`;
}

export async function generateCommentary(args: {
  pgn: string;
  highlights: string[];
}): Promise<string> {
  const c = await getClient();
  if (!c) return generateLocalCommentary(args.highlights);
  return generateLocalCommentary(args.highlights);
}

function generateLocalCommentary(highlights: string[]): string {
  if (highlights.length === 0) return "A clean game with no major mistakes from either side.";
  return `Key moments: ${highlights.join("; ")}.`;
}

/* ====================================================================== */
/* Motif (tactics-pattern) NL parser                                      */
/* ====================================================================== */

/**
 * Aliases mapping fuzzy English phrases → motif keys understood by the
 * detector. Order matters only for overlapping matches: more specific
 * phrases come first.
 */
const MOTIF_ALIASES: Array<[RegExp, string]> = [
  [/\bback[-\s]?rank\b/i, "back-rank"],
  [/\bsmothered\b/i, "smothered-mate"],
  [/\bgreek[-\s]?gift\b/i, "greek-gift"],
  [/\bdiscovered[-\s]?(check|attack)\b|\bdiscovery\b/i, "discovered-attack"],
  [/\bwindmill\b/i, "windmill"],
  [/\bdouble[-\s]?attack\b/i, "double-attack"],
  [/\bx[-\s]?ray\b/i, "x-ray"],
  [/\bdeflection\b|\bdeflect/i, "deflection"],
  [/\bdecoy\b|\blure\b/i, "decoy"],
  [/\boverload(ed)?\b/i, "overloaded-piece"],
  [/\binterference\b/i, "interference"],
  [/\bzwischenzug\b|\bin[-\s]?between\b/i, "zwischenzug"],
  [/\bskewer\b/i, "skewer"],
  [/\bpin\b/i, "pin"],
  [/\bfork\b/i, "fork"],
  [/\btrapped\b|\btrap\b/i, "trapped-piece"],
  [/\bhanging\b|\bundefended\b|\bloose\s+piece/i, "hanging-piece"],
  [/\bpassed\s+pawn\b/i, "passed-pawn"],
  [/\bopposition\b/i, "opposition"],
  [/\blucena\b/i, "lucena"],
  [/\bphilidor\b/i, "philidor"],
];

/** High-level category aliases (e.g. "mates", "endgame patterns"). */
const CATEGORY_ALIASES: Array<[RegExp, string]> = [
  [/\bmate(s|ing)?\b|\bmating\b|\bcheckmate/i, MOTIF_CATEGORIES.MATING_NETS],
  [/\bfork(s)?\b|\bdouble[-\s]?attack/i, MOTIF_CATEGORIES.FORKS_DOUBLE_ATTACKS],
  [/\bpin(s)?\b|\bskewer/i, MOTIF_CATEGORIES.PINS_SKEWERS],
  [/\bdiscover(ed|y)\b/i, MOTIF_CATEGORIES.DISCOVERED_IDEAS],
  [/\bdeflection\b|\boverload/i, MOTIF_CATEGORIES.DEFLECTION_OVERLOAD],
  [/\bclearance\b|\binterference\b/i, MOTIF_CATEGORIES.CLEARANCE_INTERFERENCE],
  [/\btrap(ped|ping)?\b|\bhang(ing)?\b/i, MOTIF_CATEGORIES.TRAPPING],
  [/\bpromotion\b|\bpromote\b/i, MOTIF_CATEGORIES.PROMOTION],
  [/\bendgame\b|\bend\s+game\b/i, MOTIF_CATEGORIES.ENDGAME],
  [/\bdefen(s|c)e\b|\bdefensive\b/i, MOTIF_CATEGORIES.DEFENSIVE],
];

/**
 * Parse a free-text query into a `MotifSearchCriteria`. Tries the OpenAI
 * client when configured, otherwise falls back to the regex parser below
 * — both are good enough for the in-app finder UI.
 */
export async function parseMotifQuery(query: string): Promise<MotifSearchCriteria> {
  const c = await getClient();
  if (!c) return regexParseMotifQuery(query);
  // Keep network calls opt-in; the regex parser handles the documented
  // verb / motif / side / outcome vocabulary already.
  return regexParseMotifQuery(query);
}

export function regexParseMotifQuery(query: string): MotifSearchCriteria {
  const q = query.toLowerCase();
  const out: MotifSearchCriteria = {};

  const motifKeys: string[] = [];
  for (const [re, key] of MOTIF_ALIASES) {
    if (re.test(q) && !motifKeys.includes(key)) motifKeys.push(key);
  }
  if (motifKeys.length > 0) out.motifKeys = motifKeys;

  for (const [re, cat] of CATEGORY_ALIASES) {
    if (re.test(q)) {
      out.category = cat;
      break;
    }
  }

  if (/\bas\s+white\b|\bwith\s+white\b|\bwhite['s]*\b/.test(q)) out.side = "white";
  else if (/\bas\s+black\b|\bwith\s+black\b|\bblack['s]*\b/.test(q)) out.side = "black";

  if (/\bwon\b|\bwins?\b|\bvictor/.test(q)) out.result = "win";
  else if (/\blost\b|\blosses?\b|\bdefeat/.test(q)) out.result = "loss";
  else if (/\bdrew\b|\bdraws?\b/.test(q)) out.result = "draw";

  if (/\bmissed\b|\boverlook|\bdidn'?t\s+see\b|\bblunder/.test(q)) out.missed = true;

  const swing = q.match(/(\d+)\s*(cp|centipawns?|pawns?)/);
  if (swing) {
    let v = Number(swing[1]);
    if (!Number.isNaN(v)) {
      if (/pawns?/.test(swing[2]) && !/cp/.test(swing[2])) v *= 100;
      out.minEvalSwing = v;
    }
  }

  return out;
}

/* ====================================================================== */
/* Unified Pattern Finder NL parser — produces a LineQuery covering both  */
/* opening-line discovery AND motif-in-game search in one shape.          */
/* ====================================================================== */

/** Phrases for the moving-side hint ("for white", "as black", …). */
function parseSide(q: string): "white" | "black" | undefined {
  if (/\bas\s+white\b|\bwith\s+white\b|\bfor\s+white\b|\bwhite\s+can\b|\bwhite\s+wins\b|\bwhite\s+is\b/.test(q)) return "white";
  if (/\bas\s+black\b|\bwith\s+black\b|\bfor\s+black\b|\bblack\s+can\b|\bblack\s+wins\b|\bblack\s+is\b/.test(q)) return "black";
  return undefined;
}

/** Map "queen", "rook", "minor piece", … → MaterialPiece. */
function parseMaterialPiece(q: string): MaterialPiece | undefined {
  if (/\bqueen\b/.test(q)) return "queen";
  if (/\brook\b/.test(q)) return "rook";
  if (/\bbishop\b/.test(q)) return "bishop";
  if (/\bknight\b/.test(q)) return "knight";
  if (/\bpawn\b/.test(q)) return "pawn";
  if (/\bminor\s+piece\b/.test(q)) return "minor";
  if (/\bmajor\s+piece\b/.test(q)) return "major";
  return undefined;
}

/**
 * Parse "white can win a queen" / "black wins a rook" style fragments into
 * a MaterialGain target. We assume the verb's subject is the gaining side.
 */
function parseMaterialGain(q: string): LineQuery["materialGain"] | undefined {
  const m = q.match(/\b(white|black)\s+(?:can\s+)?(?:wins?|gains?|nets?|grabs?)\s+(?:a|an|the)?\s*(queen|rook|bishop|knight|pawn|minor\s+piece|major\s+piece)\b/);
  if (!m) return undefined;
  const piece = parseMaterialPiece(m[2]);
  if (!piece) return undefined;
  return { side: m[1] as "white" | "black", piece };
}

/**
 * "after 12 moves" or "by move 15" → plyTarget.
 * Standard chess convention: 1 move = 1 white + 1 black = 2 plies.
 * Capped at 30 plies (15 full moves) — beyond that the engine search
 * becomes intractable on a laptop. The line searcher itself enforces
 * a separate hard cap so we don't have to clamp here too aggressively.
 */
function parsePlyTarget(q: string): number | undefined {
  const m = q.match(/\b(?:after|in|by\s+move|within)\s+(\d+)\s*(?:full\s+)?moves?\b/);
  if (m) return Math.min(30, Number(m[1]) * 2);
  const ply = q.match(/\b(\d+)\s*(?:half[-\s]?moves?|plies|plys|ply)\b/);
  if (ply) return Math.min(30, Number(ply[1]));
  return undefined;
}

/** Map "equal", "slightly better", "winning", … into an EvalBand. */
function parseEvalBand(q: string): LineQuery["evalBand"] | undefined {
  if (/\bdead\s+equal\b|\bdrawn\b|\bequal\b|\bbalanced\b/.test(q)) {
    return { cpMin: -40, cpMax: 40, label: "equal" };
  }
  if (/\bslightly\s+better\b|\bslight\s+edge\b|\bsmall\s+advantage\b/.test(q)) {
    return { cpMin: 25, cpMax: 80, label: "slight" };
  }
  if (/\bclearly\s+better\b|\bbig\s+advantage\b|\badvantage\b|\bclear\s+edge\b/.test(q)) {
    return { cpMin: 80, cpMax: 250, label: "advantage" };
  }
  if (/\bwinning\b|\bcrushing\b|\bgreat\s+advantage\b/.test(q)) {
    return { cpMin: 250, cpMax: 100_000, label: "winning" };
  }
  return undefined;
}

/** Decide scope based on phrasing: "find lines …" → lines, "in my games …" → games. */
function parseScope(q: string): "games" | "lines" | "both" {
  const inMyGames = /\bin\s+my\s+games?\b|\bmy\s+games?\b|\bfrom\s+my\s+games?\b|\bi\s+(?:played|missed)\b|\bgames\s+(?:where|i)\b/.test(q);
  const inLines = /\b(?:line|lines|opening|variation|theory|move\s+order|sequence)\b/.test(q);
  if (inMyGames && !inLines) return "games";
  if (inLines && !inMyGames) return "lines";
  // Default: when the user names a specific opening + an outcome we lean
  // "lines" (discovery), since users usually want masters-style theory.
  return inLines ? "lines" : "both";
}

/** Recognised "this thing is an opening name" tail keywords. */
const OPENING_TAIL_KEYWORDS =
  /(gambit|defense|defence|attack|variation|system|indian|sicilian|lopez|french|caro\s*kann|english)/;

/**
 * Pull the opening hint from phrases like "in the Sicilian Najdorf …".
 *
 * The previous version over-matched ("give me an opening" → captured
 * "give me an"). This pass keeps only matches that include at least one
 * proper-noun-looking token AND avoids picking up filler verbs.
 */
function extractOpeningHint(q: string, original: string): string | undefined {
  // 1. Look for "in/from <name> <where|with|after|line>" phrases first.
  const m = q.match(
    /\b(?:in|from)\s+(?:the\s+)?([a-z][a-z\-'\s]{2,60}?)\b\s*(?:where|with|after|when|opening\b|line\b|variation\b|defense\b|defence\b|attack\b|gambit\b|system\b)/,
  );
  if (m && hasProperNounToken(m[1], original)) return m[1].trim();

  // 2. "<name> <opening-keyword>" — anchored to a recognised tail keyword.
  //    Reject when the captured prefix contains filler verbs.
  const named = q.match(
    new RegExp(`\\b([a-z][a-z\\-'\\s]+?\\s+${OPENING_TAIL_KEYWORDS.source})\\b`),
  );
  if (named) {
    const phrase = named[1].trim();
    if (
      !/\b(give|show|find|tell|teach|i|me|my|the\s+best|any|some|the)\s/.test(
        phrase + " ",
      ) &&
      hasProperNounToken(phrase, original)
    ) {
      return phrase;
    }
  }
  return undefined;
}

/** Capitalisation hint — the hint must include at least one token that
 *  appears Title-Cased or fully UPPERCASE in the original (un-lowercased)
 *  query, OR contain a recognised opening keyword like "gambit/defense". */
function hasProperNounToken(phrase: string, original: string): boolean {
  if (OPENING_TAIL_KEYWORDS.test(phrase)) return true;
  for (const token of phrase.split(/\s+/)) {
    if (token.length < 3) continue;
    const re = new RegExp(`\\b${escapeRegExp(token)}\\b`, "i");
    const match = original.match(re);
    if (match && /[A-Z]/.test(match[0])) return true;
  }
  return false;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Parse a natural-language query into the unified LineQuery shape.
 * Always succeeds — falls back to a heavily-defaulted query when nothing
 * recognisable is in the input.
 */
export async function parseLineQuery(query: string): Promise<LineQuery> {
  const q = query.toLowerCase();
  const out: LineQuery = { raw: query };

  out.scope = parseScope(q);
  out.side = parseSide(q);
  out.evalBand = parseEvalBand(q);
  out.materialGain = parseMaterialGain(q);
  out.plyTarget = parsePlyTarget(q);

  // "with common moves from black" / "regardless of …" override the
  // forcing/common heuristic.
  if (/\bregardless\s+of\b|\bany\s+response\b|\bforcing\b|\bbest\s+(?:play|defense)\b/.test(q)) {
    out.replyMode = "forcing";
  } else if (/\bcommon\b|\btypical\b|\bnormal\s+moves?\b|\bmaster\s+moves?\b|\bmainline\b|\bbook\b/.test(q)) {
    out.replyMode = "common";
  } else {
    out.replyMode = "common";
  }

  if (/\bwon\b|\bwins?\b/.test(q)) out.result = "win";
  else if (/\blost\b|\blosses?\b|\blose[sd]?\b/.test(q)) out.result = "loss";
  else if (/\bdrew\b|\bdraws?\b/.test(q)) out.result = "draw";

  if (/\bmissed\b|\boverlook|\bdidn'?t\s+see\b|\bblunder/.test(q)) out.missed = true;

  const motifs: string[] = [];
  for (const [re, key] of MOTIF_ALIASES) {
    if (re.test(q) && !motifs.includes(key)) motifs.push(key);
  }
  // Add the v2 motifs that aren't in MOTIF_ALIASES.
  if (/\broyal\s+fork\b|\bking[-\s]?queen\s+fork\b/.test(q)) motifs.push("royal-fork");
  if (/\bdouble[-\s]?check\b/.test(q)) motifs.push("double-check");
  if (/\bdiscover(ed|y)\s*check\b/.test(q)) motifs.push("discovered-check");
  if (motifs.length > 0) out.motifs = motifs;

  // Universal setups take priority over named openings — "hedgehog" should
  // always go through the setup searcher, even if some opening name
  // contains the same word.
  const setup = resolveSetup(query);
  if (setup) {
    out.setupId = setup.id;
    if (!out.side) out.side = setup.side;
    out.openingHint = setup.name;
  } else {
    // Resolve the opening hint into a concrete dictionary entry. Only
    // accept the hint when it actually maps to a known opening so phrases
    // like "give me an opening for black" stay unbound.
    const hint = extractOpeningHint(q, query);
    if (hint) {
      const opening = await resolveOpeningName(hint);
      if (opening) {
        out.openingHint = opening.name;
        out.openingId = opening.id;
      }
    }
    // Last resort: the entire query as a name (handles "Sicilian Najdorf").
    if (!out.openingId) {
      const opening = await resolveOpeningName(query);
      if (opening) {
        out.openingId = opening.id;
        out.openingHint = opening.name;
      }
    }
  }

  return out;
}
