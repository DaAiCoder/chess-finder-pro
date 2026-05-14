# Watch player SFX

Drop short OGG or MP3 files in this directory and the `AnimatedBoardPlayer`
will play them as moves animate.

Expected filenames (`.ogg` is tried first, then `.mp3`):

- `move.ogg`     — generic piece move
- `capture.ogg`  — piece takes piece
- `check.ogg`    — move puts opponent in check / mate
- `castle.ogg`   — `O-O` / `O-O-O`
- `promote.ogg`  — pawn promotion (`=Q` etc.)

Any missing file falls back to a soft synthetic click (WebAudio); the player
always makes an audible tick on moves. Free chess SFX sets compatible with
the lichess.org piece sounds are widely available (the lichess sound library
on GitHub is one option — CC0).
