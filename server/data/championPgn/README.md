# Champion PGN library

Bulk historical games for the Hall of Champions, sourced from
[PGN Mentor's player files](https://www.pgnmentor.com/files.html).

The server exposes them at `GET /api/champions/:id/games?q=&page=&limit=`,
and the Hall of Champions detail page renders a paginated games library
once a `<id>.pgn` file is present in this directory.

## Layout

- `manifest.json` — maps each champion `id` (see `server/data/champions.ts`)
  to the corresponding PGN Mentor zip filename.
- `<championId>.pgn` — the bundled multi-game PGN file. Filenames must
  match the champion `id` exactly (e.g. `botvinnik.pgn`, `tal.pgn`).
- `*.pgn` files are intentionally git-ignored to keep the repository
  small. Run the fetch script below after cloning.

## Refresh / fetch

From the repo root:

```bash
npm run fetch:pgn-mentor
```

This downloads every entry in `manifest.json`, unzips each archive in
memory, and writes the contained `.pgn` to `<championId>.pgn`.

Pass a single id to fetch just one champion:

```bash
npm run fetch:pgn-mentor -- botvinnik
```

Existing files are overwritten. Champions without a PGN Mentor entry
are skipped with a warning — the API for them returns an empty library
(the curated `famousGames` array on the champion record is unaffected).

## Coverage

PGN Mentor refreshes its player files monthly; rerun the script to pick
up new games. Game counts as of January 2026:

| Champion id | Player                | Games |
| ----------- | --------------------- | ----- |
| morphy      | Paul Morphy           | 211   |
| steinitz    | Wilhelm Steinitz      | 590   |
| lasker      | Emanuel Lasker        | 900   |
| capablanca  | José Raúl Capablanca  | 597   |
| alekhine    | Alexander Alekhine    | 1,661 |
| nimzowitsch | Aron Nimzowitsch      | 512   |
| botvinnik   | Mikhail Botvinnik     | 891   |
| smyslov     | Vasily Smyslov        | 2,627 |
| tal         | Mikhail Tal           | 2,431 |
| petrosian   | Tigran Petrosian      | 1,893 |
| spassky     | Boris Spassky         | 2,231 |
| fischer     | Bobby Fischer         | 827   |
| karpov      | Anatoly Karpov        | 3,529 |
| kasparov    | Garry Kasparov        | 2,128 |
| kramnik     | Vladimir Kramnik      | 4,324 |
| anand       | Viswanathan Anand     | 4,204 |
| carlsen     | Magnus Carlsen        | 6,615 |
| ding        | Ding Liren            | 2,116 |
| gukesh      | Dommaraju Gukesh      | 2,053 |
| nakamura    | Hikaru Nakamura       | 8,727 |
| caruana     | Fabiano Caruana       | 5,341 |

## License / attribution

PGN Mentor publishes these collections free for personal study. We do
**not** redistribute them in this repository — the fetch script pulls
them on demand from `pgnmentor.com`. Please respect their terms.
