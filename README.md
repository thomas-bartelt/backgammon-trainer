# gammon. Backgammon trainer

A local backgammon trainer built on GNU Backgammon (compiled to WebAssembly by gnubg-web).

Live: https://backgammon-trainer-topaz.vercel.app

Everything runs in the browser: full games and matches against GNU at six strength levels,
checker-play and cube drills, a ten-chapter learning path, spaced review of your mistakes,
and plain-language explanations of why the engine prefers a play.

## Run

```bash
python3 scripts/serve.py 5173
```

Then open http://127.0.0.1:5173. It is an installable PWA: in Chrome or Edge use "Install app";
on a phone, "Add to Home Screen". After the first load it works offline.

To try it on your phone you need HTTPS (service workers only run on localhost or HTTPS): deploy the
folder to any static host, or serve it on your LAN with a locally trusted certificate (e.g. mkcert). (`scripts/serve.py` is `python3 -m http.server` with
`Cache-Control: no-cache`, so code changes show up on a normal reload.)

## Test

```bash
node --test tests/*.test.mjs
```

## Rebuild the lesson bank

```bash
node scripts/build-bank.mjs --per-tier 24 --minutes 12 --seed 7
```

Drives `tools/bank.html` in headless Chrome (dev server must be running) and writes `data/bank.json`:
positions found by engine self-play, sorted into chapters (`js/themes.js`) and difficulty tiers by the
equity gap between the two best plays.

## How it works

- `js/engine-worker.js` runs the gnubg CLI (WASM) in a Web Worker; `js/engine.js` is the async proxy:
  `Engine.run(cmd)` sends a text command and resolves with what gnubg printed.
- `js/session.js` shares the single engine between the live game and drills. The game is saved as SGF
  before a drill uses the engine and restored afterwards, and every game action is checkpointed to
  localStorage so a reload can resume. All engine work runs under one lock.
- `js/play.js` drives games and matches (money or 3/5/7/11 points, Crawford handled by gnubg):
  engine moves with level-based noise, doubling, resignations in both directions.
- `js/trainer.js` generates drill positions by self-play and grades answers. Randomness is injectable
  (`rng`) so positions can be reproduced from a seed.
- `js/game.js` holds the pure board logic and gnubg output parsers (unit-tested).
- `js/explain.js` explains verdicts: exact shot counts, points, primes, hits, race and gammon odds,
  stated only in the direction the engine agrees with (unit-tested).
- `js/themes.js` sorts positions into chapters and tiers and groups them into lessons.
- `js/screens/drill.js` presents and grades one puzzle (shared by drills, lessons and review).
- `js/store.js` is the versioned on-device store (prefs, stats, decision log) with an event bus.
- `js/screens/` contains the Play, Daily, Learn, Train (drills and review) and Profile screens;
  `js/app.js` wires the router, settings and stats.
- `js/daily.js` picks the daily challenge from the bank with a date-seeded RNG and keeps streaks.
- `js/progress.js`, `js/badges.js` and `js/gamify.js` handle XP, levels and badges.
- `sw.js` caches the app for offline use (code network-first, engine and assets cache-first);
  `vendor/` holds self-hosted fonts (OFL) and Phosphor icons (MIT).
- `js/board.js` draws the SVG board. Its geometry is parametric: in portrait the board rotates 90 degrees
  (points run down the screen, home board and tray at the bottom) and its length stretches to fill the
  screen; checkers, dice and labels stay upright. `js/moveinput.js` handles tap, tap-tap and drag input.
- The UI follows the Kame family: dark table by default, Bricolage Grotesque with JetBrains Mono, one
  vermilion accent, pill controls and bottom sheets (`css/styles.css`, `index.html`).

## License

GPL-3.0, see [LICENSE](LICENSE). The app bundles GNU Backgammon (GPL-3.0, https://www.gnu.org/software/gnubg/)
compiled to WebAssembly by gnubg-web (https://github.com/hwatheod/gnubg-web) in `engine/`, so the project as a
whole is distributed under the same licence.

Third-party assets in `vendor/`: Bricolage Grotesque and JetBrains Mono (SIL Open Font License 1.1) and
Phosphor Icons (MIT, see `vendor/phosphor/LICENSE`).
