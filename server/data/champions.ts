/**
 * Hall of Champions registry.
 *
 * Curated metadata for the most influential chess players in history. The
 * registry is hand-authored (vs scraped) to keep bios accurate and quotes
 * trustworthy. Each entry intentionally stays small — full game PGNs are
 * embedded only where we are confident in the moves (e.g. Morphy's Opera
 * Game). Everything else links out to external study resources.
 *
 * Extending the registry: append a new Champion at the bottom; the catalog
 * page will pick it up automatically.
 */

export type ChampionEra =
  | "romantic" // pre-1900: Morphy, Anderssen, Steinitz
  | "classical" // 1900-1935: Lasker, Capablanca, Alekhine
  | "hypermodern" // 1920-1945: Nimzowitsch, Reti, Tartakower
  | "soviet" // 1948-1991: Botvinnik through Kasparov
  | "modern" // 1990-2010: Kramnik, Anand, transition era
  | "current"; // 2010-now: Carlsen, Caruana, Nakamura, Gukesh

export type ChampionStyle =
  | "attacker"
  | "positional"
  | "tactician"
  | "endgame"
  | "universal"
  | "theorist"
  | "intuitive"
  | "prophylactic";

export interface ChampionFamousGame {
  name: string;
  opponent: string;
  year: number;
  pgn: string;
  significance?: string;
}

export interface Champion {
  id: string; // url-safe slug
  fullName: string;
  displayName: string; // e.g. "Magnus Carlsen"
  countryCode: string; // ISO 3166-1 alpha-2
  countryEmoji: string;
  born: number;
  died?: number;
  era: ChampionEra;
  peakRating: number;
  /** [start, end] years they held the world title; ongoing reign uses current year */
  worldChampionYears?: [number, number];
  /** "World Champion 1972-1975" — derived display string */
  championship?: string;
  style: ChampionStyle[];
  bio: string;
  quote?: string;
  signatureOpeningsWhite: string[];
  signatureOpeningsBlack: string[];
  /** External resources we link out to. */
  wikipediaUrl: string;
  chessgamesUrl?: string;
  lichessUsername?: string; // for living players; powers "Scout live"
  chesscomUsername?: string;
  /** Wikipedia Commons file URL. Use Special:FilePath to avoid CDN drift. */
  photoUrl?: string;
  /** Iconic games we can play through. Keep accurate; verify before adding. */
  famousGames?: ChampionFamousGame[];
}

export const CHAMPIONS: Champion[] = [
  /* ============== Romantic Era ============== */
  {
    id: "morphy",
    fullName: "Paul Charles Morphy",
    displayName: "Paul Morphy",
    countryCode: "US",
    countryEmoji: "🇺🇸",
    born: 1837,
    died: 1884,
    era: "romantic",
    peakRating: 2690, // historical estimate (Chessmetrics)
    style: ["attacker", "tactician", "intuitive"],
    bio: "American prodigy who dominated 1850s European chess and is widely considered the unofficial world champion of his era. His blend of rapid development, open lines, and lethal tactics still defines romantic-era classics.",
    quote: "Help your pieces so they can help you.",
    signatureOpeningsWhite: ["Italian Game", "Evans Gambit", "King's Gambit"],
    signatureOpeningsBlack: ["Two Knights Defense", "Philidor Defense"],
    wikipediaUrl: "https://en.wikipedia.org/wiki/Paul_Morphy",
    chessgamesUrl: "https://www.chessgames.com/player/paul_morphy.html",
    photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/45/Paul_Morphy.jpg/220px-Paul_Morphy.jpg",
    famousGames: [
      {
        name: "Opera Game",
        opponent: "Duke Karl & Count Isouard",
        year: 1858,
        significance:
          "Played in a Paris opera box during a performance of Norma. A textbook lesson in development, open lines, and ruthless attack — finished in 17 moves.",
        pgn: `[Event "Paris Opera"]
[Site "Paris FRA"]
[Date "1858.??.??"]
[White "Paul Morphy"]
[Black "Duke Karl / Count Isouard"]
[Result "1-0"]

1.e4 e5 2.Nf3 d6 3.d4 Bg4 4.dxe5 Bxf3 5.Qxf3 dxe5 6.Bc4 Nf6 7.Qb3 Qe7
8.Nc3 c6 9.Bg5 b5 10.Nxb5 cxb5 11.Bxb5+ Nbd7 12.O-O-O Rd8 13.Rxd7 Rxd7
14.Rd1 Qe6 15.Bxd7+ Nxd7 16.Qb8+ Nxb8 17.Rd8# 1-0`,
      },
    ],
  },

  /* ============== Classical Era — World Champions ============== */
  {
    id: "steinitz",
    fullName: "Wilhelm Steinitz",
    displayName: "Wilhelm Steinitz",
    countryCode: "AT",
    countryEmoji: "🇦🇹",
    born: 1836,
    died: 1900,
    era: "classical",
    peakRating: 2650,
    worldChampionYears: [1886, 1894],
    championship: "1st World Champion (1886–1894)",
    style: ["positional", "theorist", "prophylactic"],
    bio: "First officially recognized World Champion and the father of modern positional chess. His systematic theory of accumulating small advantages overturned the romantic 'attack at all costs' style.",
    quote: "The king is a strong piece — use it!",
    signatureOpeningsWhite: ["Steinitz's Italian", "Vienna Game"],
    signatureOpeningsBlack: ["Steinitz Defense (Ruy Lopez)", "French Defense"],
    wikipediaUrl: "https://en.wikipedia.org/wiki/Wilhelm_Steinitz",
    chessgamesUrl: "https://www.chessgames.com/player/wilhelm_steinitz.html",
    photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/85/Wilhelm_Steinitz2.jpg/220px-Wilhelm_Steinitz2.jpg",
  },
  {
    id: "lasker",
    fullName: "Emanuel Lasker",
    displayName: "Emanuel Lasker",
    countryCode: "DE",
    countryEmoji: "🇩🇪",
    born: 1868,
    died: 1941,
    era: "classical",
    peakRating: 2720,
    worldChampionYears: [1894, 1921],
    championship: "2nd World Champion (1894–1921, 27 years)",
    style: ["universal", "tactician", "endgame"],
    bio: "Held the World Championship for 27 years — the longest reign in chess history. A pragmatic universalist and mathematician who won by playing the move best suited to defeat the player in front of him.",
    quote: "When you see a good move, look for a better one.",
    signatureOpeningsWhite: ["Ruy Lopez", "Queen's Gambit"],
    signatureOpeningsBlack: ["Lasker Defense (QGD)", "Lasker's Variation (Ruy Lopez)"],
    wikipediaUrl: "https://en.wikipedia.org/wiki/Emanuel_Lasker",
    chessgamesUrl: "https://www.chessgames.com/player/emanuel_lasker.html",
    photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/Emanuel_Lasker_1925.jpg/220px-Emanuel_Lasker_1925.jpg",
  },
  {
    id: "capablanca",
    fullName: "José Raúl Capablanca",
    displayName: "José Raúl Capablanca",
    countryCode: "CU",
    countryEmoji: "🇨🇺",
    born: 1888,
    died: 1942,
    era: "classical",
    peakRating: 2725,
    worldChampionYears: [1921, 1927],
    championship: "3rd World Champion (1921–1927)",
    style: ["positional", "endgame", "intuitive"],
    bio: "The 'Chess Machine' — Capablanca's natural feel for position and crystalline endgame technique made him almost untouchable in his prime. Lost only 36 tournament games in his entire career.",
    quote: "You may learn much more from a game you lose than from a game you win.",
    signatureOpeningsWhite: ["Queen's Gambit", "Capablanca Variation (QGD)"],
    signatureOpeningsBlack: ["Queen's Gambit Declined", "Capablanca Variation (Caro-Kann)"],
    wikipediaUrl: "https://en.wikipedia.org/wiki/Jos%C3%A9_Ra%C3%BAl_Capablanca",
    chessgamesUrl: "https://www.chessgames.com/player/jose_raul_capablanca.html",
    photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d5/Jos%C3%A9_Ra%C3%BAl_Capablanca_1931.jpg/220px-Jos%C3%A9_Ra%C3%BAl_Capablanca_1931.jpg",
  },
  {
    id: "alekhine",
    fullName: "Alexander Alekhine",
    displayName: "Alexander Alekhine",
    countryCode: "FR",
    countryEmoji: "🇫🇷",
    born: 1892,
    died: 1946,
    era: "classical",
    peakRating: 2690,
    worldChampionYears: [1927, 1946],
    championship: "4th World Champion (1927–1935, 1937–1946)",
    style: ["attacker", "tactician", "universal"],
    bio: "Russian-French combinational genius. Defeated Capablanca to take the title and is the only world champion to have died holding it. Famous for deep middlegame combinations and the opening that bears his name.",
    quote: "Chess is not only knowledge and logic.",
    signatureOpeningsWhite: ["Queen's Gambit", "Ruy Lopez"],
    signatureOpeningsBlack: ["Alekhine's Defense", "King's Indian Defense"],
    wikipediaUrl: "https://en.wikipedia.org/wiki/Alexander_Alekhine",
    chessgamesUrl: "https://www.chessgames.com/player/alexander_alekhine.html",
    photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6a/Alexander_Alekhine.jpg/220px-Alexander_Alekhine.jpg",
  },
  {
    id: "nimzowitsch",
    fullName: "Aron Nimzowitsch",
    displayName: "Aron Nimzowitsch",
    countryCode: "LV",
    countryEmoji: "🇱🇻",
    born: 1886,
    died: 1935,
    era: "hypermodern",
    peakRating: 2640,
    style: ["theorist", "prophylactic", "positional"],
    bio: "Father of the Hypermodern school. His 'My System' redefined chess thinking around prophylaxis, blockade, and pawn-chain theory — concepts still drilled into every serious player today.",
    quote: "The threat is stronger than the execution.",
    signatureOpeningsWhite: ["Nimzo-Larsen Attack (1.b3)"],
    signatureOpeningsBlack: ["Nimzo-Indian Defense", "Nimzowitsch Defense"],
    wikipediaUrl: "https://en.wikipedia.org/wiki/Aron_Nimzowitsch",
    chessgamesUrl: "https://www.chessgames.com/player/aron_nimzowitsch.html",
    photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d7/Nimzowitch.jpg/220px-Nimzowitch.jpg",
  },

  /* ============== Soviet Era ============== */
  {
    id: "botvinnik",
    fullName: "Mikhail Botvinnik",
    displayName: "Mikhail Botvinnik",
    countryCode: "RU",
    countryEmoji: "🇷🇺",
    born: 1911,
    died: 1995,
    era: "soviet",
    peakRating: 2740,
    worldChampionYears: [1948, 1963],
    championship: "6th World Champion (1948–1957, 1958–1960, 1961–1963)",
    style: ["positional", "theorist", "prophylactic"],
    bio: "Patriarch of the Soviet Chess School and pioneer of computer chess. Approached chess as a science — extensive home preparation, deep opening research, and ruthless self-analysis became the modern norm because of him.",
    quote: "Chess is the art of analysis.",
    signatureOpeningsWhite: ["English Opening", "Queen's Gambit"],
    signatureOpeningsBlack: ["Botvinnik Variation (Slav)", "Caro-Kann Defense"],
    wikipediaUrl: "https://en.wikipedia.org/wiki/Mikhail_Botvinnik",
    chessgamesUrl: "https://www.chessgames.com/player/mikhail_botvinnik.html",
    photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/Mikhail_Botvinnik_1962.jpg/220px-Mikhail_Botvinnik_1962.jpg",
  },
  {
    id: "smyslov",
    fullName: "Vasily Smyslov",
    displayName: "Vasily Smyslov",
    countryCode: "RU",
    countryEmoji: "🇷🇺",
    born: 1921,
    died: 2010,
    era: "soviet",
    peakRating: 2730,
    worldChampionYears: [1957, 1958],
    championship: "7th World Champion (1957–1958)",
    style: ["positional", "endgame", "intuitive"],
    bio: "Champion of harmony — his pieces always seemed to play together. Reached the Candidates Final at age 63. A trained operatic baritone whose chess shared the same melodic sensibility.",
    quote: "I will tell you my secret: I always try to find the truth in the position.",
    signatureOpeningsWhite: ["English Opening", "Réti Opening"],
    signatureOpeningsBlack: ["Slav Defense", "Grünfeld Defense"],
    wikipediaUrl: "https://en.wikipedia.org/wiki/Vasily_Smyslov",
    chessgamesUrl: "https://www.chessgames.com/player/vassily_smyslov.html",
    photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ed/Vasily_Smyslov_1960.jpg/220px-Vasily_Smyslov_1960.jpg",
  },
  {
    id: "tal",
    fullName: "Mikhail Tal",
    displayName: "Mikhail Tal",
    countryCode: "LV",
    countryEmoji: "🇱🇻",
    born: 1936,
    died: 1992,
    era: "soviet",
    peakRating: 2705,
    worldChampionYears: [1960, 1961],
    championship: "8th World Champion (1960–1961)",
    style: ["attacker", "tactician", "intuitive"],
    bio: "The 'Magician from Riga' — youngest world champion at the time (23) and the most fearsome attacker chess has ever seen. His sacrifices were so deep even computers struggle to refute them.",
    quote:
      "You must take your opponent into a deep dark forest where 2+2=5, and the path leading out is only wide enough for one.",
    signatureOpeningsWhite: ["King's Indian Attack", "Sicilian (with white)"],
    signatureOpeningsBlack: ["King's Indian Defense", "Modern Benoni"],
    wikipediaUrl: "https://en.wikipedia.org/wiki/Mikhail_Tal",
    chessgamesUrl: "https://www.chessgames.com/player/mikhail_tal.html",
    photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Mikhail_Tal_1982.jpg/220px-Mikhail_Tal_1982.jpg",
  },
  {
    id: "petrosian",
    fullName: "Tigran Petrosian",
    displayName: "Tigran Petrosian",
    countryCode: "AM",
    countryEmoji: "🇦🇲",
    born: 1929,
    died: 1984,
    era: "soviet",
    peakRating: 2700,
    worldChampionYears: [1963, 1969],
    championship: "9th World Champion (1963–1969)",
    style: ["prophylactic", "positional", "endgame"],
    bio: "'Iron Tigran' — virtually impossible to defeat. Ten-time Soviet champion and the supreme master of prophylaxis: he saw the opponent's plan before they did and quietly neutralized it.",
    quote: "Chess is a game by its form, an art by its content and a science by the difficulty of gaining mastery in it.",
    signatureOpeningsWhite: ["English Opening", "Queen's Gambit"],
    signatureOpeningsBlack: ["French Defense", "Caro-Kann Defense", "King's Indian Defense"],
    wikipediaUrl: "https://en.wikipedia.org/wiki/Tigran_Petrosian",
    chessgamesUrl: "https://www.chessgames.com/player/tigran_petrosian.html",
    photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/03/Tigran_Petrosian_World_Chess_Champion.jpg/220px-Tigran_Petrosian_World_Chess_Champion.jpg",
  },
  {
    id: "spassky",
    fullName: "Boris Spassky",
    displayName: "Boris Spassky",
    countryCode: "RU",
    countryEmoji: "🇷🇺",
    born: 1937,
    died: 2025,
    era: "soviet",
    peakRating: 2690,
    worldChampionYears: [1969, 1972],
    championship: "10th World Champion (1969–1972)",
    style: ["universal", "attacker"],
    bio: "The first true universalist — equally dangerous in tactical King's Gambits and quiet positional grinds. Famous for losing the 'Match of the Century' to Fischer in 1972.",
    quote: "When you play against Bobby, it is not a question of whether you win or lose. It is a question of whether you survive.",
    signatureOpeningsWhite: ["King's Gambit", "Ruy Lopez"],
    signatureOpeningsBlack: ["Marshall Attack", "King's Indian Defense"],
    wikipediaUrl: "https://en.wikipedia.org/wiki/Boris_Spassky",
    chessgamesUrl: "https://www.chessgames.com/player/boris_spassky.html",
    photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Bundesarchiv_Bild_183-76052-0335%2C_Schacholympiade%2C_Boris_Spasski.jpg/220px-Bundesarchiv_Bild_183-76052-0335%2C_Schacholympiade%2C_Boris_Spasski.jpg",
  },
  {
    id: "fischer",
    fullName: "Robert James Fischer",
    displayName: "Bobby Fischer",
    countryCode: "US",
    countryEmoji: "🇺🇸",
    born: 1943,
    died: 2008,
    era: "soviet",
    peakRating: 2785,
    worldChampionYears: [1972, 1975],
    championship: "11th World Champion (1972–1975)",
    style: ["universal", "attacker", "tactician"],
    bio: "American genius who single-handedly broke Soviet dominance. Crushed Spassky 12.5–8.5 in Reykjavík 1972 in the most famous match ever played. His preparation, will to win, and mid-game precision set a new global standard.",
    quote: "I don't believe in psychology. I believe in good moves.",
    signatureOpeningsWhite: ["1.e4 (almost exclusively)", "Ruy Lopez"],
    signatureOpeningsBlack: ["Najdorf Sicilian", "King's Indian Defense"],
    wikipediaUrl: "https://en.wikipedia.org/wiki/Bobby_Fischer",
    chessgamesUrl: "https://www.chessgames.com/player/robert_james_fischer.html",
    photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/40/Bobby_Fischer_1960_in_Leipzig_in_color.jpg/220px-Bobby_Fischer_1960_in_Leipzig_in_color.jpg",
  },
  {
    id: "karpov",
    fullName: "Anatoly Karpov",
    displayName: "Anatoly Karpov",
    countryCode: "RU",
    countryEmoji: "🇷🇺",
    born: 1951,
    era: "soviet",
    peakRating: 2780,
    worldChampionYears: [1975, 1985],
    championship: "12th World Champion (1975–1985)",
    style: ["positional", "prophylactic", "endgame"],
    bio: "The python — Karpov squeezed opponents in slow positional vises until they cracked. Held #1 status for over a decade and won 160+ tournaments, more than any other player in history.",
    quote: "Style? I have no style.",
    signatureOpeningsWhite: ["Ruy Lopez", "Queen's Gambit"],
    signatureOpeningsBlack: ["Caro-Kann Defense", "Queen's Gambit Declined"],
    wikipediaUrl: "https://en.wikipedia.org/wiki/Anatoly_Karpov",
    chessgamesUrl: "https://www.chessgames.com/player/anatoly_karpov.html",
    photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Anatoly_Karpov_1981.jpg/220px-Anatoly_Karpov_1981.jpg",
  },
  {
    id: "kasparov",
    fullName: "Garry Kasparov",
    displayName: "Garry Kasparov",
    countryCode: "RU",
    countryEmoji: "🇷🇺",
    born: 1963,
    era: "soviet",
    peakRating: 2851,
    worldChampionYears: [1985, 2000],
    championship: "13th World Champion (1985–2000)",
    style: ["attacker", "theorist", "tactician", "universal"],
    bio: "Held the world #1 ranking for 225 of 228 months between 1986 and 2005. His legendary opening preparation, calculation, and competitive ferocity define modern professional chess. Famous for his 1997 match against IBM's Deep Blue.",
    quote: "Chess is mental torture.",
    signatureOpeningsWhite: ["1.e4", "Ruy Lopez", "Najdorf English"],
    signatureOpeningsBlack: ["Najdorf Sicilian", "King's Indian Defense", "Grünfeld Defense"],
    wikipediaUrl: "https://en.wikipedia.org/wiki/Garry_Kasparov",
    chessgamesUrl: "https://www.chessgames.com/player/garry_kasparov.html",
    photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d6/Garry_Kasparov_2007.jpg/220px-Garry_Kasparov_2007.jpg",
  },

  /* ============== Modern Era ============== */
  {
    id: "kramnik",
    fullName: "Vladimir Kramnik",
    displayName: "Vladimir Kramnik",
    countryCode: "RU",
    countryEmoji: "🇷🇺",
    born: 1975,
    era: "modern",
    peakRating: 2817,
    worldChampionYears: [2000, 2007],
    championship: "14th Classical World Champion (2000–2007)",
    style: ["positional", "theorist", "endgame", "prophylactic"],
    bio: "Defeated Kasparov in 2000 by playing the 'Berlin Wall' Ruy Lopez — Kasparov never won a single game. A deep theoretician who unified the world title in 2006.",
    quote: "Chess is similar to my native language for me.",
    signatureOpeningsWhite: ["Catalan Opening", "Ruy Lopez"],
    signatureOpeningsBlack: ["Berlin Defense (Ruy Lopez)", "Slav Defense"],
    wikipediaUrl: "https://en.wikipedia.org/wiki/Vladimir_Kramnik",
    chessgamesUrl: "https://www.chessgames.com/player/vladimir_kramnik.html",
    chesscomUsername: "VladimirKramnik",
    photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/15/Vladimir_Kramnik_at_London_Chess_Classic_2014.jpg/220px-Vladimir_Kramnik_at_London_Chess_Classic_2014.jpg",
  },
  {
    id: "anand",
    fullName: "Viswanathan Anand",
    displayName: "Viswanathan Anand",
    countryCode: "IN",
    countryEmoji: "🇮🇳",
    born: 1969,
    era: "modern",
    peakRating: 2817,
    worldChampionYears: [2007, 2013],
    championship: "15th World Champion (2000–2002 FIDE, 2007–2013 unified)",
    style: ["universal", "tactician", "intuitive"],
    bio: "'Vishy' — the Lightning Kid. India's first grandmaster and a global ambassador. Won the world title in three different formats (knockout, tournament, match) and remains a tournament force into his 50s.",
    quote: "The thing about chess is that nothing comes by itself, you have to work for everything.",
    signatureOpeningsWhite: ["1.e4", "Ruy Lopez"],
    signatureOpeningsBlack: ["Najdorf Sicilian", "Petroff Defense"],
    wikipediaUrl: "https://en.wikipedia.org/wiki/Viswanathan_Anand",
    chessgamesUrl: "https://www.chessgames.com/player/viswanathan_anand.html",
    chesscomUsername: "VishyAnand",
    photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/Viswanathan_Anand_07_14_2012_%282%29_%28cropped%29.jpg/220px-Viswanathan_Anand_07_14_2012_%282%29_%28cropped%29.jpg",
  },

  /* ============== Current Era ============== */
  {
    id: "carlsen",
    fullName: "Sven Magnus Øen Carlsen",
    displayName: "Magnus Carlsen",
    countryCode: "NO",
    countryEmoji: "🇳🇴",
    born: 1990,
    era: "current",
    peakRating: 2882,
    worldChampionYears: [2013, 2023],
    championship: "16th World Champion (2013–2023, voluntarily relinquished)",
    style: ["universal", "endgame", "intuitive", "positional"],
    bio: "Highest-rated player in chess history (2882 peak). Held the world #1 ranking continuously from 2011 onward. Famous for his uncanny endgame technique, ability to win 'drawn' positions, and modular opening play.",
    quote: "I don't really see any kind of an alternative for me, but to play the next World Championship match.",
    signatureOpeningsWhite: ["Catalan Opening", "1.e4 (varied)"],
    signatureOpeningsBlack: ["Sveshnikov Sicilian", "Nimzo-Indian Defense"],
    wikipediaUrl: "https://en.wikipedia.org/wiki/Magnus_Carlsen",
    chessgamesUrl: "https://www.chessgames.com/player/magnus_carlsen.html",
    lichessUsername: "DrNykterstein",
    chesscomUsername: "MagnusCarlsen",
    photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/Magnus_Carlsen_%2832784823993%29_%28cropped%29.jpg/220px-Magnus_Carlsen_%2832784823993%29_%28cropped%29.jpg",
  },
  {
    id: "ding",
    fullName: "Ding Liren",
    displayName: "Ding Liren",
    countryCode: "CN",
    countryEmoji: "🇨🇳",
    born: 1992,
    era: "current",
    peakRating: 2816,
    worldChampionYears: [2023, 2024],
    championship: "17th World Champion (2023–2024)",
    style: ["universal", "positional", "tactician"],
    bio: "China's first World Champion. Won the title in 2023 after Carlsen abdicated, defeating Ian Nepomniachtchi in dramatic tiebreaks. A deep, calm strategist with explosive tactical resources.",
    signatureOpeningsWhite: ["Queen's Gambit", "1.e4"],
    signatureOpeningsBlack: ["Najdorf Sicilian", "Nimzo-Indian Defense"],
    wikipediaUrl: "https://en.wikipedia.org/wiki/Ding_Liren",
    chessgamesUrl: "https://www.chessgames.com/player/ding_liren.html",
    chesscomUsername: "Ding_Liren",
    photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/06/Ding_Liren_%28cropped%29.jpg/220px-Ding_Liren_%28cropped%29.jpg",
  },
  {
    id: "gukesh",
    fullName: "Dommaraju Gukesh",
    displayName: "Gukesh Dommaraju",
    countryCode: "IN",
    countryEmoji: "🇮🇳",
    born: 2006,
    era: "current",
    peakRating: 2794,
    worldChampionYears: [2024, 2026],
    championship: "18th World Champion (2024–present, youngest ever)",
    style: ["attacker", "universal", "tactician"],
    bio: "Defeated Ding Liren in 2024 at age 18 to become the youngest world champion ever. Trained at the Westbridge–Anand Chess Academy. India's second world champion after his idol Anand.",
    signatureOpeningsWhite: ["1.d4", "Queen's Gambit"],
    signatureOpeningsBlack: ["Najdorf Sicilian", "Nimzo-Indian Defense"],
    wikipediaUrl: "https://en.wikipedia.org/wiki/Gukesh_Dommaraju",
    chessgamesUrl: "https://www.chessgames.com/player/gukesh_d.html",
    chesscomUsername: "GukeshDommaraju",
    photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e2/Gukesh_Dommaraju_2023.jpg/220px-Gukesh_Dommaraju_2023.jpg",
  },
  {
    id: "nakamura",
    fullName: "Hikaru Nakamura",
    displayName: "Hikaru Nakamura",
    countryCode: "US",
    countryEmoji: "🇺🇸",
    born: 1987,
    era: "current",
    peakRating: 2816,
    style: ["tactician", "attacker", "universal"],
    bio: "American five-time US Champion and the strongest blitz/bullet player of his generation. A streaming icon who brought millions of new fans to chess during the post-pandemic boom.",
    quote: "I just play very fast.",
    signatureOpeningsWhite: ["1.e4", "1.d4 (mixed repertoire)"],
    signatureOpeningsBlack: ["Najdorf Sicilian", "King's Indian Defense"],
    wikipediaUrl: "https://en.wikipedia.org/wiki/Hikaru_Nakamura",
    chessgamesUrl: "https://www.chessgames.com/player/hikaru_nakamura.html",
    lichessUsername: "Hikaru",
    chesscomUsername: "Hikaru",
    photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c0/Hikaru_Nakamura_-_FIDE_Candidates_Tournament_Toronto_2024.jpg/220px-Hikaru_Nakamura_-_FIDE_Candidates_Tournament_Toronto_2024.jpg",
  },
  {
    id: "caruana",
    fullName: "Fabiano Caruana",
    displayName: "Fabiano Caruana",
    countryCode: "US",
    countryEmoji: "🇺🇸",
    born: 1992,
    era: "current",
    peakRating: 2844,
    style: ["theorist", "universal", "positional"],
    bio: "Italian-American super-GM with the third-highest peak rating in history (2844). Drew his 2018 World Championship match with Carlsen 6–6 in classical play. Famously meticulous opening preparation.",
    signatureOpeningsWhite: ["1.e4", "Ruy Lopez"],
    signatureOpeningsBlack: ["Petroff Defense", "Najdorf Sicilian"],
    wikipediaUrl: "https://en.wikipedia.org/wiki/Fabiano_Caruana",
    chessgamesUrl: "https://www.chessgames.com/player/fabiano_caruana.html",
    chesscomUsername: "FabianoCaruana",
    photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/61/Fabiano_Caruana_2017.jpg/220px-Fabiano_Caruana_2017.jpg",
  },
];

export const ERA_META: Record<ChampionEra, { label: string; description: string; color: string }> = {
  romantic: { label: "Romantic", description: "Pre-1900 — open games, gambits, attack at all costs", color: "#a855f7" },
  classical: { label: "Classical", description: "1900–1935 — positional theory takes hold", color: "#3b82f6" },
  hypermodern: { label: "Hypermodern", description: "1920s–1940s — control the center from afar", color: "#14b8a6" },
  soviet: { label: "Soviet School", description: "1948–1991 — scientific preparation, deep analysis", color: "#ef4444" },
  modern: { label: "Modern", description: "1990–2010 — computers, professionalism, opening trees", color: "#f59e0b" },
  current: { label: "Current", description: "2010-now — universal style, neural networks, online era", color: "#22c55e" },
};

export const STYLE_META: Record<ChampionStyle, { label: string; color: string }> = {
  attacker: { label: "Attacker", color: "#ef4444" },
  positional: { label: "Positional", color: "#3b82f6" },
  tactician: { label: "Tactician", color: "#a855f7" },
  endgame: { label: "Endgame Maven", color: "#f59e0b" },
  universal: { label: "Universal", color: "#22c55e" },
  theorist: { label: "Theorist", color: "#14b8a6" },
  intuitive: { label: "Intuitive", color: "#ec4899" },
  prophylactic: { label: "Prophylactic", color: "#6366f1" },
};

export function listChampionsSummary(filters?: {
  era?: ChampionEra;
  style?: ChampionStyle;
  country?: string;
  worldChampionsOnly?: boolean;
  search?: string;
}) {
  let list = CHAMPIONS;
  if (filters?.era) list = list.filter((c) => c.era === filters.era);
  if (filters?.style) list = list.filter((c) => c.style.includes(filters.style!));
  if (filters?.country) list = list.filter((c) => c.countryCode === filters.country);
  if (filters?.worldChampionsOnly) list = list.filter((c) => !!c.worldChampionYears);
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    list = list.filter(
      (c) =>
        c.displayName.toLowerCase().includes(q) ||
        c.fullName.toLowerCase().includes(q) ||
        c.countryCode.toLowerCase().includes(q),
    );
  }
  return list.map((c) => ({
    id: c.id,
    displayName: c.displayName,
    countryCode: c.countryCode,
    countryEmoji: c.countryEmoji,
    born: c.born,
    died: c.died,
    era: c.era,
    peakRating: c.peakRating,
    isWorldChampion: !!c.worldChampionYears,
    championship: c.championship,
    style: c.style,
    photoUrl: c.photoUrl,
    hasLiveAccount: !!(c.lichessUsername || c.chesscomUsername),
    famousGameCount: c.famousGames?.length ?? 0,
  }));
}

export function findChampion(id: string): Champion | undefined {
  return CHAMPIONS.find((c) => c.id === id);
}

export function listEras() {
  return Object.entries(ERA_META).map(([id, meta]) => ({
    id: id as ChampionEra,
    ...meta,
    count: CHAMPIONS.filter((c) => c.era === id).length,
  }));
}

export function listStyles() {
  return Object.entries(STYLE_META).map(([id, meta]) => ({
    id: id as ChampionStyle,
    ...meta,
    count: CHAMPIONS.filter((c) => c.style.includes(id as ChampionStyle)).length,
  }));
}

export function countryLeaderboard() {
  const map = new Map<string, { code: string; emoji: string; total: number; champions: number }>();
  for (const c of CHAMPIONS) {
    const cur = map.get(c.countryCode) ?? {
      code: c.countryCode,
      emoji: c.countryEmoji,
      total: 0,
      champions: 0,
    };
    cur.total += 1;
    if (c.worldChampionYears) cur.champions += 1;
    map.set(c.countryCode, cur);
  }
  return Array.from(map.values()).sort((a, b) => b.champions - a.champions || b.total - a.total);
}
