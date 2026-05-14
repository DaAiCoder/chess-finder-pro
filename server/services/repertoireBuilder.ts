/**
 * Repertoire trainer — ingests a user-uploaded PGN into the tree of
 * `repertoire_nodes`. We now properly support RAV (Recursive Annotation
 * Variations): a parenthesized variation like `1. e4 e5 (1...c5)` walks
 * back one ply to its parent, plays the alternative branch, then
 * resumes the main line. The previous build linearised the move stream
 * via chess.js and silently dropped every variation; multi-line
 * preparations like a Lichess Studio export now ingest as a true tree.
 */

import { Chess } from "chess.js";
import { storage } from "../storage.js";
import type { Repertoire, RepertoireNode } from "../../shared/schema.js";

export async function ingestRepertoirePgn(
  rep: Repertoire,
  pgn: string,
): Promise<number> {
  const existing = await storage.listRepertoireNodes(rep.id);
  /** parentId → san → node id (for dedupe). */
  const index = new Map<string, number>();
  for (const n of existing) {
    index.set(`${n.parentId ?? "root"}:${n.san}`, n.id);
  }

  let createdCount = 0;
  const games = splitPgnIntoGames(pgn);
  for (const onePgn of games) {
    const movetext = stripPgnHeaders(onePgn);
    const tokens = tokenizeMovetext(movetext);
    if (tokens.length === 0) continue;
    const walker = new Chess();
    let parentId: number | null = null;
    /** Stack used to restore parentId + walker state when entering / leaving RAV. */
    const stack: { parentId: number | null; fen: string }[] = [];
    for (const tok of tokens) {
      if (tok === "(") {
        // Enter variation: push current state, then walk back one ply
        // (the parent of the line we just emitted).
        stack.push({ parentId, fen: walker.fen() });
        const node: NodeContext | null =
          parentId != null ? await getNode(parentId, index, existing) : null;
        const restoreFen = node?.parentFen ?? "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
        walker.load(restoreFen);
        parentId = node?.parentId ?? null;
        continue;
      }
      if (tok === ")") {
        const prev = stack.pop();
        if (prev) {
          walker.load(prev.fen);
          parentId = prev.parentId;
        }
        continue;
      }
      const mv = walker.move(tok);
      if (!mv) {
        // Malformed move inside this game — abort the rest, but keep
        // any nodes we've already created.
        break;
      }
      const key = `${parentId ?? "root"}:${mv.san}`;
      let nodeId = index.get(key);
      if (!nodeId) {
        const created = await storage.createRepertoireNode({
          repertoireId: rep.id,
          parentId,
          fen: walker.fen(),
          san: mv.san,
          comment: null,
        });
        nodeId = created.id;
        index.set(key, nodeId);
        existing.push(created);
        createdCount++;
      }
      parentId = nodeId;
    }
  }
  return createdCount;
}

interface NodeContext {
  parentFen: string;
  parentId: number | null;
}

async function getNode(
  id: number,
  _index: Map<string, number>,
  nodes: RepertoireNode[],
): Promise<NodeContext | null> {
  const node = nodes.find((n) => n.id === id);
  if (!node) return null;
  const parent = node.parentId == null ? null : nodes.find((n) => n.id === node.parentId);
  return {
    parentId: node.parentId,
    parentFen:
      parent?.fen ?? "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  };
}

/**
 * PGN header strip — everything before the first move number.
 */
function stripPgnHeaders(pgn: string): string {
  return pgn.replace(/^\s*(\[[^\]]*\]\s*)+/, "").trim();
}

/**
 * Tokenize PGN movetext into SAN moves and `(` / `)` markers. Drops
 * NAGs, comments (`{...}`), move numbers, and result tokens.
 */
function tokenizeMovetext(movetext: string): string[] {
  let txt = movetext;
  // Remove block comments.
  txt = txt.replace(/\{[^}]*\}/g, " ");
  // Remove NAGs like `$3`.
  txt = txt.replace(/\$\d+/g, " ");
  const out: string[] = [];
  let i = 0;
  while (i < txt.length) {
    const c = txt[i]!;
    if (c === "(" || c === ")") {
      out.push(c);
      i++;
      continue;
    }
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    // Read a non-whitespace token.
    let j = i;
    while (j < txt.length && !/[\s()]/.test(txt[j]!)) j++;
    const tok = txt.slice(i, j);
    i = j;
    if (!tok) continue;
    // Skip move numbers ("1.", "1...", "12.").
    if (/^\d+\.+$/.test(tok)) continue;
    // Skip standalone numbers ("1", "12").
    if (/^\d+$/.test(tok)) continue;
    // Skip result markers.
    if (tok === "1-0" || tok === "0-1" || tok === "1/2-1/2" || tok === "*") {
      continue;
    }
    // Strip trailing annotation marks ("!", "?", "!?", "?!", "!!", "??").
    const cleaned = tok.replace(/[!?]+$/g, "");
    if (cleaned) out.push(cleaned);
  }
  return out;
}

/** Splits a multi-game PGN payload into individual game strings. */
function splitPgnIntoGames(pgn: string): string[] {
  const trimmed = pgn.trim();
  if (!trimmed) return [];
  // A new game begins at a line that looks like `[Event ...`.
  const parts = trimmed.split(/\n(?=\[Event )/g);
  return parts.length > 0 ? parts : [trimmed];
}

/**
 * Walks a repertoire tree from a starting FEN and returns the expected
 * SAN move at that node (if any). Used by the drill mode to evaluate
 * the user's input.
 */
export async function nextExpectedMove(
  repertoireId: number,
  fen: string,
): Promise<RepertoireNode | null> {
  const nodes = await storage.listRepertoireNodes(repertoireId);
  // The "expected" move is the one whose PARENT has the given FEN, which
  // we look up indirectly by matching fenBefore of every node. Since we
  // don't store fenBefore, we instead match: a node where the parent's
  // fen == requested fen, OR (for root) parentId == null and FEN is the
  // start position.
  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  for (const n of nodes) {
    const parent = n.parentId == null ? null : byId.get(n.parentId);
    const parentFen = parent?.fen ?? "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    if (parentFen === fen) return n;
  }
  return null;
}
