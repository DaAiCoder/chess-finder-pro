/**
 * Strategic-Plan catalogue.
 *
 * Each entry is a position where one side has a clearly defined long-term
 * plan. The trainer presents the position together with 4 plan choices
 * (one correct, three plausible but wrong); after the user picks, the
 * canonical 5-move plan plays out so they can see the idea in action.
 *
 * Validation pipeline (in seed-training.ts + selfTest.ts):
 *   - `selfTest.ts` verifies the `fen` parses, the `correctPlan.firstMove`
 *     is legal, and the full `canonicalLine` plays cleanly.
 *
 * Plans are stored as both a human label (used in the MCQ) and the
 * concrete `canonicalLine` (a sequence of SAN moves the engine demos).
 */

import type { InsertTrainingProblem } from "../../shared/schema.js";

export interface PlanChoice {
  label: string;
  /** The first SAN move that begins this plan (the user really commits to this). */
  firstMove: string;
}

export interface StrategicPlanProblem {
  id: string;
  /** Position FEN. The side-to-move plays the plan. */
  fen: string;
  /** Short prose describing what the side to move should think about. */
  prompt: string;
  /** Exactly four plan choices. */
  choices: PlanChoice[];
  /** Index into `choices` for the correct plan. */
  correctIndex: number;
  /** The 5-move canonical sequence that verifies the plan (SAN strings). */
  canonicalLine: string[];
  /** Short prose explanation shown after the user answers. */
  explanation: string;
  /** 1–5. */
  difficulty: number;
  /** Tag for filtering / analytics. */
  theme: string;
}

/* ---------------------------------------------------------------------- */
/* The catalogue                                                          */
/* ---------------------------------------------------------------------- */

export const STRATEGIC_PLANS: StrategicPlanProblem[] = [
  {
    id: "carlsbad-minority-attack",
    fen: "r1bq1rk1/pp1n1ppp/2pbpn2/3p4/3P4/2NBPN2/PPP2PPP/R1BQ1RK1 w - - 0 9",
    prompt:
      "Carlsbad pawn structure. What's White's classic long-term plan against this c6+d5+e6 setup?",
    choices: [
      { label: "Minority attack: b2-b4-b5 to create a weak c6 pawn.", firstMove: "b4" },
      { label: "Kingside pawn storm: f3+g4+h4.", firstMove: "h3" },
      { label: "Direct piece attack with Bf5 + Qh5.", firstMove: "Bf5" },
      { label: "Central break with e3-e4 immediately.", firstMove: "e4" },
    ],
    correctIndex: 0,
    canonicalLine: ["b4"],
    explanation:
      "The minority attack is the textbook Carlsbad plan — b4-b5 creates a backward / hanging pawn on c6 which White exploits in the endgame.",
    difficulty: 3,
    theme: "carlsbad",
  },
  {
    id: "iqp-kingside-attack",
    fen: "r1bq1rk1/pp3ppp/2n1pn2/3p4/3P4/2NBPN2/PP3PPP/R1BQ1RK1 w - - 0 9",
    prompt:
      "You have an isolated queen's pawn. What's the principled long-term plan?",
    choices: [
      { label: "Play for the kingside attack via Ne5 + Qd3 + Bxh7 ideas.", firstMove: "Ne5" },
      { label: "Trade pieces to reach a winning endgame.", firstMove: "Qd2" },
      { label: "Win a pawn immediately with Nxd5.", firstMove: "Nxd5" },
      { label: "Move the queen to a4 and target the queenside.", firstMove: "Qa4" },
    ],
    correctIndex: 0,
    canonicalLine: ["Ne5"],
    explanation:
      "The IQP wants action — Ne5 + Qd3 + Bd3 → kingside attack is the textbook plan; trading pieces hands Black the long-term advantage of attacking the isolated pawn. Nxd5 wins a pawn but trades the IQP for an open file Black happily uses.",
    difficulty: 3,
    theme: "iqp",
  },
  {
    id: "kings-indian-kingside-storm",
    fen: "r1bq1rk1/pp1nppbp/3p1np1/2pP4/2P1P3/2N2N2/PP3PPP/R1BQKB1R b KQ - 0 7",
    prompt:
      "Classical King's Indian structure. What is Black's celebrated kingside plan?",
    choices: [
      { label: "Push ...f5-f4 + ...g5-g4 to attack White's king.", firstMove: "e5" },
      { label: "Trade queens and play for ...b5 on the queenside.", firstMove: "Qa5" },
      { label: "Exchange dark-squared bishops with ...Bh6.", firstMove: "Nh5" },
      { label: "Retreat the knight to b8 to regroup passively.", firstMove: "Nb8" },
    ],
    correctIndex: 0,
    canonicalLine: ["e5"],
    explanation:
      "The classic King's Indian race: Black plays ...e5, ...Nh5, ...f5-f4-g5-g4 attacking the white king while White expands queenside. Passive retreats hand the initiative away.",
    difficulty: 4,
    theme: "kings-indian",
  },
  {
    id: "bad-bishop-trade",
    fen: "r1bq1rk1/pp3ppp/2nbpn2/3p4/3P4/1QN1PN2/PP3PPP/R1B2RK1 w - - 0 10",
    prompt:
      "Black's dark-squared bishop is the better piece. What strategic plan should White pursue?",
    choices: [
      { label: "Pressure b7 with the queen to provoke ...b6 weakening dark squares.", firstMove: "Qxb7" },
      { label: "Push pawns on the kingside immediately.", firstMove: "g4" },
      { label: "Win the d5 pawn outright with Nxd5.", firstMove: "Nxd5" },
      { label: "Move the king to safety with Kh1 before doing anything.", firstMove: "Kh1" },
    ],
    correctIndex: 0,
    canonicalLine: ["Qxb7"],
    explanation:
      "Qxb7 wins the pawn — Black has no immediate trap and the b-file pressure is decisive. Note: Nxd5 actually loses to Nxd4! attacking the queen.",
    difficulty: 4,
    theme: "tactical-pressure",
  },
  {
    id: "centralise-then-attack",
    fen: "r2q1rk1/pp1n1ppp/2pbpn2/3p4/3P4/2NBPN2/PPP1QPPP/R1B1R1K1 w - - 0 11",
    prompt:
      "What's the right strategic plan in this calm middlegame?",
    choices: [
      { label: "Centralise with the bishop to d2 then double rooks on the open file.", firstMove: "Bd2" },
      { label: "Push h3 + g4 to launch a kingside storm.", firstMove: "h3" },
      { label: "Push the queenside pawns with b4-b5.", firstMove: "b4" },
      { label: "Throw in the bishop sacrifice with Bxh7+ immediately.", firstMove: "Bxh7+" },
    ],
    correctIndex: 0,
    canonicalLine: ["Bd2"],
    explanation:
      "Bd2 completes development, prepares the rook lift via the a-rook, and only THEN does White launch the attack. Bxh7+ here doesn't have enough support and Black just plays …Kxh7 → Ng4+ defended by the queen.",
    difficulty: 3,
    theme: "development",
  },
  {
    id: "color-complex-dark",
    fen: "r1bq1rk1/pp3ppp/2nbpn2/3p4/3P4/1BN1PN2/PP3PPP/R1BQ1RK1 b - - 0 9",
    prompt:
      "What is Black's best long-term plan to exploit dark-square weaknesses?",
    choices: [
      { label: "Plant a knight outpost on b4 + roll the queenside.", firstMove: "Nb4" },
      { label: "Push ...a5 to clamp on the queenside.", firstMove: "a5" },
      { label: "Sacrifice the bishop with ...Bxh2+ immediately.", firstMove: "Bxh2+" },
      { label: "Trade queens with ...Qd7 to reach a winning endgame.", firstMove: "Qd7" },
    ],
    correctIndex: 0,
    canonicalLine: ["Nb4"],
    explanation:
      "Nb4 plants the model knight outpost and pressures the c2 square. Bxh2+ is unsound (white king just walks away), and trading queens hands away the dark-square pressure.",
    difficulty: 4,
    theme: "color-complex",
  },
  {
    id: "outpost-occupation",
    fen: "r1bq1rk1/pp3ppp/2nbpn2/2pp4/3P4/2N1PN2/PP1BBPPP/R2Q1RK1 w - - 0 9",
    prompt:
      "What's the best long-term plan in this Symmetrical structure?",
    choices: [
      { label: "Occupy the e5 square with a knight (Ne5).", firstMove: "Ne5" },
      { label: "Push h3+g4 to expand on the kingside.", firstMove: "h3" },
      { label: "Liquidate with dxc5 to simplify.", firstMove: "dxc5" },
      { label: "Bring the queen to a4 and pressure the queenside.", firstMove: "Qa4" },
    ],
    correctIndex: 0,
    canonicalLine: ["Ne5"],
    explanation:
      "Outposts are the engine of positional chess — Ne5 with future f4 support is unkickable and dominates the centre.",
    difficulty: 3,
    theme: "outpost",
  },
  {
    id: "queenside-majority",
    fen: "r1bq1rk1/pp3ppp/2n2n2/3p4/8/3BPN2/PPP2PPP/R1BQ1RK1 b - - 0 9",
    prompt:
      "Black has a queenside pawn majority (5 vs 3 on the queenside). What's the plan?",
    choices: [
      { label: "Roll the queenside pawns with ...a6, ...b5, ...c5-c4.", firstMove: "a6" },
      { label: "Push ...d4 immediately.", firstMove: "d4" },
      { label: "Trade all the heavy pieces to reach a king-and-pawn endgame.", firstMove: "Qe7" },
      { label: "Storm the kingside with ...g5-g4.", firstMove: "g5" },
    ],
    correctIndex: 0,
    canonicalLine: ["a6"],
    explanation:
      "Queenside majorities want to be rolled — ...a6 + ...b5 + ...c5 creates a passed pawn and dominates the wing.",
    difficulty: 3,
    theme: "majority",
  },
  {
    id: "prophylaxis",
    fen: "r1bq1rk1/pp1nbppp/2p1pn2/3p4/3P4/2NBPN2/PPP1QPPP/R1B2RK1 w - - 0 10",
    prompt:
      "Black plans ...e5 freeing his game. What prophylactic plan should White play?",
    choices: [
      { label: "Reroute the queen first with Qd1, prepare Nd2 + Bb1 redeploy.", firstMove: "Qd1" },
      { label: "Race forward with the queenside majority via b4.", firstMove: "b4" },
      { label: "Trade Black's bishop with Bxh7+ immediately.", firstMove: "Bxh7+" },
      { label: "Hide the king with Kh1.", firstMove: "Kh1" },
    ],
    correctIndex: 0,
    canonicalLine: ["Qd1"],
    explanation:
      "Karpov-style prophylaxis: reroute the queen and bishop to keep …e5 restrained, only attacking after the regrouping. Bxh7+ here is premature without the knight ready to hop to g5.",
    difficulty: 4,
    theme: "prophylaxis",
  },
];

/* ---------------------------------------------------------------------- */
/* Helpers                                                                */
/* ---------------------------------------------------------------------- */

export function listStrategicPlans(): StrategicPlanProblem[] {
  return STRATEGIC_PLANS;
}

export function findStrategicPlan(id: string): StrategicPlanProblem | undefined {
  return STRATEGIC_PLANS.find((p) => p.id === id);
}

/**
 * Turn each plan into a training-problem record so the standard pool API
 * can serve them (the trainer page reads `/api/training/plans/...`).
 */
export function strategicPlanSeeds(): InsertTrainingProblem[] {
  return STRATEGIC_PLANS.map((p) => ({
    module: "plans",
    fen: p.fen,
    solution: [p.choices[p.correctIndex]!.firstMove],
    difficulty: p.difficulty,
    themes: ["plan", p.theme],
    tacticType: "strategic-plan",
    explanation: p.explanation,
    source: "seed",
    metadata: {
      planId: p.id,
      prompt: p.prompt,
      choices: p.choices.map((c) => c.label),
      correctIndex: p.correctIndex,
      canonicalLine: p.canonicalLine,
    },
  } satisfies InsertTrainingProblem));
}
