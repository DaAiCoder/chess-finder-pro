/**
 * Startup self-tests.
 *
 * Non-fatal sanity checks that run after seed-training completes. We log
 * findings but never abort the boot — the goal is to surface seed drift
 * (e.g. a checkmate-pattern problem whose solution doesn't actually
 * deliver mate) without breaking dev work-flows.
 *
 * Current checks:
 *   - All setup `sampleSan` lines parse start-to-finish as legal SAN.
 *   - Every opening dictionary entry's `prefixSan` reaches its cached FEN.
 *   - Every checkmate-pattern training problem actually mates after its
 *     stored solution.
 */

import { Chess } from "chess.js";
import { storage } from "./storage.js";
import { SETUP_TEMPLATES } from "./data/setups.js";
import { listOpenings } from "./services/openingsDictionary.js";

export async function runStartupSelfTests(): Promise<void> {
  const issues: string[] = [];

  /* Setups */
  for (const setup of SETUP_TEMPLATES) {
    const c = new Chess();
    for (const san of setup.sampleSan) {
      try {
        if (!c.move(san)) {
          issues.push(`setup ${setup.id}: illegal SAN "${san}"`);
          break;
        }
      } catch {
        issues.push(`setup ${setup.id}: bad SAN "${san}"`);
        break;
      }
    }
  }

  /* Openings dictionary */
  try {
    const openings = await listOpenings();
    for (const o of openings) {
      const c = new Chess();
      let ok = true;
      for (const san of o.prefixSan) {
        try {
          if (!c.move(san)) {
            ok = false;
            break;
          }
        } catch {
          ok = false;
          break;
        }
      }
      if (!ok) issues.push(`opening ${o.id}: bad prefixSan`);
    }
  } catch (err) {
    issues.push(`opening dictionary: ${(err as Error).message}`);
  }

  /* Checkmate-pattern training problems */
  try {
    const mates = await storage.listTrainingProblems({ module: "checkmate-patterns" });
    for (const p of mates) {
      try {
        const c = new Chess(p.fen);
        const solution = (p.solution ?? []) as string[];
        const first = solution[0];
        if (!first) {
          issues.push(`checkmate-patterns problem ${p.id}: empty solution`);
          continue;
        }
        c.move(first);
        if (!c.isCheckmate()) {
          issues.push(
            `checkmate-patterns problem ${p.id}: solution "${first}" does not mate`,
          );
        }
      } catch (err) {
        issues.push(
          `checkmate-patterns problem ${p.id}: ${(err as Error).message}`,
        );
      }
    }
  } catch (err) {
    issues.push(`checkmate-patterns load: ${(err as Error).message}`);
  }

  /* Blind-tactics dataset */
  try {
    const { listBlindTactics } = await import("./data/blindTactics.js");
    for (const t of listBlindTactics()) {
      try {
        const ch = new Chess(t.startFen);
        for (const san of t.playedMoves) {
          const mv = ch.move(san);
          if (!mv) throw new Error(`bad lead-up "${san}"`);
        }
        const mv = ch.move(t.solution);
        if (!mv) throw new Error(`bad solution "${t.solution}"`);
      } catch (err) {
        issues.push(`blind-tactics ${t.id}: ${(err as Error).message}`);
      }
    }
  } catch (err) {
    issues.push(`blind-tactics load: ${(err as Error).message}`);
  }

  /* Pawn-structure catalogue */
  try {
    const { PAWN_STRUCTURES } = await import("./data/pawnStructures.js");
    for (const s of PAWN_STRUCTURES) {
      try {
        new Chess(s.fen);
      } catch (err) {
        issues.push(`pawn-structure ${s.id} overview-fen: ${(err as Error).message}`);
      }
      s.drills.forEach((d, i) => {
        try {
          const c = new Chess(d.fen);
          const mv = c.move(d.solution);
          if (!mv) throw new Error(`illegal SAN "${d.solution}"`);
        } catch (err) {
          issues.push(`pawn-structure ${s.id} drill#${i}: ${(err as Error).message}`);
        }
      });
    }
  } catch (err) {
    issues.push(`pawn-structures load: ${(err as Error).message}`);
  }

  /* Strategic-plan catalogue */
  try {
    const { STRATEGIC_PLANS } = await import("./data/strategicPlans.js");
    for (const p of STRATEGIC_PLANS) {
      try {
        const c = new Chess(p.fen);
        p.choices.forEach((ch, i) => {
          const probe = new Chess(p.fen);
          const mv = probe.move(ch.firstMove);
          if (!mv) {
            issues.push(`plan ${p.id} choice#${i}: illegal SAN "${ch.firstMove}"`);
          }
        });
        for (const san of p.canonicalLine) {
          if (!c.move(san)) {
            issues.push(`plan ${p.id} canonicalLine: illegal SAN "${san}"`);
            break;
          }
        }
      } catch (err) {
        issues.push(`plan ${p.id}: ${(err as Error).message}`);
      }
    }
  } catch (err) {
    issues.push(`strategic-plans load: ${(err as Error).message}`);
  }

  /* Endgame-study catalogue */
  try {
    const { ENDGAME_STUDIES } = await import("./data/endgameStudies.js");
    for (const s of ENDGAME_STUDIES) {
      try {
        const c = new Chess(s.fen);
        for (const san of s.mainline) {
          if (!c.move(san)) {
            issues.push(`endgame-study ${s.id}: illegal SAN "${san}"`);
            break;
          }
        }
      } catch (err) {
        issues.push(`endgame-study ${s.id}: ${(err as Error).message}`);
      }
    }
  } catch (err) {
    issues.push(`endgame-studies load: ${(err as Error).message}`);
  }

  if (issues.length > 0) {
    console.warn(
      `[self-test] ${issues.length} issue(s) detected:\n  - ${issues
        .slice(0, 20)
        .join("\n  - ")}${issues.length > 20 ? `\n  - …+${issues.length - 20} more` : ""}`,
    );
  } else {
    console.log("[self-test] all checks passed");
  }
}
