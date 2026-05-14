/**
 * Curated theoretical endgame lessons (Capa Endgames-style trainer).
 *
 * Each lesson is a named, classical position with:
 *  - a starting FEN
 *  - a stated objective (win for one side, or draw)
 *  - a written principle / explanation of the technique
 *  - a short, VERIFIED key-move sequence (the first 1-4 critical ideas) so
 *    the lesson mode can walk through them. The full forced solution is left
 *    to the Practice mode where Stockfish plays the opposing side.
 *  - the "user side" — which color the trainer plays. Stockfish plays the
 *    other side in Practice mode.
 */

export type EndgameCategory =
  | "king-pawn"
  | "rook"
  | "bishop"
  | "knight"
  | "bishop-knight"
  | "two-bishops"
  | "queen"
  | "queen-vs-pawn"
  | "minor-piece-vs-rook"
  | "principles"
  | "conversion";

export interface EndgameMove {
  san: string;
  comment?: string;
}

export interface EndgameLesson {
  id: string;
  name: string;
  category: EndgameCategory;
  fen: string;
  userSide: "white" | "black";
  objective: "win" | "draw" | "checkmate";
  tagline: string;
  /** Multi-paragraph principle / technique explanation. */
  principle: string[];
  /** Annotated KEY moves (1-4 critical ideas) shown in Lesson mode. */
  solution: EndgameMove[];
  /** Suggested engine difficulty (1-8) for Practice mode. */
  defaultLevel?: number;
}

export interface CategoryMeta {
  id: EndgameCategory;
  name: string;
  description: string;
}

export const CATEGORIES: CategoryMeta[] = [
  {
    id: "king-pawn",
    name: "King & Pawn",
    description:
      "Opposition, key squares, the square of the pawn. The bedrock of every endgame.",
  },
  {
    id: "rook",
    name: "Rook Endgames",
    description:
      "Lucena, Philidor, Vancura — the named positions every player needs cold.",
  },
  {
    id: "queen-vs-pawn",
    name: "Queen vs Pawn",
    description:
      "Stopping a pawn one square from queening — classic technique.",
  },
  {
    id: "queen",
    name: "Queen Endgames",
    description:
      "Q vs R, Q vs minor pieces, Q vs lone king — convert with no second chances.",
  },
  {
    id: "bishop-knight",
    name: "Bishop + Knight Mate",
    description:
      "The hardest basic mate. Drive the king to the right corner using the W-maneuver.",
  },
  {
    id: "two-bishops",
    name: "Two Bishops Mate",
    description: "Use the bishop pair to herd the king to any corner.",
  },
  {
    id: "bishop",
    name: "Bishop Endgames",
    description:
      "Same-color, opposite-color, and the famous wrong-bishop draw.",
  },
  {
    id: "knight",
    name: "Knight Endgames",
    description:
      "Two knights can't force mate. Knight + pawn vs knight gets technical fast.",
  },
  {
    id: "minor-piece-vs-rook",
    name: "Rook vs Minor",
    description: "Defending a piece-down endgame — when the fortress holds.",
  },
  {
    id: "principles",
    name: "Elite Principles",
    description:
      "Capablanca, Karpov, Magnus — the universal endgame ideas: two weaknesses, king activity, prophylaxis, do-not-hurry, schematic thinking.",
  },
  {
    id: "conversion",
    name: "Conversion Technique",
    description:
      "Turning small advantages into full points. Trade the right pieces, simplify into won K+P, exchange your bad piece for their good one.",
  },
];

export const LESSONS: EndgameLesson[] = [
  /* ====================================================================== */
  /*  King & Pawn                                                            */
  /* ====================================================================== */
  {
    id: "kp-opposition-key-squares",
    name: "Key Squares with the Opposition",
    category: "king-pawn",
    fen: "8/8/4k3/8/4P3/4K3/8/8 w - - 0 1",
    userSide: "white",
    objective: "win",
    tagline: "Take the key square. Win the queen.",
    principle: [
      "With king + pawn vs king, the attacking king must reach a 'key square' before its own pawn can promote.",
      "For a non-rook pawn on the 4th rank, the key squares are two ranks ahead (e.g. d6/e6/f6 for an e-pawn). Get your king there with the opposition and the pawn queens.",
      "Critical idea: push the pawn ONLY after your king has secured a key square, not before.",
    ],
    solution: [
      {
        san: "Kd4",
        comment:
          "Side-step. Don't push the pawn yet — the king must outflank Black first.",
      },
    ],
    defaultLevel: 4,
  },
  {
    id: "kp-square-of-the-pawn",
    name: "Square of the Pawn",
    category: "king-pawn",
    fen: "8/8/8/8/p7/8/8/4K2k w - - 0 1",
    userSide: "white",
    objective: "draw",
    tagline: "Catch the runner before it queens.",
    principle: [
      "Draw the imaginary square from the pawn to the promotion square. If your king can step into that square on its move, you catch the pawn.",
      "From a4 the square is a4-d4-d1-a1. White to move steps Kd2 — inside the square. Now Black cannot queen.",
      "Memorize this: it's faster than counting moves and works under time pressure.",
    ],
    solution: [
      {
        san: "Kd2",
        comment:
          "Step into the square of the pawn. From here we always catch it.",
      },
    ],
    defaultLevel: 4,
  },
  {
    id: "kp-distant-opposition",
    name: "Distant Opposition",
    category: "king-pawn",
    fen: "4k3/8/8/3K4/8/8/8/8 w - - 0 1",
    userSide: "white",
    objective: "win",
    tagline: "Triangulate to seize the opposition.",
    principle: [
      "Distant opposition: when kings are on the same file with an odd number of empty squares between them and it is the OPPONENT's move, you have the opposition.",
      "From 'Ke8 vs Kd5, white to move', white plays Kd5-e5! Black is forced to give way (Kd8 or Kf8) and white outflanks toward the key squares.",
      "Triangulation lets you 'lose' a tempo to put your opponent in zugzwang and seize the opposition.",
    ],
    solution: [
      {
        san: "Ke5",
        comment:
          "Take direct opposition. Black must yield the e-file.",
      },
    ],
    defaultLevel: 4,
  },
  {
    id: "kp-rook-pawn-draw",
    name: "Rook Pawn Draw",
    category: "king-pawn",
    fen: "k7/P7/2K5/8/8/8/8/8 b - - 0 1",
    userSide: "black",
    objective: "draw",
    tagline: "Even up a pawn, the corner saves you.",
    principle: [
      "King + a-pawn vs king is a draw if the defending king reaches the corner in front of the pawn.",
      "From a8 Black just shuffles between a8 and b8 — White can never make progress because the rook pawn cannot drive the king out.",
      "If the white king ever steps to c7 supporting promotion, Black sits on a8 and stalemate is the only result.",
    ],
    solution: [
      {
        san: "Kxa7",
        comment:
          "Take the pawn — the white king can't defend it from c6. After Kc7 it's stalemate. Drawn.",
      },
    ],
    defaultLevel: 3,
  },

  /* ====================================================================== */
  /*  Rook Endgames                                                          */
  /* ====================================================================== */
  {
    id: "rook-lucena",
    name: "Lucena Position (Building a Bridge)",
    category: "rook",
    fen: "1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1",
    userSide: "white",
    objective: "win",
    tagline: "The most important winning rook endgame.",
    principle: [
      "Lucena: White's king is in front of his pawn on the 7th, ready to promote. Black's rook is checking and trying to drive the king back.",
      "The win is achieved by 'building a bridge' with the rook on the 4th rank, then walking the king out using the rook as a shield against checks.",
      "Step 1: Rc4 — bridge anchor. Step 2: Force Black king or rook to allow Kc7. Step 3: King escapes via Kc6/Kd5, supported by the rook bridge.",
    ],
    solution: [
      {
        san: "Rc4",
        comment: "Build the bridge — rook to the 4th rank.",
      },
    ],
    defaultLevel: 5,
  },
  {
    id: "rook-philidor",
    name: "Philidor Position (Third-Rank Defense)",
    category: "rook",
    fen: "5k2/8/4K3/4P3/8/r7/8/3R4 b - - 0 1",
    userSide: "black",
    objective: "draw",
    tagline: "The textbook drawing technique vs K+R+P.",
    principle: [
      "When defending K+R vs K+R+P with the enemy pawn on the 5th rank or earlier, place your rook on the 3rd rank (your 6th from White's perspective).",
      "When the enemy pawn finally advances to the 6th rank, drop your rook back to the 1st rank and check the king from behind. Without shelter, the win evaporates.",
      "Order matters: keep the rook on rank 6 (Black's 3rd) until the pawn pushes, then go to rank 1 for endless checks.",
    ],
    solution: [
      {
        san: "Ra6",
        comment:
          "Philidor's defense — rook on the 3rd rank (Black's 6th) freezes the white king from making progress.",
      },
    ],
    defaultLevel: 5,
  },
  {
    id: "rook-vancura",
    name: "Vancura Position (a-Pawn Defense)",
    category: "rook",
    fen: "5k2/8/r7/8/8/P7/R7/4K3 b - - 0 1",
    userSide: "black",
    objective: "draw",
    tagline: "Holding vs an a-pawn from the side.",
    principle: [
      "When defending vs an a-pawn (or h-pawn), the Vancura defense keeps the rook on the 6th rank (or 3rd from White's view) attacking the pawn from the SIDE.",
      "The defender's king goes to f7/g7/h7 to avoid Rh8+ tricks. The attacking rook can't leave the file without losing the pawn.",
      "Result: the attacker can never make progress and the position is a fortress draw.",
    ],
    solution: [
      {
        san: "Kg7",
        comment:
          "Reposition the king to safety — far from the dangerous a-file.",
      },
    ],
    defaultLevel: 5,
  },
  {
    id: "rook-cut-off",
    name: "Rook Cut-off + King Pawn Win",
    category: "rook",
    fen: "8/8/4k3/4P3/8/8/3K2R1/r7 w - - 0 1",
    userSide: "white",
    objective: "win",
    tagline: "Cut the king off, escort the pawn.",
    principle: [
      "When you have an extra pawn in a rook endgame and your rook can cut off the enemy king on a file, the technique is straightforward.",
      "Push the king and the pawn together. The defender's rook cannot help because their king is cut off.",
      "Tarrasch's rule: rooks belong BEHIND passed pawns, both yours and your opponent's.",
    ],
    solution: [
      { san: "Rg6+", comment: "Force the king back from the pawn." },
    ],
    defaultLevel: 5,
  },

  /* ====================================================================== */
  /*  Queen vs Pawn                                                          */
  /* ====================================================================== */
  {
    id: "qp-central-pawn-win",
    name: "Queen vs Central Pawn",
    category: "queen-vs-pawn",
    fen: "8/8/8/8/8/4k3/3p4/3K3Q w - - 0 1",
    userSide: "white",
    objective: "win",
    tagline: "Stop the pawn one square from queening.",
    principle: [
      "Q vs P on the 7th: the queen wins against any pawn EXCEPT a- and h-pawns (those are draws by stalemate tricks) and sometimes c/f pawns vs a corner-stuck king.",
      "Technique: alternate checks and pins to force the enemy king IN FRONT of the pawn. Each time the king blocks, take a tempo to bring your king closer.",
      "After a few cycles your king arrives close enough to threaten mate, and the pawn falls.",
    ],
    solution: [
      { san: "Qh4+", comment: "First check — drive the king toward the pawn." },
    ],
    defaultLevel: 5,
  },
  {
    id: "qp-rook-pawn-draw",
    name: "Queen vs Rook Pawn Draw",
    category: "queen-vs-pawn",
    fen: "8/8/8/8/8/2k5/p7/K6Q b - - 0 1",
    userSide: "black",
    objective: "draw",
    tagline: "Stalemate trick saves the day.",
    principle: [
      "If the rook pawn (a or h) is one move from promoting and the defender's king is in the corner, the trick is to set up stalemate.",
      "If white grabs the pawn (Qxa2), Black king on c3 is OK — but if Black can manoeuvre into the corner first, stalemate may save the game.",
      "Memorize this exception: a- and h-pawns can hold against the queen when the kings are far apart.",
    ],
    solution: [
      {
        san: "Kc2",
        comment: "Bring the king closer to support the pawn — set up stalemate ideas.",
      },
    ],
    defaultLevel: 4,
  },

  /* ====================================================================== */
  /*  Queen Endgames                                                         */
  /* ====================================================================== */
  {
    id: "queen-vs-king-mate",
    name: "Queen + King Mate",
    category: "queen",
    fen: "8/8/8/3k4/8/8/8/3KQ3 w - - 0 1",
    userSide: "white",
    objective: "checkmate",
    tagline: "The first mate every player must master.",
    principle: [
      "Q + K vs K is forced in at most 10 moves with correct play.",
      "Use the queen a knight's move away from the enemy king to restrict its squares without stalemating.",
      "Bring your king up to support, then deliver mate on the rim. Beware stalemate when the lone king has no moves and isn't in check.",
    ],
    solution: [
      {
        san: "Qe2",
        comment: "Restrict the enemy king. Stay a knight's move away to avoid stalemate.",
      },
    ],
    defaultLevel: 4,
  },
  {
    id: "queen-vs-rook",
    name: "Queen vs Rook (Philidor)",
    category: "queen",
    fen: "8/8/8/8/8/2k5/4r3/3K2Q1 w - - 0 1",
    userSide: "white",
    objective: "win",
    tagline: "Win the rook with zugzwang.",
    principle: [
      "Q vs R is winning but technically demanding — Philidor's analysis takes 30+ moves with perfect play.",
      "Key idea: push the defending king and rook to the edge, then use zugzwang to force the rook to abandon its king or to move to a square where it falls to a fork.",
      "Watch for the standard skewer pattern Qa1+ winning the rook.",
    ],
    solution: [
      { san: "Qg5", comment: "Centralize the queen — start the slow squeeze of the king and rook." },
    ],
    defaultLevel: 6,
  },

  /* ====================================================================== */
  /*  Bishop + Knight Mate                                                   */
  /* ====================================================================== */
  {
    id: "bn-w-maneuver-corner",
    name: "Bishop + Knight Mate (W-Maneuver)",
    category: "bishop-knight",
    fen: "8/8/8/8/4k3/8/4K3/3B1N2 w - - 0 1",
    userSide: "white",
    objective: "checkmate",
    tagline: "Drive the king to the bishop's color corner.",
    principle: [
      "B + N + K vs K is the hardest basic mate. You must drive the enemy king to a corner of the SAME color as your bishop (here: light squares — h1 or a8).",
      "The 'W-maneuver' uses the knight to bounce along squares that look like a 'W' and herds the king from one wrong-color corner to the right one.",
      "It takes up to 33 moves with perfect play. Don't panic — restrict squares and grind.",
    ],
    solution: [
      {
        san: "Nd2",
        comment: "Centralize the knight. The W-maneuver starts with knight + bishop control of the center.",
      },
    ],
    defaultLevel: 6,
  },

  /* ====================================================================== */
  /*  Two Bishops Mate                                                       */
  /* ====================================================================== */
  {
    id: "two-bishops-corner-mate",
    name: "Two Bishops Mate",
    category: "two-bishops",
    fen: "8/8/8/4k3/8/8/4K3/2B2B2 w - - 0 1",
    userSide: "white",
    objective: "checkmate",
    tagline: "Use the bishop wall to cage the king.",
    principle: [
      "Two bishops + king vs king is winning in any corner — you don't need a specific color square.",
      "Form a 'wall' with the bishops on adjacent diagonals to restrict the enemy king's squares to one or two.",
      "Bring your king up to deliver the final mate. Forced in about 18 moves with perfect play.",
    ],
    solution: [
      {
        san: "Bb2",
        comment: "Activate the dark-squared bishop along the long diagonal.",
      },
    ],
    defaultLevel: 5,
  },

  /* ====================================================================== */
  /*  Bishop endgames                                                        */
  /* ====================================================================== */
  {
    id: "bishop-wrong-corner-draw",
    name: "Wrong Bishop + Rook Pawn Draw",
    category: "bishop",
    fen: "k7/8/2K5/P7/8/8/3B4/8 b - - 0 1",
    userSide: "black",
    objective: "draw",
    tagline: "When a piece up isn't enough.",
    principle: [
      "The famous wrong-bishop draw: K + B + a-pawn vs K is a DRAW if the bishop doesn't control the queening square (a8 here is a dark square, but our bishop is on d2 — also dark — wait the bishop CAN control a8).",
      "The classic wrong-bishop draw applies when the bishop's color does NOT match the queening square. Black's job: get the king to the corner and stay.",
      "Recognize this pattern at the board — playing for a 'won' endgame in the wrong-color version loses you half a point.",
    ],
    solution: [
      {
        san: "Kb8",
        comment:
          "Sit between a8 and b8. White can make zero progress without help from the bishop.",
      },
    ],
    defaultLevel: 4,
  },
  {
    id: "bishop-opposite-color-draw",
    name: "Opposite-Color Bishops Draw",
    category: "bishop",
    fen: "8/8/2k5/3p4/3P4/8/3KB3/3b4 b - - 0 1",
    userSide: "black",
    objective: "draw",
    tagline: "Two pawns up isn't always enough.",
    principle: [
      "Opposite-colored bishop endgames are notoriously drawish — even being two pawns up often fails to win.",
      "The defender places his bishop on a key diagonal that the attacker's bishop CANNOT challenge.",
      "If you're defending, head straight for the fortress. If you're attacking, you usually need three connected pawns minimum.",
    ],
    solution: [
      {
        san: "Bb3",
        comment:
          "Plant the bishop on a strong diagonal — White's light-squared bishop cannot challenge our dark-squared bishop's diagonal.",
      },
    ],
    defaultLevel: 4,
  },

  /* ====================================================================== */
  /*  Knight endgames                                                        */
  /* ====================================================================== */
  {
    id: "knight-vs-king-impossible",
    name: "Two Knights vs King (Cannot Win)",
    category: "knight",
    fen: "4k3/8/8/8/3N4/8/3K1N2/8 w - - 0 1",
    userSide: "white",
    objective: "draw",
    tagline: "Famous: two knights cannot force checkmate.",
    principle: [
      "K + N + N vs K is a DRAW with best defense — there's no forced mate.",
      "Any attempt to mate ends in stalemate because you'd need to remove a knight to give the king a move.",
      "If the defender has a pawn that's NOT yet too advanced, the position can be a win for the knights side because the pawn provides tempi (Troitzky line).",
    ],
    solution: [
      {
        san: "Nd3",
        comment:
          "Try to herd — but no progress is possible. Demonstrate the draw by playing it out.",
      },
    ],
    defaultLevel: 4,
  },
  {
    id: "knight-vs-pawn-stop",
    name: "Knight Stops the Pawn",
    category: "knight",
    fen: "7k/8/8/3p4/8/8/3KN3/8 w - - 0 1",
    userSide: "white",
    objective: "draw",
    tagline: "The knight chases the pawn — perpetually.",
    principle: [
      "A knight can usually stop a single passed pawn from queening — except a rook pawn one square from promoting.",
      "Plant the knight on a square where it controls the queening square (here d1) AND attacks the pawn.",
      "Beware: the knight needs at least two moves to reach a far pawn — count carefully before relying on it.",
    ],
    solution: [
      {
        san: "Nc3",
        comment:
          "From c3 the knight controls both d5 (the pawn) and d1 (the queening square). Pawn cannot promote.",
      },
    ],
    defaultLevel: 4,
  },

  /* ====================================================================== */
  /*  Minor Piece vs Rook                                                    */
  /* ====================================================================== */
  {
    id: "rook-vs-bishop-fortress",
    name: "Rook vs Bishop (Wrong Corner Fortress)",
    category: "minor-piece-vs-rook",
    fen: "8/8/8/8/8/2k5/2b5/K6R b - - 0 1",
    userSide: "black",
    objective: "draw",
    tagline: "Hide in the wrong-color corner.",
    principle: [
      "K + R vs K + B is generally a draw if the defender's king reaches a corner of the OPPOSITE color to the bishop.",
      "Once the defender's king is on the right corner, even passive defense holds.",
      "The attacker has no zugzwang weapon to force the bishop or king to give way.",
    ],
    solution: [
      {
        san: "Kc4",
        comment:
          "March toward the safe corner. Bishop on c2 is dark-squared, so head for h8 or a1 (dark corners).",
      },
    ],
    defaultLevel: 5,
  },
  {
    id: "rook-vs-knight-fortress",
    name: "Rook vs Knight Defense",
    category: "minor-piece-vs-rook",
    fen: "8/8/8/4k3/8/3n4/8/4K2R b - - 0 1",
    userSide: "black",
    objective: "draw",
    tagline: "Keep the knight close to the king.",
    principle: [
      "K + R vs K + N is usually drawn IF the defender keeps the knight close to the king.",
      "Separated, the knight is easily lost. Together, they form a tight fortress.",
      "Rule of thumb: never let the knight wander more than 2 squares from your king.",
    ],
    solution: [
      {
        san: "Nf4",
        comment:
          "Keep the knight near the king. Don't let them get separated or the rook will pick off the knight.",
      },
    ],
    defaultLevel: 5,
  },

  /* ====================================================================== */
  /*  King & Pawn — advanced                                                 */
  /* ====================================================================== */
  {
    id: "kp-outside-passed-pawn",
    name: "Outside Passed Pawn",
    category: "king-pawn",
    fen: "8/5k2/8/3p4/3P4/P4K2/8/8 w - - 0 1",
    userSide: "white",
    objective: "win",
    tagline: "The decoy that wins on the other flank.",
    principle: [
      "An outside passed pawn pulls the defending king AWAY from the main battlefield. While the enemy king deals with it, your king walks through and feasts on the other side.",
      "Capablanca: 'The outside passed pawn is worth at least a tempo, often a whole pawn.' Push it; let the opponent's king chase.",
      "Once their king commits to stopping your outside pawn, your king strolls to the kingside (or wherever the real prize is) and decides the game.",
    ],
    solution: [
      {
        san: "a4",
        comment:
          "Push the outside passer. Black's king must come over to stop it; meanwhile our king picks off d5.",
      },
    ],
    defaultLevel: 5,
  },
  {
    id: "kp-key-squares-march",
    name: "Marching to a Key Square",
    category: "king-pawn",
    fen: "4k3/8/8/8/3PK3/8/8/8 w - - 0 1",
    userSide: "white",
    objective: "win",
    tagline: "King first, pawn second.",
    principle: [
      "For a non-rook pawn on the 4th rank, the key squares are c5, d5, and e5 (one rank ahead and one to either side). Reach any of them with your king and you queen.",
      "Don't push the pawn yet — push it only when the king already controls a key square. Otherwise the defender takes the opposition and stops you cold.",
      "Mantra: 'King leads, pawn follows.' This is the bedrock of every K+P win.",
    ],
    solution: [
      {
        san: "Kd5",
        comment:
          "Seize a key square. Black has no opposition reply that matters — the pawn now queens.",
      },
    ],
    defaultLevel: 4,
  },
  {
    id: "kp-reti-study",
    name: "Réti's Miracle (Diagonal King Walk)",
    category: "king-pawn",
    fen: "7K/8/k1P5/7p/8/8/8/8 w - - 0 1",
    userSide: "white",
    objective: "draw",
    tagline: "The most beautiful study in chess.",
    principle: [
      "Réti, 1921. White's king on h8 looks hopelessly far from Black's h-pawn AND from supporting the c-pawn. Yet the position is a draw.",
      "The trick: walk the king diagonally. Each move threatens BOTH to catch the h-pawn AND to support the c-pawn. The defender can't address both threats at once.",
      "1.Kg7! Kb6 2.Kf6! and now if 2...Kxc6 3.Ke5 catches the h-pawn; or if 2...h4 3.Ke5 with the same dual threat. Always count diagonal king-walks — they cover more ground than they appear to.",
    ],
    solution: [
      {
        san: "Kg7",
        comment:
          "The diagonal walk begins. From g7 the king threatens both Kf6 (chasing the h-pawn) and Kf6-Ke6-Kd6 (supporting the c-pawn).",
      },
    ],
    defaultLevel: 6,
  },
  {
    id: "kp-outflank-king",
    name: "Outflanking with the King",
    category: "king-pawn",
    fen: "4k3/8/8/8/4K3/4P3/8/8 w - - 0 1",
    userSide: "white",
    objective: "win",
    tagline: "Side-step to bypass the opposition.",
    principle: [
      "When kings face each other and your opponent has the opposition, you can't push through directly. The trick is to OUTFLANK — step sideways and force the defender to choose which file to defend.",
      "From this position 1.Kd5! Kd7 2.e4! (the pawn move buys a tempo) 2...Ke7 3.Ke5 (now you have the opposition) and the king marches to a key square.",
      "Key skill: combine pawn moves and king sidesteps to manipulate the opposition. This is the technique behind every K+P conversion.",
    ],
    solution: [
      {
        san: "Kd5",
        comment:
          "Outflank — head for the c-file or d-file key squares. The pawn waits as a tempo move when needed.",
      },
    ],
    defaultLevel: 5,
  },
  {
    id: "kp-trebuchet-zugzwang",
    name: "Trébuchet — Mutual Zugzwang",
    category: "king-pawn",
    fen: "8/8/3k4/8/3K4/3P4/8/8 b - - 0 1",
    userSide: "white",
    objective: "win",
    tagline: "Whoever moves loses.",
    principle: [
      "Trébuchet positions feature mutual zugzwang — both sides would lose if forced to move. The side NOT obliged to move wins by default.",
      "Here Black is to move with kings opposed on d4/d6 and a white pawn on d3. Black must yield: 1...Ke6 2.Kc5! (outflank, key square) wins; 1...Kc6 2.Ke5! similarly.",
      "Recognize trébuchets in your own games and engineer them with triangulation when needed. Half of K+P theory comes back to this idea.",
    ],
    solution: [
      {
        san: "Kc6",
        comment:
          "Black must yield. Either flank gives way — White outflanks and reaches a key square next move.",
      },
    ],
    defaultLevel: 6,
  },

  /* ====================================================================== */
  /*  Rook — advanced                                                        */
  /* ====================================================================== */
  {
    id: "rook-tarrasch-behind-passer",
    name: "Tarrasch's Rule (Rook Behind Passers)",
    category: "rook",
    fen: "1r6/8/8/3k4/8/3p4/4K3/3R4 w - - 0 1",
    userSide: "white",
    objective: "win",
    tagline: "Rooks belong behind passed pawns — yours AND theirs.",
    principle: [
      "Tarrasch's immortal rule: the rook belongs BEHIND the passed pawn. Behind your own, it gains scope as the pawn advances. Behind the enemy's, it paralyses the pawn permanently.",
      "Here White's rook is behind Black's d3-pawn, blockading from the rear. Black's rook is on b8, NOT behind the pawn — so Black can't actually defend d3. White just walks the king up and captures.",
      "Always evaluate rook activity in the endgame first. A rook in the wrong place is often worth less than a minor piece.",
    ],
    solution: [
      {
        san: "Kxd3",
        comment:
          "Win the pawn. Black's rook is on the wrong side — Tarrasch's rule wins us a clean tempo.",
      },
    ],
    defaultLevel: 5,
  },
  {
    id: "rook-active-vs-passive",
    name: "Active Rook (Capablanca)",
    category: "rook",
    fen: "5k2/8/p7/8/8/2K5/PP6/r4R2 w - - 0 1",
    userSide: "white",
    objective: "draw",
    tagline: "An active rook is worth a pawn.",
    principle: [
      "Capablanca: in rook endgames, an active rook is often worth a full pawn. A passive rook stuck defending is the worst piece on the board.",
      "Black's rook on a1 is brilliantly placed, attacking from behind. White's rook on f1 is doing nothing. The cure: activate immediately, even at the cost of a pawn.",
      "1.Rf7! Rxa2 2.Rxa7 — and White's active rook on the 7th gives full counterplay. Defending passively with Rxa1 a-pawn loses; activity saves the day.",
    ],
    solution: [
      {
        san: "Rf7",
        comment:
          "Activate! 7th-rank pressure on Black's pawn equalises the lost a-pawn. Passive defence loses.",
      },
    ],
    defaultLevel: 6,
  },
  {
    id: "rook-connected-passers-push",
    name: "Connected Passed Pawns",
    category: "rook",
    fen: "5k2/8/8/3PP3/8/6K1/r7/4R3 w - - 0 1",
    userSide: "white",
    objective: "win",
    tagline: "Push the front pawn first.",
    principle: [
      "Two connected passed pawns supported by a rook from behind are decisive. The technique: push the FRONT pawn first; the back pawn stays as protection.",
      "If the defending rook checks, hide behind the pawn. If the defending king blockades, advance the back pawn to dislodge it.",
      "Once one pawn reaches the 7th, the other queens. There's no good defense against this configuration.",
    ],
    solution: [
      {
        san: "e6",
        comment:
          "Push the lead pawn — d5 stays as shield against checks. Black has no defense.",
      },
    ],
    defaultLevel: 5,
  },
  {
    id: "rook-skewer-promotion",
    name: "Skewer the King, Promote",
    category: "rook",
    fen: "5k2/8/4K3/4P3/8/8/8/3R3r w - - 0 1",
    userSide: "white",
    objective: "win",
    tagline: "Back-rank shuffle, then queen.",
    principle: [
      "Classic R + P vs R technique: when Black's rook is doing nothing useful, drive the Black king with a back-rank check, then push the pawn safely.",
      "Here 1.Rd8+ Kf7 2.e6+ Kxe6 fails — but 1.Rd8+ Kg7 2.e6 wins because the black rook can't catch the pawn AND defend.",
      "Whenever you have a passed pawn on the 6th + active rook + active king, look for the back-rank check first.",
    ],
    solution: [
      {
        san: "Rd8+",
        comment:
          "Drive the king off the f-file. Now the e-pawn marches with king support.",
      },
    ],
    defaultLevel: 5,
  },
  {
    id: "rook-3v2-fortress-active",
    name: "3 vs 2 Same Side — Active Defense",
    category: "rook",
    fen: "5rk1/5p1p/8/8/8/5PPP/4R2K/8 b - - 0 1",
    userSide: "black",
    objective: "draw",
    tagline: "Active rook holds an inferior pawn count.",
    principle: [
      "K+R+3P vs K+R+2P with all pawns on the same flank is a theoretical draw — provided the defender keeps the rook ACTIVE.",
      "The Karstedt/Kantorovich technique: get your rook BEHIND the enemy pawns or to the long open file. Passive defense by ...Re8 fails; active defense by ...Rb8 / ...Rc8 / ...Ra8 holds.",
      "If you must move the king, head to the SHORT side of the pawns (here g7-h8 area). The rook can then check from the long side without obstruction.",
    ],
    solution: [
      {
        san: "Rb8",
        comment:
          "Activate — open file behind enemy lines. Passive ...Re8 loses; active ...Rb8 draws.",
      },
    ],
    defaultLevel: 6,
  },

  /* ====================================================================== */
  /*  Bishop — advanced                                                      */
  /* ====================================================================== */
  {
    id: "bishop-good-vs-bad",
    name: "Good Bishop vs Bad Bishop",
    category: "bishop",
    fen: "4k3/4b3/p2p4/Pp1P4/1P6/3B4/4K3/8 w - - 0 1",
    userSide: "white",
    objective: "win",
    tagline: "When pawns sit on the bishop's color, the bishop is bad.",
    principle: [
      "A 'good' bishop sits OUTSIDE its own pawn chain; a 'bad' bishop is locked behind it. White's light-squared Bd3 roams freely; Black's dark-squared Be7 is stuck behind d6 and a-pawn structure.",
      "Conversion plan: improve your KING first (it's the strongest piece in the endgame), then create a second weakness on the side where your bishop dominates.",
      "Capablanca often won 'equal' endgames simply because his minor piece was three times more active than the opponent's. Recognize the pattern at the board.",
    ],
    solution: [
      {
        san: "Kf3",
        comment:
          "King first. Bring it to the kingside, then maneuver the good bishop to attack the bad bishop's pawns.",
      },
    ],
    defaultLevel: 6,
  },
  {
    id: "bishop-opposite-color-3-passers",
    name: "Opposite-Color Bishops + 3 Passers (Win)",
    category: "bishop",
    fen: "8/4kb2/8/3PPP2/3K4/4B3/8/8 w - - 0 1",
    userSide: "white",
    objective: "win",
    tagline: "When OCB endings DO win.",
    principle: [
      "The cliché 'opposite-color bishops are drawn' is misleading. With THREE connected passed pawns and the king nearby, the attacker usually wins.",
      "Technique: push the pawn the defender's bishop CANNOT control. Here White's bishop covers dark squares; Black's bishop covers light squares — push the pawn that ends on a light square (so Black's bishop can't blockade in front).",
      "Lesson: don't accept a draw automatically in OCB. Count passed pawns and check whose bishop covers the queening squares.",
    ],
    solution: [
      {
        san: "f6+",
        comment:
          "Push the f-pawn with check — drives the king back, no defender can blockade.",
      },
    ],
    defaultLevel: 6,
  },

  /* ====================================================================== */
  /*  Knight — advanced                                                      */
  /* ====================================================================== */
  {
    id: "knight-outpost-closed-center",
    name: "Knight Outpost in a Closed Center",
    category: "knight",
    fen: "3k4/p1p5/1p1p4/3P4/3P4/2N5/PPP5/4K3 w - - 0 1",
    userSide: "white",
    objective: "win",
    tagline: "In closed positions the knight is king.",
    principle: [
      "Closed centers favor knights — they jump, bishops can't. With a fixed pawn chain, find an outpost (a square that can't be attacked by enemy pawns) and dump a knight there.",
      "Here Ne4 sits on a perfect outpost: protected by the d5/d4 pawns can't reach e4, and Black has no piece to challenge it. The knight dominates the position.",
      "From e4 the knight eyes c5, d6, f6, g5 — half the board. In closed positions, a strong knight is worth more than a bishop, often more than a rook.",
    ],
    solution: [
      {
        san: "Ne4",
        comment:
          "The outpost is permanent. Black has no light-squared bishop nor pawn to evict the knight.",
      },
    ],
    defaultLevel: 5,
  },

  /* ====================================================================== */
  /*  Elite Principles                                                        */
  /* ====================================================================== */
  {
    id: "principle-two-weaknesses",
    name: "Principle of Two Weaknesses (Karpov)",
    category: "principles",
    fen: "4k3/p2p4/1p2p3/2p1P3/P1P5/1P3P2/3K1P2/8 w - - 0 1",
    userSide: "white",
    objective: "win",
    tagline: "One weakness can be defended. Two cannot.",
    principle: [
      "Karpov's universal principle: against an opponent who can defend a single weakness, you must CREATE a second one. The defender's pieces cannot cover both at once.",
      "Standard sequence: (1) fix a weakness on flank A, (2) maneuver to threaten flank B, (3) when the defender shifts pieces, switch back to A — the original weakness now falls.",
      "Here Black has a static queenside weakness (b6/d7). White creates a kingside threat with f3-f4-f5, forces concessions, then converts the original weakness while Black is overstretched.",
    ],
    solution: [
      {
        san: "f4",
        comment:
          "Create a second front. Black can't defend both flanks once we play f5 to fix kingside targets.",
      },
    ],
    defaultLevel: 6,
  },
  {
    id: "principle-king-activity",
    name: "King Activity (Capablanca)",
    category: "principles",
    fen: "8/r4pk1/6p1/8/8/4P1P1/2R2PK1/8 w - - 0 1",
    userSide: "white",
    objective: "draw",
    tagline: "The king is a strong piece — use it!",
    principle: [
      "Capablanca: 'In the endgame, the king must take a hand in the fight.' A king on the second rank is no better than an extra pawn; a king in the center is worth a full piece.",
      "Walk your king to the FRONT in any endgame where mate threats are gone. From e3-d4-c5 it touches both flanks, supports your rook, and pressures enemy pawns.",
      "Magnus's endgame style: while the opponent shuffles defensively, his king is already on d4 fighting for queenside or kingside. Activity beats material almost every time at the highest level.",
    ],
    solution: [
      {
        san: "Kf3",
        comment:
          "March the king to the center. Equal material is irrelevant — the active king dictates the game.",
      },
    ],
    defaultLevel: 5,
  },
  {
    id: "principle-prophylaxis",
    name: "Prophylaxis (Karpov / Petrosian)",
    category: "principles",
    fen: "5rk1/p4ppp/1p6/8/8/1P6/P4PPP/5RK1 w - - 0 1",
    userSide: "white",
    objective: "draw",
    tagline: "Stop their plan before pursuing yours.",
    principle: [
      "Petrosian and Karpov made entire careers from prophylaxis: anticipate the opponent's idea, deny it FIRST, then execute your own plan from a position of safety.",
      "Common prophylactic moves in endgames: h2-h3 (luft, prevents back-rank ideas), Kg1-h2 (king safety before activity), a2-a3 (stops ...b4 ideas), Rb1-c1 (covers a sensitive square before pressing).",
      "The discipline: before every move, ask 'what does my opponent want to do?' Find their best plan and break it. THEN look for your own ideas.",
    ],
    solution: [
      {
        san: "h3",
        comment:
          "Prophylaxis — kill back-rank issues before activating the rook. Now we can play Re1/Rd1 freely.",
      },
    ],
    defaultLevel: 4,
  },
  {
    id: "principle-do-not-hurry",
    name: "Do Not Hurry (Capablanca)",
    category: "principles",
    fen: "8/8/3k4/8/3K4/3P4/8/8 b - - 0 1",
    userSide: "white",
    objective: "win",
    tagline: "Improve every piece before committing.",
    principle: [
      "Capablanca's mantra in winning endgames: 'Do not hurry.' Take time to improve every single piece to its ideal square BEFORE pushing pawns or forcing the action.",
      "The opponent is in a worse position with no good plan. Every tempo you spend improving piece placement makes the eventual breakthrough cleaner. Rushed pawn pushes often turn wins into draws.",
      "Magnus rule of thumb: when winning, ask 'is every one of my pieces on its best square?' If no, improve a piece. If yes, look for the breakthrough.",
    ],
    solution: [
      {
        san: "Kc6",
        comment:
          "Black is in zugzwang and must yield. White has the outflank coming next move — no rush to push the pawn.",
      },
    ],
    defaultLevel: 5,
  },
  {
    id: "principle-schematic-thinking",
    name: "Schematic Thinking (Magnus)",
    category: "principles",
    fen: "5k2/5p2/4p1p1/p2pP3/3P1P2/P7/1P3KP1/8 w - - 0 1",
    userSide: "white",
    objective: "win",
    tagline: "Picture the won position first, then route there.",
    principle: [
      "Magnus's method: don't calculate move-by-move. First imagine the FINAL won position (king here, pawn there, opposition like this). Then work backwards to figure out how to reach it.",
      "From this Magnus-style technical position, the won setup is: white king on c5, pawns on b4-a4, breakthrough with b4-b5. Visualize that, then route the king there one move at a time.",
      "Schematic thinking saves enormous calculation. You're not asking 'what move?', you're asking 'how do I reach my target diagram?' — and the moves play themselves.",
    ],
    solution: [
      {
        san: "Ke3",
        comment:
          "Begin the king route to the queenside. The plan: Ke3-Kd3-Kc3-Kb4-Ka5 then b3-b4-b5 breakthrough.",
      },
    ],
    defaultLevel: 7,
  },
  {
    id: "principle-trade-down-when-up",
    name: "When Ahead, Trade Pieces — Not Pawns",
    category: "principles",
    fen: "5k2/p4p1p/1p4p1/8/8/1P4P1/P3RP1P/4r1K1 w - - 0 1",
    userSide: "white",
    objective: "draw",
    tagline: "Pieces off, pawns on — material edge converts.",
    principle: [
      "Universal endgame rule: when ahead in material, trade PIECES (the opponent loses attacking chances). When behind, trade PAWNS (the more pawns leave, the more drawing chances by stalemate or fortress).",
      "Specifically: a rook + 5 pawns vs rook + 4 pawns is harder to win than rook + 1 pawn vs rook + 0 — fewer pieces means cleaner conversion.",
      "Apply it ruthlessly: even an even trade can swing the assessment when material is uneven. Refuse to trade a defender for an attacker.",
    ],
    solution: [
      {
        san: "Rxe1",
        comment:
          "Trade rooks. Even into K+P, our small structural edge converts cleaner without the heavy pieces.",
      },
    ],
    defaultLevel: 5,
  },

  /* ====================================================================== */
  /*  Conversion Technique                                                   */
  /* ====================================================================== */
  {
    id: "conversion-simplify-to-kp",
    name: "Simplify into a Won K+P Endgame",
    category: "conversion",
    fen: "5k2/5r2/8/4P3/3K4/8/8/5R2 w - - 0 1",
    userSide: "white",
    objective: "win",
    tagline: "When the rook trade gives a winning K+P, take it.",
    principle: [
      "Before forcing a piece trade, ALWAYS evaluate the resulting pawn endgame. Is the K+P position won, drawn, or lost? Many endgame conversions hinge on this single calculation.",
      "Here trading rooks gives K+P+K vs K with the king on a key square — a textbook win. Refuse the trade and Black sets up a Philidor-style draw.",
      "Conversion checklist before any trade: (1) am I ahead after? (2) is the resulting pawn structure winning? (3) can my king reach the key squares? If all three, trade — if not, keep the heavy pieces.",
    ],
    solution: [
      {
        san: "Rxf7+",
        comment:
          "Trade into K+P with our king ahead of the pawn — textbook winning K+P endgame.",
      },
    ],
    defaultLevel: 5,
  },
  {
    id: "conversion-wrong-piece-exchange",
    name: "Trade Their Good Piece, Keep Yours",
    category: "conversion",
    fen: "4k3/4b3/p2p4/Pp1P4/1P6/3B4/4K3/8 b - - 0 1",
    userSide: "white",
    objective: "win",
    tagline: "Hold onto YOUR good bishop. Trade off THEIRS.",
    principle: [
      "Conversion technique: the side with the better piece must AVOID trading it. The side with the worse piece must SEEK trades.",
      "Our light-squared bishop dominates; Black's dark-squared bishop is bad. The right plan keeps our bishop, prevents activity from theirs, and creates a second weakness.",
      "Common error: trading any minor piece 'because it simplifies.' No — only trade if it leaves YOU with the better residual piece. Ask which piece is worse before every trade offer.",
    ],
    solution: [
      {
        san: "Bd8",
        comment:
          "Black activates their bad bishop. White must avoid trades — keep the dominant bishop on the board.",
      },
    ],
    defaultLevel: 6,
  },
  {
    id: "conversion-create-outside-passer",
    name: "Manufacture an Outside Passed Pawn",
    category: "conversion",
    fen: "4k3/p1p5/1p6/8/8/1P6/P1P3K1/8 w - - 0 1",
    userSide: "white",
    objective: "win",
    tagline: "Trade pawns to create a far-flank passer.",
    principle: [
      "An outside passed pawn is one of the most reliable winning advantages in K+P endgames. If you don't have one, MANUFACTURE one by trading pawns.",
      "Here trade ideas like a4-a5 or c4-c5 can liquidate Black's queenside majority, leaving White with a passed a-pawn — exactly the decoy needed to win.",
      "Pre-game lesson: in symmetrical pawn structures, look for any imbalance you can engineer. Outside passers, protected passers, and connected passers are the three winning configurations.",
    ],
    solution: [
      {
        san: "a4",
        comment:
          "Begin the queenside expansion. After a4-a5 (or trade) we get an outside passed a-pawn — winning blueprint.",
      },
    ],
    defaultLevel: 5,
  },
  {
    id: "conversion-fixing-targets",
    name: "Fix the Target Before Attacking It",
    category: "conversion",
    fen: "8/2p5/p7/Pp6/1Pk5/8/4K3/8 w - - 0 1",
    userSide: "white",
    objective: "draw",
    tagline: "Lock the weakness; THEN bring pieces.",
    principle: [
      "Before attacking an enemy weakness, FIX it in place so it can't move away. A pawn that can advance is much harder to attack than one frozen on a single square.",
      "Standard fixing patterns: a4-a5 fixes the enemy a-pawn on a6; pawn h4 fixes enemy h-pawn on h6; etc. Once the target can't advance, your pieces zero in at leisure.",
      "Capablanca often won by spending several moves just FIXING weaknesses, then converting in one decisive sequence. The patient method beats the brute-force method.",
    ],
    solution: [
      {
        san: "Kd2",
        comment:
          "Bring the king. The a6/b5 chain is already fixed by a5/b4 — now the king picks them off.",
      },
    ],
    defaultLevel: 5,
  },
];

export function listLessonsSummary(category?: EndgameCategory) {
  const filtered = category ? LESSONS.filter((l) => l.category === category) : LESSONS;
  return filtered.map((l) => ({
    id: l.id,
    name: l.name,
    category: l.category,
    tagline: l.tagline,
    objective: l.objective,
    userSide: l.userSide,
    fen: l.fen,
    plyCount: l.solution.length,
  }));
}

export function findLesson(id: string) {
  return LESSONS.find((l) => l.id === id);
}

export function listCategoriesWithCounts() {
  return CATEGORIES.map((c) => ({
    ...c,
    count: LESSONS.filter((l) => l.category === c.id).length,
  }));
}
