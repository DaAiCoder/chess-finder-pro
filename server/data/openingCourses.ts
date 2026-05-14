/**
 * Curated opening repertoire courses (Chessreps-style).
 *
 * Each course consists of independent lines. A "line" is a list of SAN moves
 * starting from the standard initial position. Odd-indexed entries are the
 * **opponent's** moves; even-indexed entries are the **trainer's** moves
 * (white-color courses) — we infer this from `course.color` and the move
 * index in the trainer page so the user only ever has to play their side.
 *
 * Lines may share a common prefix; the catalog UI surfaces them as separate
 * "branches" (e.g. "Italian Game — Rook Gambit", "Italian Game — Pinning
 * Pressure"), exactly like Chessreps does.
 *
 * Move format: standard SAN as produced by chess.js (`O-O`, `Nxe4`, `cxd4`,
 * `e4`, `Bb4+`, `Qxa1#`).
 */

export interface CourseLineMove {
  san: string;
  /** Optional commentary shown in the trainer's callout box after this move. */
  comment?: string;
}

export interface CourseLine {
  id: string;
  name: string;
  /** Final commentary shown when the line ends. */
  finalComment?: string;
  moves: CourseLineMove[];
}

export interface OpeningCourse {
  slug: string;
  name: string;
  color: "white" | "black";
  description: string;
  /** Friendly short tagline shown on the catalog card. */
  tagline?: string;
  lines: CourseLine[];
}

export const OPENING_COURSES: OpeningCourse[] = [
  /* -------------------------------------------------------------------- */
  /*  Italian Game (white)                                                 */
  /* -------------------------------------------------------------------- */
  {
    slug: "italian-game",
    name: "Italian Game",
    color: "white",
    tagline: "One-a spicy-a meatball-a!",
    description:
      "By far the most played opening at the non-professional level. Old school, principled, and full of tactical fireworks if your opponent strays.",
    lines: [
      {
        id: "italian-rook-gambit",
        name: "Rook Gambit (Greedy 9...Bxc3)",
        finalComment:
          "Up a knight after Black gobbled the rook on a1. That's what they get for trying to get rich quick.",
        moves: [
          { san: "e4", comment: "King pawn — claim the center." },
          { san: "e5" },
          {
            san: "Nf3",
            comment: "Develop and attack the e5 pawn.",
          },
          { san: "Nc6" },
          {
            san: "Bc4",
            comment: "The Italian bishop, eyeing the f7 weak point.",
          },
          { san: "Bc5" },
          {
            san: "c3",
            comment: "Prepare d4 to blow the center open.",
          },
          { san: "Nf6" },
          {
            san: "d4",
            comment: "Hit the bishop and grab the center.",
          },
          { san: "exd4" },
          {
            san: "cxd4",
            comment: "Recapture with the pawn — keep hitting the bishop.",
          },
          { san: "Bb4+" },
          {
            san: "Nc3",
            comment: "Develop with tempo, blocking the check.",
          },
          { san: "Nxe4" },
          {
            san: "O-O",
            comment:
              "Ignore the pawn and the threats — castle into the attack.",
          },
          { san: "Nxc3" },
          { san: "bxc3", comment: "Recapture and open the b-file." },
          { san: "Bxc3" },
          {
            san: "Ba3",
            comment:
              "Sacrifice the rook! Block Black from castling. They're going to take the bait.",
          },
          { san: "Bxa1" },
          { san: "Re1+", comment: "Check — Black has to block." },
          { san: "Ne7" },
          { san: "Bxe7", comment: "Win the knight." },
          { san: "Qxe7" },
          { san: "Rxe7+" },
          { san: "Kxe7" },
          {
            san: "Qxa1",
            comment:
              "All the way back. We end up a clean knight ahead with a safe king.",
          },
        ],
      },
      {
        id: "italian-pinning-pressure",
        name: "Pinning Pressure (10...d6)",
        finalComment:
          "Up a piece after the queen swing to a5. Black's pieces were all hanging.",
        moves: [
          { san: "e4" },
          { san: "e5" },
          { san: "Nf3" },
          { san: "Nc6" },
          { san: "Bc4" },
          { san: "Bc5" },
          { san: "c3" },
          { san: "Nf6" },
          { san: "d4" },
          { san: "exd4" },
          { san: "cxd4" },
          { san: "Bb4+" },
          { san: "Nc3" },
          { san: "Nxe4" },
          { san: "O-O" },
          { san: "Nxc3" },
          { san: "bxc3" },
          { san: "d6", comment: "Black declines the rook and blocks the bishop." },
          {
            san: "Rb1",
            comment:
              "Slide the rook over to put pressure on the b-file and prepare Qa4.",
          },
          { san: "Ba5" },
          {
            san: "Qa4",
            comment:
              "Hit the bishop AND pin the knight to the king. Beautiful.",
          },
          { san: "O-O" },
          {
            san: "d5",
            comment:
              "Kick the knight. The only defender of the bishop is leaving.",
          },
          { san: "Ne5" },
          {
            san: "Nxe5",
            comment: "Eliminate the defender first — careful move order.",
          },
          { san: "dxe5" },
          { san: "Qxa5", comment: "Now collect the bishop. Up a piece." },
        ],
      },
      {
        id: "italian-bb6-pawn-phalanx",
        name: "Pawn Phalanx (6...Bb6 retreat)",
        finalComment:
          "Black's pieces are stuck on the rim and our pawns are crushing the center.",
        moves: [
          { san: "e4" },
          { san: "e5" },
          { san: "Nf3" },
          { san: "Nc6" },
          { san: "Bc4" },
          { san: "Bc5" },
          { san: "c3" },
          { san: "Nf6" },
          { san: "d4" },
          { san: "exd4" },
          { san: "cxd4" },
          {
            san: "Bb6",
            comment:
              "Retreat instead of check — gives us a free hand to push pawns.",
          },
          {
            san: "e5",
            comment: "Boot the knight forward.",
          },
          { san: "Ng4" },
          { san: "h3", comment: "Force the knight to the rim." },
          { san: "Nh6" },
          {
            san: "d5",
            comment: "Now hit the OTHER knight. Knights on the rim are dim.",
          },
          { san: "Na5" },
          {
            san: "Bg5",
            comment: "Hit the queen with tempo.",
          },
        ],
      },
      {
        id: "italian-queens-assault",
        name: "Queen's Assault (3...Nf6 4...Nxe4)",
        finalComment: "Simply up a piece. Punish the early ...Nxe4.",
        moves: [
          { san: "e4" },
          { san: "e5" },
          { san: "Nf3" },
          { san: "Nc6" },
          { san: "Bc4" },
          { san: "Nf6", comment: "Two Knights Defense." },
          {
            san: "d4",
            comment: "Aggressive central break.",
          },
          { san: "Nxe4" },
          {
            san: "dxe5",
            comment: "Open the d-file for the queen.",
          },
          { san: "Bc5" },
          {
            san: "Qd5",
            comment:
              "Threatens mate on f7 AND attacks the e4 knight. Two birds.",
          },
          { san: "Bxf2+" },
          { san: "Kf1", comment: "Walk it off — we're winning material." },
          { san: "O-O" },
          {
            san: "Qxe4",
            comment: "Pick up the knight. Up a piece.",
          },
        ],
      },
      {
        id: "italian-giuoco-pianissimo",
        name: "Giuoco Pianissimo (slow build)",
        finalComment:
          "Quiet Italian — small space edge, no fireworks yet. Next: a4–b4 or central expansion.",
        moves: [
          { san: "e4" },
          { san: "e5" },
          { san: "Nf3" },
          { san: "Nc6" },
          { san: "Bc4" },
          { san: "Bc5" },
          {
            san: "d3",
            comment: "The Pianissimo — keep tension, castle, then expand.",
          },
          { san: "Nf6" },
          { san: "Nc3" },
          { san: "d6" },
          { san: "O-O" },
          { san: "O-O" },
          {
            san: "h3",
            comment: "Luft and stop ...Bg4 pins before Nd5 ideas.",
          },
          { san: "a6" },
          {
            san: "a4",
            comment: "Clamp queenside — prepare b4 or Be3 reroutes.",
          },
        ],
      },
    ],
  },

  /* -------------------------------------------------------------------- */
  /*  Ruy Lopez (white)                                                    */
  /* -------------------------------------------------------------------- */
  {
    slug: "ruy-lopez",
    name: "Ruy Lopez",
    color: "white",
    tagline: "The most solid opening on this site.",
    description:
      "The Spanish Game. If you want to win classical chess games for the next 30 years, click here.",
    lines: [
      {
        id: "ruy-morphy-mainline",
        name: "Morphy Defense — Closed Spanish",
        finalComment:
          "Classical closed Ruy Lopez middlegame. Slowly squeeze with c3, d4, Re1.",
        moves: [
          { san: "e4" },
          { san: "e5" },
          { san: "Nf3" },
          { san: "Nc6" },
          {
            san: "Bb5",
            comment: "The Spanish bishop pins the knight to the king.",
          },
          { san: "a6" },
          {
            san: "Ba4",
            comment:
              "Hold the diagonal — don't trade off, the bishop is too strong.",
          },
          { san: "Nf6" },
          {
            san: "O-O",
            comment: "Castle. Don't fear ...Nxe4.",
          },
          { san: "Be7" },
          {
            san: "Re1",
            comment: "Defend e4 indirectly via the rook.",
          },
          { san: "b5" },
          {
            san: "Bb3",
            comment: "Tuck back to the dream diagonal.",
          },
          { san: "d6" },
          {
            san: "c3",
            comment: "Prepare d4. The classical Ruy break.",
          },
          { san: "O-O" },
          {
            san: "h3",
            comment: "Make luft and prevent ...Bg4 pin. Now d4 is coming.",
          },
        ],
      },
      {
        id: "ruy-exchange",
        name: "Exchange Variation (4.Bxc6)",
        finalComment:
          "Doubled c-pawns for Black, two bishops for nobody. We aim for a clean endgame edge.",
        moves: [
          { san: "e4" },
          { san: "e5" },
          { san: "Nf3" },
          { san: "Nc6" },
          { san: "Bb5" },
          { san: "a6" },
          {
            san: "Bxc6",
            comment:
              "The Exchange — double Black's pawns and head for an endgame.",
          },
          { san: "dxc6" },
          {
            san: "O-O",
            comment: "Don't grab e5 yet — Black has ...Qd4.",
          },
          { san: "f6" },
          {
            san: "d4",
            comment: "Open lines. Our pawn structure is healthier long-term.",
          },
        ],
      },
      {
        id: "ruy-berlin",
        name: "Berlin Defense (3...Nf6)",
        finalComment:
          "Berlin Wall endgame — symmetrical but White keeps a small structural plus.",
        moves: [
          { san: "e4" },
          { san: "e5" },
          { san: "Nf3" },
          { san: "Nc6" },
          { san: "Bb5" },
          {
            san: "Nf6",
            comment: "Berlin Defense — Kramnik's anti-Kasparov weapon.",
          },
          {
            san: "O-O",
            comment: "Castle into it — the main move.",
          },
          { san: "Nxe4" },
          {
            san: "d4",
            comment: "Open lines fast.",
          },
          { san: "Nd6" },
          { san: "Bxc6" },
          { san: "dxc6" },
          {
            san: "dxe5",
            comment: "Win the queens off and head to the famous endgame.",
          },
          { san: "Nf5" },
          {
            san: "Qxd8+",
            comment: "Trade queens — the Berlin Wall is here.",
          },
        ],
      },
      {
        id: "ruy-open-defense",
        name: "Open Defense (5...Nxe4)",
        finalComment:
          "Open Spanish tabiya — White recovers the e-pawn and keeps long-term pressure.",
        moves: [
          { san: "e4" },
          { san: "e5" },
          { san: "Nf3" },
          { san: "Nc6" },
          { san: "Bb5" },
          {
            san: "Nf6",
            comment: "Open Defense — the knight eyes e4 immediately.",
          },
          { san: "O-O" },
          {
            san: "Nxe4",
            comment: "Grab the pawn. White has full compensation.",
          },
          { san: "Re1" },
          {
            san: "Nd6",
            comment: "The knight hops out of the pin.",
          },
          {
            san: "Nxe5",
            comment: "Win the e-pawn back — the e-file stays hot.",
          },
        ],
      },
    ],
  },

  /* -------------------------------------------------------------------- */
  /*  London System (white)                                                */
  /* -------------------------------------------------------------------- */
  {
    slug: "london",
    name: "London System",
    color: "white",
    tagline: "If you click this, you'll make enemies.",
    description:
      "Solid pyramid setup. Bf4, e3, Nf3, c3, Bd3, Nbd2 — same moves every game, opponents hate you.",
    lines: [
      {
        id: "london-vs-d5",
        name: "Main line vs 1...d5",
        finalComment:
          "Pyramid set up. Kingside attack with Ne5 and h4 next.",
        moves: [
          { san: "d4" },
          { san: "d5" },
          {
            san: "Bf4",
            comment: "The London bishop. Out before locking it in with e3.",
          },
          { san: "Nf6" },
          { san: "e3", comment: "Cement the bishop." },
          { san: "e6" },
          { san: "Nf3" },
          { san: "Bd6" },
          {
            san: "Bg3",
            comment: "Side-step — keep the bishop alive.",
          },
          { san: "O-O" },
          { san: "Bd3" },
          { san: "b6" },
          { san: "Nbd2", comment: "Develop. Always Nbd2 in the London." },
          { san: "Bb7" },
          {
            san: "Ne5",
            comment: "Plant the knight on e5 — kingside attack incoming.",
          },
        ],
      },
      {
        id: "london-vs-kid",
        name: "vs King's Indian setup",
        finalComment:
          "Solid pyramid intact even against ...g6. We'll castle long for an attack.",
        moves: [
          { san: "d4" },
          { san: "Nf6" },
          { san: "Bf4" },
          { san: "g6" },
          {
            san: "Nc3",
            comment: "Switch to the Jobava-style — punish the fianchetto.",
          },
          { san: "Bg7" },
          { san: "e3" },
          { san: "O-O" },
          { san: "h4", comment: "Launch pawns at the kingside." },
        ],
      },
      {
        id: "london-vs-kings-indian-attack",
        name: "vs ...c5 (Anti-London)",
        finalComment:
          "Symmetrical structure. Look for c4 break later or kingside expansion.",
        moves: [
          { san: "d4" },
          { san: "Nf6" },
          { san: "Bf4" },
          { san: "c5" },
          {
            san: "e3",
            comment: "Don't take — keep the structure.",
          },
          { san: "Nc6" },
          { san: "Nf3" },
          { san: "cxd4" },
          {
            san: "exd4",
            comment: "Recapture with the pawn — open lines for the bishop.",
          },
        ],
      },
    ],
  },

  /* -------------------------------------------------------------------- */
  /*  Vienna Gambit (white)                                                */
  /* -------------------------------------------------------------------- */
  {
    slug: "vienna-gambit",
    name: "Vienna Gambit",
    color: "white",
    tagline: "Sacrifice on move 3. Win it back on move 6.",
    description:
      "Sucker-punch the casual e5 player. The Vienna Gambit launches an early f4 and brutal kingside attack.",
    lines: [
      {
        id: "vienna-main-trap",
        name: "Main Trap (3...exf4)",
        finalComment:
          "Crushing attack — the bishop and knight on f7 will be lethal.",
        moves: [
          { san: "e4" },
          { san: "e5" },
          {
            san: "Nc3",
            comment: "Develop the knight — Vienna Game.",
          },
          { san: "Nf6" },
          {
            san: "f4",
            comment: "The Vienna Gambit! Hit e5 with a pawn.",
          },
          { san: "exf4" },
          {
            san: "e5",
            comment: "Drive the knight away — more space.",
          },
          { san: "Ng8" },
          {
            san: "Nf3",
            comment: "Develop with tempo against the f4 pawn.",
          },
          { san: "d6" },
          {
            san: "d4",
            comment: "Build a massive pawn center.",
          },
          { san: "dxe5" },
          {
            san: "Nxe5",
            comment:
              "Recapture with the knight — superior outpost and direct attack on f7.",
          },
        ],
      },
      {
        id: "vienna-d6-decline",
        name: "Quiet decline (3...d6)",
        finalComment:
          "Comfortable plus — better center, easier development, kingside attack on the way.",
        moves: [
          { san: "e4" },
          { san: "e5" },
          { san: "Nc3" },
          { san: "Nf6" },
          { san: "f4" },
          {
            san: "d6",
            comment: "Black declines and locks the center.",
          },
          { san: "Nf3" },
          { san: "Nc6" },
          {
            san: "Bb5",
            comment: "Pressure the knight, head toward Bxc6 doubling pawns.",
          },
        ],
      },
    ],
  },

  /* -------------------------------------------------------------------- */
  /*  Queen's Gambit Accepted (white)                                      */
  /* -------------------------------------------------------------------- */
  {
    slug: "queens-gambit-accepted",
    name: "Queen's Gambit Accepted",
    color: "white",
    tagline: "They take? You win.",
    description:
      "When Black grabs the c4 pawn, you get the center, faster development, and a long-term initiative.",
    lines: [
      {
        id: "qga-mainline",
        name: "Main line (3.e3 holding c4)",
        finalComment:
          "Classical isolated-queen's-pawn middlegame — good piece play, attacking chances on the kingside.",
        moves: [
          { san: "d4" },
          { san: "d5" },
          { san: "c4" },
          {
            san: "dxc4",
            comment: "Black accepts — now we recover the pawn at our leisure.",
          },
          {
            san: "e3",
            comment: "Prepare Bxc4 cleanly.",
          },
          { san: "Nf6" },
          { san: "Bxc4", comment: "Bishop takes the pawn back." },
          { san: "e6" },
          {
            san: "Nf3",
            comment: "Standard development.",
          },
          { san: "c5" },
          { san: "O-O" },
          { san: "a6" },
          {
            san: "Qe2",
            comment: "Connect rooks, prepare e4 / Rd1.",
          },
        ],
      },
      {
        id: "qga-greedy-b5",
        name: "Greedy ...b5 trap",
        finalComment: "Up a rook — the classic QGA trap.",
        moves: [
          { san: "d4" },
          { san: "d5" },
          { san: "c4" },
          { san: "dxc4" },
          { san: "e4" },
          {
            san: "b5",
            comment: "Black tries to hold the pawn permanently.",
          },
          {
            san: "a4",
            comment: "Undermine the chain.",
          },
          { san: "c6" },
          { san: "axb5" },
          { san: "cxb5" },
          {
            san: "Qf3",
            comment: "Hit the rook on a8 AND the b5 pawn.",
          },
        ],
      },
    ],
  },

  /* -------------------------------------------------------------------- */
  /*  Caro-Kann (black)                                                    */
  /* -------------------------------------------------------------------- */
  {
    slug: "caro-kann",
    name: "Caro-Kann",
    color: "black",
    tagline: "Solid like the Sicilian, but without the headaches.",
    description:
      "Fight back against 1.e4 with 1...c6. Solid pawn structure, easy plans, no early disasters.",
    lines: [
      {
        id: "caro-mainline-classical",
        name: "Classical Variation (4...Bf5)",
        finalComment:
          "Solid Caro structure — light-squared bishop is outside the pawn chain. Aim for ...e6, ...Nd7, ...Ngf6, ...Be7, O-O.",
        moves: [
          { san: "e4" },
          {
            san: "c6",
            comment: "Caro-Kann. Prepare to challenge the center with ...d5.",
          },
          { san: "d4" },
          { san: "d5" },
          { san: "Nc3" },
          { san: "dxe4" },
          { san: "Nxe4" },
          {
            san: "Bf5",
            comment:
              "Develop the light-squared bishop OUTSIDE the chain — the whole point of the Caro.",
          },
          { san: "Ng3" },
          { san: "Bg6" },
          { san: "h4" },
          {
            san: "h6",
            comment: "Make luft so the bishop has h7.",
          },
          { san: "Nf3" },
          { san: "Nd7" },
          { san: "h5" },
          { san: "Bh7" },
        ],
      },
      {
        id: "caro-advance",
        name: "Advance Variation (3.e5)",
        finalComment:
          "Active piece play — bishop is outside the chain, knight headed to f5 or d5.",
        moves: [
          { san: "e4" },
          { san: "c6" },
          { san: "d4" },
          { san: "d5" },
          {
            san: "e5",
            comment: "White locks the center.",
          },
          {
            san: "Bf5",
            comment: "Get the bishop out before ...e6 traps it.",
          },
          { san: "Nf3" },
          {
            san: "e6",
            comment: "Now build the chain.",
          },
          { san: "Be2" },
          { san: "c5", comment: "Counter-attack the base of the chain." },
          { san: "Be3" },
          { san: "Nc6" },
        ],
      },
      {
        id: "caro-exchange",
        name: "Exchange Variation (3.exd5)",
        finalComment:
          "Symmetrical Caro — easy development, no opening problems.",
        moves: [
          { san: "e4" },
          { san: "c6" },
          { san: "d4" },
          { san: "d5" },
          {
            san: "exd5",
            comment:
              "White trades — Caro-Kann becomes very symmetrical and easy.",
          },
          { san: "cxd5" },
          { san: "Bd3" },
          { san: "Nc6" },
          { san: "c3" },
          { san: "Nf6" },
        ],
      },
      {
        id: "caro-two-knights",
        name: "Two Knights vs Caro (2.Nf3 d5 3.Nc3)",
        finalComment:
          "We've sidestepped White's prep — a typical Caro structure with extra options.",
        moves: [
          { san: "e4" },
          { san: "c6" },
          { san: "Nf3" },
          { san: "d5" },
          { san: "Nc3" },
          {
            san: "Bg4",
            comment:
              "Pin the knight before they can do anything aggressive.",
          },
          { san: "h3" },
          { san: "Bxf3" },
          { san: "Qxf3" },
          { san: "Nf6" },
        ],
      },
    ],
  },

  /* -------------------------------------------------------------------- */
  /*  French Defense (black)                                               */
  /* -------------------------------------------------------------------- */
  {
    slug: "french-defense",
    name: "French Defense",
    color: "black",
    tagline: "Lock the bishop in jail. Win anyway.",
    description:
      "1...e6 — solid, structural, full of long-term plans. White either pushes e5 (Advance) or takes (Exchange) — both are fine.",
    lines: [
      {
        id: "french-classical",
        name: "Classical (4.e5 Nfd7)",
        finalComment:
          "Classic French middlegame — close the position, attack the d4 pawn, eventually open with ...f6.",
        moves: [
          { san: "e4" },
          { san: "e6", comment: "French Defense." },
          { san: "d4" },
          { san: "d5" },
          { san: "Nc3" },
          { san: "Nf6" },
          { san: "e5" },
          { san: "Nfd7", comment: "Move the knight, plan ...c5 break." },
          { san: "f4" },
          { san: "c5", comment: "Counter the chain immediately." },
          { san: "Nf3" },
          { san: "Nc6" },
          { san: "Be3" },
          { san: "Be7" },
        ],
      },
      {
        id: "french-winawer",
        name: "Winawer (3...Bb4)",
        finalComment:
          "Black's bishop pair vs White's center — sharp, double-edged play.",
        moves: [
          { san: "e4" },
          { san: "e6" },
          { san: "d4" },
          { san: "d5" },
          { san: "Nc3" },
          {
            san: "Bb4",
            comment: "Pin the knight — Winawer Variation.",
          },
          { san: "e5" },
          { san: "c5", comment: "Hit the chain." },
          { san: "a3" },
          { san: "Bxc3+" },
          { san: "bxc3" },
          { san: "Ne7" },
        ],
      },
      {
        id: "french-advance",
        name: "Advance Variation (3.e5)",
        finalComment:
          "Standard French Advance — break with ...f6 in the middlegame.",
        moves: [
          { san: "e4" },
          { san: "e6" },
          { san: "d4" },
          { san: "d5" },
          {
            san: "e5",
            comment: "Locked center — French Advance.",
          },
          { san: "c5", comment: "Counter the chain." },
          { san: "c3" },
          { san: "Nc6" },
          { san: "Nf3" },
          { san: "Qb6", comment: "Hit b2 and pressure the d4 pawn." },
        ],
      },
    ],
  },

  /* -------------------------------------------------------------------- */
  /*  Sicilian Najdorf (black)                                             */
  /* -------------------------------------------------------------------- */
  {
    slug: "sicilian-najdorf",
    name: "Sicilian Najdorf",
    color: "black",
    tagline: "The Rolls-Royce of openings.",
    description:
      "The most respected response to 1.e4 ever played. Sharp, principled, used by Fischer, Kasparov, Carlsen.",
    lines: [
      {
        id: "najdorf-english-attack",
        name: "English Attack (6.Be3 e5)",
        finalComment:
          "Najdorf English Attack — opposite-side castling race incoming.",
        moves: [
          { san: "e4" },
          { san: "c5", comment: "Sicilian Defense." },
          { san: "Nf3" },
          { san: "d6" },
          { san: "d4" },
          { san: "cxd4" },
          { san: "Nxd4" },
          { san: "Nf6" },
          { san: "Nc3" },
          {
            san: "a6",
            comment:
              "The Najdorf move. Prevent Nb5 and prepare ...e5 / ...b5.",
          },
          { san: "Be3" },
          { san: "e5", comment: "Hit the knight, claim space." },
          { san: "Nb3" },
          { san: "Be6" },
          { san: "f3", comment: "Prepare g4 / O-O-O." },
          { san: "Nbd7" },
        ],
      },
      {
        id: "najdorf-bg5",
        name: "Main line 6.Bg5",
        finalComment:
          "Poisoned pawn or main line — full theoretical battle.",
        moves: [
          { san: "e4" },
          { san: "c5" },
          { san: "Nf3" },
          { san: "d6" },
          { san: "d4" },
          { san: "cxd4" },
          { san: "Nxd4" },
          { san: "Nf6" },
          { san: "Nc3" },
          { san: "a6" },
          {
            san: "Bg5",
            comment:
              "The most aggressive setup — pin the knight, prepare castling long.",
          },
          { san: "e6" },
          { san: "f4" },
          {
            san: "Be7",
            comment: "Solid — break the pin.",
          },
          { san: "Qf3" },
          { san: "Qc7" },
        ],
      },
      {
        id: "najdorf-be2",
        name: "Classical 6.Be2",
        finalComment:
          "Solid middle game — kingside fianchetto, prepare ...b5.",
        moves: [
          { san: "e4" },
          { san: "c5" },
          { san: "Nf3" },
          { san: "d6" },
          { san: "d4" },
          { san: "cxd4" },
          { san: "Nxd4" },
          { san: "Nf6" },
          { san: "Nc3" },
          { san: "a6" },
          {
            san: "Be2",
            comment: "Quiet but principled.",
          },
          { san: "e5" },
          { san: "Nb3" },
          { san: "Be7" },
          { san: "O-O" },
          { san: "O-O" },
        ],
      },
    ],
  },

  /* -------------------------------------------------------------------- */
  /*  Scandinavian (black)                                                 */
  /* -------------------------------------------------------------------- */
  {
    slug: "scandinavian-defense",
    name: "Scandinavian Defense",
    color: "black",
    tagline: "Queen out on move 2. Surprisingly solid.",
    description:
      "Want to take White out of book on move 1? Play 1...d5. Solid pawn structure, easy plans.",
    lines: [
      {
        id: "scandi-qa5",
        name: "Main Line 3...Qa5",
        finalComment:
          "Comfortable Caro-Kann-like position — bishop outside the chain, easy development.",
        moves: [
          { san: "e4" },
          {
            san: "d5",
            comment:
              "Scandinavian. Challenge the e4 pawn directly on move 1.",
          },
          { san: "exd5" },
          {
            san: "Qxd5",
            comment: "Recapture with the queen.",
          },
          { san: "Nc3" },
          {
            san: "Qa5",
            comment: "Step away from the threat, eye the kingside.",
          },
          { san: "d4" },
          { san: "Nf6" },
          { san: "Nf3" },
          { san: "c6", comment: "Caro-style support and luft for the queen." },
          { san: "Bc4" },
          { san: "Bf5" },
        ],
      },
      {
        id: "scandi-qd6",
        name: "Modern 3...Qd6",
        finalComment:
          "Queen on d6 — solid, less common, takes White out of preparation.",
        moves: [
          { san: "e4" },
          { san: "d5" },
          { san: "exd5" },
          { san: "Qxd5" },
          { san: "Nc3" },
          {
            san: "Qd6",
            comment: "Modern Scandinavian — keep the queen central.",
          },
          { san: "d4" },
          { san: "Nf6" },
          { san: "Nf3" },
          { san: "a6", comment: "Prepare ...b5 expansion." },
          { san: "g3" },
          { san: "b5" },
        ],
      },
    ],
  },

  /* -------------------------------------------------------------------- */
  /*  Queen's Gambit Declined (white)                                      */
  /* -------------------------------------------------------------------- */
  {
    slug: "queens-gambit-declined",
    name: "Queen's Gambit Declined",
    color: "white",
    tagline: "The heavyweight of 1.d4 d5.",
    description:
      "Solid central structure after ...e6. Exchange with Bxf6 or keep pieces with main-line development.",
    lines: [
      {
        id: "qgd-bxf6-main",
        name: "Exchange structure (5.Bg5 h6 6.Bxf6)",
        finalComment:
          "Black's queen is a little loose; White has easy development and a slight pull.",
        moves: [
          { san: "d4" },
          { san: "d5" },
          { san: "c4" },
          { san: "e6" },
          { san: "Nc3" },
          { san: "Nf6" },
          {
            san: "Bg5",
            comment: "Pin — the Exchange QGD starts here.",
          },
          { san: "h6" },
          {
            san: "Bxf6",
            comment: "Double pawns or give up the bishop pair — both are playable.",
          },
          { san: "Qxf6" },
          { san: "Nf3" },
          { san: "dxc4" },
          {
            san: "e3",
            comment: "Recover the pawn calmly.",
          },
          { san: "c5" },
          { san: "Bxc4" },
          { san: "cxd4" },
          {
            san: "exd4",
            comment: "Isolated d-pawn IQP — classic middlegame plans.",
          },
        ],
      },
      {
        id: "qgd-mainline-piece",
        name: "Main line 7-piece (cxd5 exd5 Bf4)",
        finalComment:
          "Symmetrical pawn center — fight for e5/c5 outposts and open files.",
        moves: [
          { san: "d4" },
          { san: "d5" },
          { san: "c4" },
          { san: "e6" },
          { san: "Nc3" },
          { san: "Nf6" },
          { san: "cxd5" },
          { san: "exd5" },
          {
            san: "Bf4",
            comment: "London System transplant — fight for e5 without locking the bishop.",
          },
          { san: "Bd6" },
          { san: "e3" },
          { san: "O-O" },
          { san: "Bd3" },
          { san: "Re8" },
          { san: "Nge2" },
          { san: "c6" },
          {
            san: "Qc2",
            comment: "Prepare long castle or kingside expansion.",
          },
          { san: "g6" },
          {
            san: "O-O-O",
            comment: "Opposite-side castling is on the menu.",
          },
        ],
      },
    ],
  },

  /* -------------------------------------------------------------------- */
  /*  Catalan Opening (white)                                              */
  /* -------------------------------------------------------------------- */
  {
    slug: "catalan-opening",
    name: "Catalan Opening",
    color: "white",
    tagline: "g3 + Bg2 — pressure without locking the center.",
    description:
      "Fianchetto the king's bishop against ...e6 setups. Long-term pressure on the long diagonal.",
    lines: [
      {
        id: "catalan-closed",
        name: "Closed Catalan (7...O-O)",
        finalComment:
          "Typical Catalan — small space edge, bishop pair potential, central tension.",
        moves: [
          { san: "d4" },
          { san: "Nf6" },
          { san: "c4" },
          { san: "e6" },
          {
            san: "g3",
            comment: "The Catalan — fianchetto before deciding on d5 or g3 systems.",
          },
          { san: "d5" },
          { san: "Bg2" },
          { san: "Be7" },
          { san: "Nf3" },
          { san: "O-O" },
          { san: "O-O" },
          { san: "c6" },
          {
            san: "Qc2",
            comment: "Flexible queen — eyes e4 and supports b3/Ba3 ideas.",
          },
          { san: "b6" },
          {
            san: "e4",
            comment: "Grab space when Black is passive.",
          },
        ],
      },
      {
        id: "catalan-open-dxc4",
        name: "Open Catalan (5...dxc4 6.Qa4+)",
        finalComment:
          "You regain the pawn with tempo — Black's development is slightly awkward.",
        moves: [
          { san: "d4" },
          { san: "Nf6" },
          { san: "c4" },
          { san: "e6" },
          { san: "g3" },
          { san: "d5" },
          { san: "Bg2" },
          {
            san: "dxc4",
            comment: "Black grabs — now we use the Catalan recipe.",
          },
          {
            san: "Qa4+",
            comment: "Forking development — the knight has to block awkwardly.",
          },
          { san: "Nbd7" },
          { san: "Qxc4" },
          { san: "a6" },
          {
            san: "Nf3",
            comment: "Finish development with a healthy extra tempo.",
          },
        ],
      },
    ],
  },

  /* -------------------------------------------------------------------- */
  /*  English Opening (white)                                              */
  /* -------------------------------------------------------------------- */
  {
    slug: "english-opening",
    name: "English Opening",
    color: "white",
    tagline: "1.c4 — sidestep heavy theory, keep flexibility.",
    description:
      "Hypermodern control from the flank. Transposes into reversed Sicilians, Hedgehogs, or unique structures.",
    lines: [
      {
        id: "english-reversed-sicilian",
        name: "Reversed Sicilian (1...e5)",
        finalComment:
          "Solid reversed structure — develop behind the pawn chain then strike in the center.",
        moves: [
          { san: "c4" },
          { san: "e5" },
          { san: "Nc3" },
          { san: "Nf6" },
          {
            san: "g3",
            comment: "Fianchetto — keep the long diagonal hot.",
          },
          { san: "d5" },
          { san: "cxd5" },
          { san: "Nxd5" },
          { san: "Bg2" },
          { san: "Nb6" },
          { san: "Nf3" },
          { san: "Nc6" },
          {
            san: "O-O",
            comment: "King safe — now b3/Bb2 or d4 breaks are in play.",
          },
        ],
      },
      {
        id: "english-symmetrical",
        name: "Symmetrical English (1...c5)",
        finalComment:
          "Open d-file after exchanges — both sides have IQP ideas; know your plans.",
        moves: [
          { san: "c4" },
          { san: "c5" },
          { san: "Nc3" },
          { san: "Nc6" },
          { san: "g3" },
          { san: "g6" },
          { san: "Bg2" },
          { san: "Bg7" },
          { san: "Nf3" },
          { san: "d6" },
          { san: "d4" },
          { san: "cxd4" },
          { san: "Nxd4" },
          { san: "Nxd4" },
          {
            san: "Qxd4",
            comment: "Queen centralizes — watch for ...Bf5 / ...Be6 tempo hits.",
          },
        ],
      },
    ],
  },

  /* -------------------------------------------------------------------- */
  /*  King's Indian Defense (black)                                        */
  /* -------------------------------------------------------------------- */
  {
    slug: "kings-indian-defense",
    name: "King's Indian Defense",
    color: "black",
    tagline: "Fianchetto, castle, then storm the kingside.",
    description:
      "Hypermodern classic: let White build the center, then break with ...e5 or ...c5 and play for ...f5.",
    lines: [
      {
        id: "kid-classical-fianchetto",
        name: "Classical Fianchetto (7...Na6)",
        finalComment:
          "Typical KID — knight reroutes to c5; ...e5 break is the thematic hammer.",
        moves: [
          { san: "d4" },
          { san: "Nf6" },
          { san: "c4" },
          { san: "g6" },
          { san: "Nc3" },
          { san: "Bg7" },
          { san: "e4" },
          { san: "d6" },
          { san: "Nf3" },
          { san: "O-O" },
          { san: "Be2" },
          { san: "e5" },
          { san: "O-O" },
          { san: "Nc6" },
          {
            san: "d5",
            comment: "Close the center — now prepare ...Ne8 and ...f5.",
          },
          { san: "Ne7" },
          { san: "Ne1" },
          { san: "Nd7" },
          { san: "Be3" },
          { san: "f5" },
        ],
      },
      {
        id: "kid-saemisch",
        name: "Saemisch (5.f3)",
        finalComment:
          "Locked center — Black often plays ...c5 or ...a6 with queenside counterplay.",
        moves: [
          { san: "d4" },
          { san: "Nf6" },
          { san: "c4" },
          { san: "g6" },
          { san: "Nc3" },
          { san: "Bg7" },
          { san: "e4" },
          { san: "d6" },
          {
            san: "f3",
            comment: "Saemisch — solidifies e4 and eyes g4 ideas.",
          },
          { san: "O-O" },
          { san: "Be3" },
          { san: "e5" },
          {
            san: "d5",
            comment: "Close the center — typical KID central tension.",
          },
          { san: "Nh5" },
          {
            san: "Qd2",
            comment: "Prepare Bh6 ideas or long castle.",
          },
          {
            san: "Kh8",
            comment: "Lose the h8 pin — ...f5 or ...c5 next depending on White's setup.",
          },
        ],
      },
    ],
  },

  /* -------------------------------------------------------------------- */
  /*  Slav / Semi-Slav (black)                                             */
  /* -------------------------------------------------------------------- */
  {
    slug: "slav-defense",
    name: "Slav & Semi-Slav",
    color: "black",
    tagline: "Hold d5 without locking the light-squared bishop.",
    description:
      "The ...c6 Slav keeps the d5 pawn defended. The Semi-Slav triangle is a world-championship structure.",
    lines: [
      {
        id: "slav-exchange-main",
        name: "Exchange Slav (4...dxc4)",
        finalComment:
          "Symmetrical IQP positions — know your minority attack and piece placements.",
        moves: [
          { san: "d4" },
          { san: "d5" },
          { san: "c4" },
          { san: "c6" },
          { san: "Nf3" },
          { san: "Nf6" },
          { san: "Nc3" },
          { san: "dxc4" },
          { san: "a4" },
          {
            san: "Bf5",
            comment: "Develop outside the pawn chain — the Slav's soul.",
          },
          { san: "Ne5" },
          { san: "e6" },
          {
            san: "g3",
            comment: "Fianchetto pressure against the bishop.",
          },
          {
            san: "Nbd7",
            comment: "Solidity — ...e5 or ...Rc8 ideas follow.",
          },
        ],
      },
      {
        id: "semi-slav-triangle",
        name: "Semi-Slav Triangle (6...Nbd7)",
        finalComment:
          "Rich middlegame — Black is solid; ...b5 breaks are thematic later.",
        moves: [
          { san: "d4" },
          { san: "d5" },
          { san: "c4" },
          { san: "c6" },
          { san: "Nf3" },
          { san: "e6" },
          { san: "Nc3" },
          { san: "Nf6" },
          { san: "e3" },
          { san: "Nbd7" },
          { san: "Bd3" },
          { san: "dxc4" },
          { san: "Bxc4" },
          { san: "b5" },
          {
            san: "Bd3",
            comment: "Drop back — ...b5-b4 ideas are coming.",
          },
          { san: "Bb7" },
          {
            san: "O-O",
            comment: "Castle into the hedgehog-style setup.",
          },
          {
            san: "Rc8",
            comment: "Connect the rooks — ...c5 or ...Qc7 next is common.",
          },
        ],
      },
    ],
  },

  /* -------------------------------------------------------------------- */
  /*  Trompowsky Attack (white)                                            */
  /* -------------------------------------------------------------------- */
  {
    slug: "trompowsky-attack",
    name: "Trompowsky Attack",
    color: "white",
    tagline: "2.Bg5 — take Nimzo players out of the book.",
    description:
      "Against 1...Nf6, pin immediately. Leads to unique pawn structures and fun tactics.",
    lines: [
      {
        id: "trompowsky-main",
        name: "Main line (2...e6)",
        finalComment:
          "Solid Trompowsky tabiya — White has easy development, Black's bishop pair is traded.",
        moves: [
          { san: "d4" },
          { san: "Nf6" },
          {
            san: "Bg5",
            comment: "The Trompowsky — immediate pin.",
          },
          { san: "e6" },
          { san: "e3" },
          { san: "h6" },
          {
            san: "Bh4",
            comment: "Keep the tension — don't trade yet.",
          },
          { san: "d6" },
          { san: "c3" },
          { san: "g5" },
          {
            san: "Bg3",
            comment: "Retreat with life — Black weakened the kingside.",
          },
          { san: "Bg7" },
          { san: "Nf3" },
        ],
      },
      {
        id: "trompowsky-ne4",
        name: "Early ...Ne4 (4.h4)",
        finalComment:
          "Sharp — open h-file pressure after captures on g5.",
        moves: [
          { san: "d4" },
          { san: "Nf6" },
          { san: "Bg5" },
          {
            san: "Ne4",
            comment: "Kick the bishop immediately.",
          },
          {
            san: "h4",
            comment: "Ask questions — Black must resolve the pin.",
          },
          { san: "Nxg5" },
          { san: "hxg5" },
          { san: "e6" },
          {
            san: "e4",
            comment: "Build a big center against the damaged kingside.",
          },
          { san: "h6" },
          { san: "Nc3" },
        ],
      },
    ],
  },

  /* -------------------------------------------------------------------- */
  /*  Modern Benoni (black)                                                */
  /* -------------------------------------------------------------------- */
  {
    slug: "modern-benoni",
    name: "Modern Benoni",
    color: "black",
    tagline: "Create an imbalanced fight from move one.",
    description:
      "After c5 and d5, Black accepts a backward d6 pawn for active pieces and queenside pressure.",
    lines: [
      {
        id: "benoni-main-fianchetto",
        name: "Main line (Fianchetto White)",
        finalComment:
          "Classic Benoni — Black's ...a6/...Ra7 and ...b5 break is the counterplay recipe.",
        moves: [
          { san: "d4" },
          { san: "Nf6" },
          { san: "c4" },
          { san: "c5" },
          { san: "d5" },
          { san: "e6" },
          { san: "Nc3" },
          { san: "exd5" },
          { san: "cxd5" },
          { san: "d6" },
          { san: "Nf3" },
          { san: "g6" },
          { san: "g3" },
          { san: "Bg7" },
          { san: "Bg2" },
          { san: "O-O" },
          {
            san: "O-O",
            comment: "Both sides castled — now ...Re8 and ...Ne8-g7-f5 ideas.",
          },
          {
            san: "Re8",
            comment: "Pressure the e-file — Benoni classics.",
          },
        ],
      },
      {
        id: "benoni-classical-6-e4",
        name: "Classical 6.e4",
        finalComment:
          "Sharp Benoni center — Black fights for ...e6 breaks and the c-file.",
        moves: [
          { san: "d4" },
          { san: "Nf6" },
          { san: "c4" },
          { san: "c5" },
          { san: "d5" },
          { san: "e6" },
          { san: "Nc3" },
          { san: "exd5" },
          { san: "cxd5" },
          { san: "d6" },
          {
            san: "e4",
            comment: "White grabs space — Benoni knife fight.",
          },
          { san: "g6" },
          { san: "Nf3" },
          { san: "Bg7" },
          { san: "Be2" },
          { san: "O-O" },
          { san: "O-O" },
          {
            san: "Re8",
            comment: "Centralize the rook — ...Bg4 or ...Na6 are typical follow-ups.",
          },
        ],
      },
    ],
  },

  /* -------------------------------------------------------------------- */
  /*  Dutch Defense (black)                                                */
  /* -------------------------------------------------------------------- */
  {
    slug: "dutch-defense",
    name: "Dutch Defense",
    color: "black",
    tagline: "1...f5 — claim the e4 square on your terms.",
    description:
      "Aggressive counter to 1.d4. Leningrad fianchetto or Stonewall pawn chains are the main highways.",
    lines: [
      {
        id: "dutch-leningrad",
        name: "Leningrad Dutch (7...Qe8)",
        finalComment:
          "Typical Leningrad — ...e5 break and kingside play against White's long castle.",
        moves: [
          { san: "d4" },
          { san: "f5" },
          { san: "c4" },
          { san: "Nf6" },
          { san: "g3" },
          { san: "g6" },
          { san: "Bg2" },
          { san: "Bg7" },
          { san: "Nf3" },
          { san: "O-O" },
          { san: "O-O" },
          { san: "d6" },
          { san: "Nc3" },
          {
            san: "Qe8",
            comment: "Queen reroute — eyes the kingside and supports ...e5.",
          },
          { san: "Re1" },
          {
            san: "Nbd7",
            comment: "Flexible development — ...e5 is the central break.",
          },
        ],
      },
      {
        id: "dutch-stonewall-lite",
        name: "Stonewall setup (...e6 ...d5)",
        finalComment:
          "Solid Stonewall shell — look for ...c6 and ...Qe8 maneuvers behind the pawns.",
        moves: [
          { san: "d4" },
          { san: "f5" },
          { san: "c4" },
          { san: "Nf6" },
          { san: "g3" },
          { san: "e6" },
          { san: "Bg2" },
          { san: "Be7" },
          { san: "Nf3" },
          { san: "O-O" },
          { san: "O-O" },
          { san: "d5" },
          { san: "Nc3" },
          { san: "c6" },
          {
            san: "Qc2",
            comment: "Eye h7 and prepare b3/Ba3 pressure.",
          },
          { san: "Qe8" },
        ],
      },
    ],
  },

  /* -------------------------------------------------------------------- */
  /*  Nimzo-Indian Defense (black)                                         */
  /* -------------------------------------------------------------------- */
  {
    slug: "nimzo-indian-defense",
    name: "Nimzo-Indian Defense",
    color: "black",
    tagline: "3...Bb4 — control e4 without ...d5 yet.",
    description:
      "Pin the knight, double pawns if allowed, and steer toward rich IQP or bishop-pair middlegames.",
    lines: [
      {
        id: "nimzo-qc2",
        name: "Rubinstein (4.e3 or 4.Qc2)",
        finalComment:
          "Black has easy development — watch for ...Ne4 and ...f5 central breaks.",
        moves: [
          { san: "d4" },
          { san: "Nf6" },
          { san: "c4" },
          { san: "e6" },
          { san: "Nc3" },
          {
            san: "Bb4",
            comment: "The Nimzo pin.",
          },
          { san: "Qc2" },
          { san: "O-O" },
          { san: "a3" },
          { san: "Bxc3+" },
          { san: "Qxc3" },
          { san: "b6" },
          { san: "Nf3" },
          { san: "Bb7" },
          {
            san: "e3",
            comment: "Solid White setup — Black fianchettoes and fights e4.",
          },
          {
            san: "c5",
            comment: "Strike at d4 — the Nimzo pawn structure is fluid.",
          },
        ],
      },
      {
        id: "nimzo-classical-4-qb6",
        name: "4...Qc7 / flexible development",
        finalComment:
          "Flexible Nimzo — queen eyes the center; ...Ne4 ideas lurk.",
        moves: [
          { san: "d4" },
          { san: "Nf6" },
          { san: "c4" },
          { san: "e6" },
          { san: "Nc3" },
          { san: "Bb4" },
          { san: "e3" },
          { san: "b6" },
          { san: "Bd3" },
          { san: "Bb7" },
          { san: "Nf3" },
          { san: "O-O" },
          { san: "O-O" },
          { san: "d6" },
        ],
      },
    ],
  },

  /* -------------------------------------------------------------------- */
  /*  Sicilian Dragon (black)                                              */
  /* -------------------------------------------------------------------- */
  {
    slug: "sicilian-dragon",
    name: "Sicilian Dragon",
    color: "black",
    tagline: "Accelerated or Classical — Bg7 and ...g6 says it all.",
    description:
      "Opposite-side castling races and Yugoslav Attack tactics. Know your ...Rc8 and ...d5 resources.",
    lines: [
      {
        id: "dragon-accelerated",
        name: "Accelerated Dragon (5...Bg7)",
        finalComment:
          "Dragon structure without an early ...d6 — fast development and ...d5 breaks.",
        moves: [
          { san: "e4" },
          { san: "c5" },
          { san: "Nf3" },
          { san: "g6" },
          { san: "d4" },
          { san: "cxd4" },
          { san: "Nxd4" },
          { san: "Bg7" },
          { san: "Nc3" },
          { san: "Nc6" },
          { san: "Be3" },
          { san: "Nf6" },
          { san: "Bc4" },
          { san: "O-O" },
          { san: "Bb3" },
          { san: "d6" },
          {
            san: "f3",
            comment: "Yugoslav-style prep — g4 and Qd2 are next.",
          },
          {
            san: "Bd7",
            comment: "Flexible bishop — ...Rc8 and ...Ne5 are common follow-ups.",
          },
        ],
      },
      {
        id: "dragon-yugoslav",
        name: "Yugoslav Attack tabiya",
        finalComment:
          "Opposite castles — attack with g4-g5 or defend with ...Rc8. Study your tactics!",
        moves: [
          { san: "e4" },
          { san: "c5" },
          { san: "Nf3" },
          { san: "d6" },
          { san: "d4" },
          { san: "cxd4" },
          { san: "Nxd4" },
          { san: "Nf6" },
          { san: "Nc3" },
          { san: "g6" },
          { san: "Be3" },
          { san: "Bg7" },
          { san: "f3" },
          { san: "O-O" },
          { san: "Qd2" },
          { san: "Nc6" },
          { san: "Bc4" },
          { san: "Bd7" },
          {
            san: "O-O-O",
            comment: "The race is on — calculate g4 lines carefully.",
          },
          {
            san: "Rc8",
            comment: "Dragon classics — pressure the half-open c-file.",
          },
        ],
      },
    ],
  },

  /* -------------------------------------------------------------------- */
  /*  Philidor Defense (black)                                             */
  /* -------------------------------------------------------------------- */
  {
    slug: "philidor-defense",
    name: "Philidor Defense",
    color: "black",
    tagline: "Solid ...d6 / ...d5 shell against 1.e4.",
    description:
      "Old-school solidity. Exchange lines are symmetrical; main lines fight for ...c5 and ...f5 breaks.",
    lines: [
      {
        id: "philidor-main-antid4",
        name: "Main Philidor (3...Nf6 4.Nc3)",
        finalComment:
          "Flexible Philidor — ...c5 and ...Qc7 are typical counter punches.",
        moves: [
          { san: "e4" },
          { san: "e6" },
          { san: "d4" },
          { san: "d5" },
          { san: "Nd2" },
          { san: "Nf6" },
          { san: "e5" },
          { san: "Nfd7" },
          { san: "c3" },
          { san: "c5" },
          { san: "Ngf3" },
          { san: "Nc6" },
          { san: "Bd3" },
          { san: "cxd4" },
          { san: "cxd4" },
          {
            san: "Be7",
            comment: "Solid development — ...O-O and ...Qc7 follow.",
          },
        ],
      },
      {
        id: "philidor-exchange",
        name: "Exchange structure (5.exd5)",
        finalComment:
          "Symmetrical pawn chains — fight for outposts on e5/c5 and open files.",
        moves: [
          { san: "e4" },
          { san: "e6" },
          { san: "d4" },
          { san: "d5" },
          { san: "Nd2" },
          { san: "c5" },
          { san: "exd5" },
          { san: "exd5" },
          { san: "Bd3" },
          { san: "Nc6" },
          { san: "c3" },
          { san: "Bd6" },
          { san: "Ngf3" },
          { san: "Qc7" },
          { san: "O-O" },
          { san: "Nge7" },
          {
            san: "Re1",
            comment: "Pressure the e-file — rooks love these structures.",
          },
          { san: "Rb8", comment: "Activate the rook — ...Bf5 or ...f6 ideas." },
        ],
      },
    ],
  },

  /* -------------------------------------------------------------------- */
  /*  Pirc Defense (black)                                                 */
  /* -------------------------------------------------------------------- */
  {
    slug: "pirc-defense",
    name: "Pirc Defense",
    color: "black",
    tagline: "Hypermodern king's fianchetto vs 1.e4.",
    description:
      "Let White build a big center, then strike with ...e5 or ...c5 and kingside counterplay.",
    lines: [
      {
        id: "pirc-classical-150",
        name: "Classical (Be2 / O-O)",
        finalComment:
          "Standard Pirc — ...c5 or ...Bg4 ideas next depending on White's setup.",
        moves: [
          { san: "e4" },
          { san: "d6" },
          { san: "d4" },
          { san: "Nf6" },
          { san: "Nc3" },
          { san: "g6" },
          { san: "Nf3" },
          { san: "Bg7" },
          { san: "Be2" },
          { san: "O-O" },
          { san: "O-O" },
          { san: "c5" },
          { san: "Be3" },
          {
            san: "Bg4",
            comment: "Pin — trade or retreat depending on White's reply.",
          },
          { san: "h3" },
          { san: "Bxf3" },
          { san: "Bxf3" },
          {
            san: "Nbd7",
            comment: "Redeploy — ...e5 or ...b5 next depending on White.",
          },
        ],
      },
      {
        id: "pirc-austrian-lite",
        name: "Austrian Attack lite (4.h3)",
        finalComment:
          "Kingside space — prepare g4 or reinforce against ...Bg4.",
        moves: [
          { san: "e4" },
          { san: "d6" },
          { san: "d4" },
          { san: "Nf6" },
          { san: "Nc3" },
          { san: "g6" },
          { san: "Nf3" },
          { san: "Bg7" },
          {
            san: "h3",
            comment: "Anti-Bg4 insurance before committing the bishop.",
          },
          { san: "O-O" },
          { san: "Be3" },
          { san: "c6" },
          { san: "a4" },
          { san: "Nbd7" },
          {
            san: "a5",
            comment: "Clamp queenside — typical Austrian space grab.",
          },
          {
            san: "b5",
            comment: "Queenside tension — ...Qa5 or ...Bb7 sometimes follows.",
          },
        ],
      },
    ],
  },

  /* -------------------------------------------------------------------- */
  /*  Queen's Indian Defense (black)                                       */
  /* -------------------------------------------------------------------- */
  {
    slug: "queens-indian-defense",
    name: "Queen's Indian Defense",
    color: "black",
    tagline: "3...b6 — fianchetto without touching the center yet.",
    description:
      "Hypermodern pressure on the long diagonal. Often transposes to Nimzo/Bogo complexes.",
    lines: [
      {
        id: "qid-mainline",
        name: "Main line (4.g3 Bb7)",
        finalComment:
          "Typical QID — both sides fianchetto; fight for e4 and d5 next.",
        moves: [
          { san: "d4" },
          { san: "Nf6" },
          { san: "c4" },
          { san: "e6" },
          { san: "Nf3" },
          {
            san: "b6",
            comment: "Queen's Indian — fianchetto the queen's bishop.",
          },
          { san: "g3" },
          { san: "Bb7" },
          { san: "Bg2" },
          { san: "Be7" },
          { san: "O-O" },
          { san: "O-O" },
          { san: "Nc3" },
          { san: "Ne4" },
          { san: "Qc2" },
          { san: "Nxc3" },
          { san: "bxc3" },
          {
            san: "c5",
            comment: "Hit the center — typical QID counterplay vs the IQP structure.",
          },
        ],
      },
      {
        id: "qid-e3-setup",
        name: "e3 / Bd3 vs early ...d5",
        finalComment:
          "Classical QID — central tension with ...dxe4 possible; knights decide the fight.",
        moves: [
          { san: "d4" },
          { san: "Nf6" },
          { san: "c4" },
          { san: "e6" },
          { san: "Nf3" },
          { san: "b6" },
          {
            san: "e3",
            comment: "Solid — keeps the bishop flexible (d3 or b2).",
          },
          { san: "Bb7" },
          { san: "Bd3" },
          { san: "d5" },
          { san: "O-O" },
          { san: "Bd6" },
          { san: "Nc3" },
          { san: "O-O" },
          { san: "Qe2" },
          { san: "Nbd7" },
          {
            san: "e4",
            comment: "Central tension — typical hanging-pawns or IQP structures.",
          },
          {
            san: "dxe4",
            comment: "Capture in the center — isolani or symmetrical central fights ahead.",
          },
        ],
      },
    ],
  },
];

/**
 * Lookup by slug — used by the trainer page.
 */
export function findCourse(slug: string): OpeningCourse | undefined {
  return OPENING_COURSES.find((c) => c.slug === slug);
}

/**
 * Catalog summary — small payload for the index page.
 */
export function listCoursesSummary() {
  return OPENING_COURSES.map((c) => ({
    slug: c.slug,
    name: c.name,
    color: c.color,
    description: c.description,
    tagline: c.tagline,
    lineCount: c.lines.length,
  }));
}
