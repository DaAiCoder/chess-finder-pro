# Computer vs Computer PGNs

Drop any number of `*.pgn` files in this directory and they will be
auto-ingested into the Game Library on the next server boot, classified
as `tier: "engine"` and `source: "pgn"`. They show up automatically in
the **Computer Classics** Watch channel.

Recommended public-domain sources:

- AlphaZero vs Stockfish — 10 published games from the 2017 DeepMind paper.
  https://deepmind.google/discover/blog/alphazero-shedding-new-light-on-chess-shogi-and-go/
- TCEC superfinals — full PGNs are released by https://tcec-chess.com/
  after each season's championship.
- Kasparov vs Deep Blue (1996, 1997) — historical, widely circulated.
- Komodo / Houdini / Stockfish world computer championship games.

Each file can contain a single game or hundreds; the ingester splits
multi-game PGNs on the `[Event "..."]` boundary. The bundled
`alphazero-stockfish-2017.pgn` is a starter — replace or extend.
