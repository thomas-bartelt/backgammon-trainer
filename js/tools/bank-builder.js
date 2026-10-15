// Builds data/bank.json: curated lesson positions sorted by chapter and difficulty tier.
// Runs in the browser (tools/bank.html), driven by scripts/build-bank.mjs.
import { Engine } from "../engine.js";
import { startScratchGame, selfPlay, setPlies, currentState, captureIds, rollDice } from "../trainer.js";
import { parseMoveHints, parseCubeHint } from "../game.js";
import { checkerThemes, checkerTier, cubeTier, cubeMargin, TIERS } from "../themes.js";
import { mulberry32 } from "../rng.js";

const run = (c) => Engine.run(c);
const CHAPTERS = ["opening", "replies", "points", "hitting", "safety", "primes", "racing", "bearoff", "cube", "take"];

export async function buildBank({ perTier = 24, seed = 7, budgetMs = 8 * 60_000, onProgress } = {}) {
  const rng = mulberry32(seed);
  const bank = Object.fromEntries(CHAPTERS.map((c) => [c, Object.fromEntries(TIERS.map((t) => [t, []]))]));
  const seen = new Set();
  const full = (c, t) => bank[c][t].length >= perTier;
  const allFull = () => CHAPTERS.every((c) => c === "opening" || TIERS.every((t) => full(c, t)));

  async function add(chapter, tier, gap) {
    if (chapter !== "opening" && full(chapter, tier)) return;
    const ids = await captureIds();
    const key = ids.positionId + ids.matchId;
    if (seen.has(key)) return;
    seen.add(key);
    bank[chapter][tier].push({ p: ids.positionId, m: ids.matchId, g: Number(gap.toFixed(3)) });
  }

  // Opening: the 15 non-double opening rolls, user to play.
  for (let a = 1; a <= 6; a++) {
    for (let b = a + 1; b <= 6; b++) {
      await Engine.runAll(["set matchlength 0", "set cube use on", "new match", "set turn somebody", `set dice ${b} ${a}`]);
      await setPlies(2);
      const hints = parseMoveHints(await run("hint 999"));
      await add("opening", checkerTier(hints[0].equity - hints[1].equity), hints[0].equity - hints[1].equity);
    }
  }

  const t0 = performance.now();
  let games = 0;
  while (performance.now() - t0 < budgetMs && !allFull()) {
    games++;
    let { state, firstDice } = await startScratchGame(rng);
    for (let step = 1; step <= 150; step++) {
      // Pre-roll: a cube decision for whoever is on roll.
      if (step > 3) {
        const cube = parseCubeHint(await run("hint"));
        if (cube) {
          const kind = state.turn === 1 ? "double" : "take";
          const gain = Math.min(cube.dt, cube.dp) - cube.nd;
          if (kind === "double" ? gain > -0.25 : gain > -0.04) {
            const margin = cubeMargin(kind, cube);
            await add(kind === "double" ? "cube" : "take", cubeTier(margin), margin);
          }
        }
      }
      const dice = step === 1 ? firstDice : rollDice(rng);
      if (state.turn === 1 && step > 1) {
        await run(`set dice ${dice[0]} ${dice[1]}`);
        await setPlies(2);
        const hints = parseMoveHints(await run("hint 999"));
        await setPlies(0);
        if (hints.length >= 2 && hints[0].equity - hints[hints.length - 1].equity >= 0.02) {
          const gap = hints[0].equity - hints[1].equity;
          for (const theme of checkerThemes(state.pos, hints, step)) await add(theme, checkerTier(gap), gap);
        }
      }
      await setPlies(0);
      if (!(await selfPlay(dice, rng))) break;
      state = await currentState();
    }
    onProgress?.({ games, seconds: Math.round((performance.now() - t0) / 1000), counts: counts(bank) });
  }
  return { version: 1, seed, perTier, games, chapters: bank };
}

function counts(bank) {
  return Object.fromEntries(Object.entries(bank).map(([c, tiers]) => [c, TIERS.map((t) => tiers[t].length).join("/")]));
}
