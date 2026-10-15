// Generates training positions by letting the engine play itself, then grades the user's answer.
// All engine calls are async; callers wrap them in session.inScratch / inGame.
import { Engine } from "./engine.js";
import {
  parseBoardLine, lastBoardLine, parseMoveHints, parseCubeHint,
  applyNotation, positionKey, hasContact, pipCount,
} from "./game.js";

const run = (c) => Engine.run(c);

// Default randomness. Pass a seeded rng() returning [0, 1) for reproducible positions.
export function cryptoRandom() {
  const b = new Uint32Array(1);
  crypto.getRandomValues(b);
  return b[0] / 2 ** 32;
}

export const rollDice = (rng = cryptoRandom) => [1 + Math.floor(rng() * 6), 1 + Math.floor(rng() * 6)];
const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

export const ENGINE_SETUP = [
    "set confirm new off",
    "set confirm default yes",
    "set display off",
    "set automatic roll off",
    "set automatic move off",
    "set automatic bearoff off",
    "set automatic game off",
    "set player gnubg human",
    "set player somebody human",
    "set jacoby off",
    "set cube use on",
    "set evaluation cubedecision evaluation plies 2",
];

export async function configureEngine() {
  await Engine.runAll(ENGINE_SETUP);
}

export function setPlies(n) {
  return run(`set evaluation chequerplay evaluation plies ${n}`);
}

export async function currentState() {
  const line = lastBoardLine(await run("show board"));
  return line ? parseBoardLine(line) : null;
}

// Plays one move for whoever is on roll. Returns false when the game ended.
export async function selfPlay(dice, rng = cryptoRandom) {
  await run(`set dice ${dice[0]} ${dice[1]}`);
  const hints = parseMoveHints(await run("hint 3"));
  let choice = hints[0];
  // A little variety: sometimes take a near-equal alternative so positions don't repeat.
  const close = hints.filter((h) => h.equity >= hints[0]?.equity - 0.03);
  if (close.length > 1 && rng() < 0.25) choice = pick(close, rng);
  const out = await run(choice ? `move ${choice.move}` : "move");
  return !/wins (a|the)/i.test(out);
}

// Drills always start a fresh money game so they never continue a match.
export async function startScratchGame(rng = cryptoRandom) {
  await Engine.runAll(["set matchlength 0", "set cube use on", `set seed ${Math.floor(rng() * 2 ** 31)}`, "new match"]);
  const s = await currentState();
  return { state: s, firstDice: s.dice };
}

const PHASES = {
  opening: (step) => step >= 1 && step <= 5,
  middle: (step, pos) => step >= 6 && hasContact(pos),
  bearoff: (step, pos) => !hasContact(pos) && pipCount(pos).mine < 75,
};

// gnubg's compact IDs for the current state: Position ID (board) + Match ID (turn, dice, cube, score).
export async function captureIds() {
  const out = await run("copy");
  return {
    positionId: (out.match(/Position ID:\s*(\S+)/) || [])[1] || "",
    matchId: (out.match(/Match ID\s*:\s*(\S+)/) || [])[1] || "",
  };
}

// Rebuilds a drill puzzle from stored IDs. kind: "checker" | "double" | "take".
export async function puzzleFromIds({ kind, positionId, matchId, phase = null }) {
  await Engine.runAll(["set matchlength 0", "set cube use on", "new match", `set matchid ${matchId}`, `set board ${positionId}`]);
  const state = await currentState();
  if (kind === "checker") {
    await setPlies(2);
    const hints = parseMoveHints(await run("hint 999"));
    await setPlies(0);
    if (hints.length < 2) return null;
    const legal = new Map();
    for (const h of hints) legal.set(positionKey(applyNotation(state.pos, h.move)), h);
    return { kind, phase: phase || (hasContact(state.pos) ? "middle" : "bearoff"), pos: state.pos, dice: state.dice, hints, legal, positionId, matchId };
  }
  const cube = parseCubeHint(await run("hint"));
  if (!cube) return null;
  const correct = kind === "double"
    ? (Math.min(cube.dt, cube.dp) - cube.nd > 0 ? "double" : "nodouble")
    : (cube.dt <= cube.dp ? "take" : "pass");
  return { kind, phase: phase || (hasContact(state.pos) ? "middle" : "bearoff"), pos: state.pos, cube, correct, positionId, matchId };
}

// ---------- checker play ----------

export async function generateCheckerPosition({ phase = "any", closeOnly = false, rng = cryptoRandom } = {}) {
  const phaseName = phase === "any" ? pick(["opening", "middle", "middle", "bearoff"], rng) : phase;
  const wanted = PHASES[phaseName];
  const gapLimit = closeOnly ? 0.05 : 0.6;

  for (let game = 0; game < 12; game++) {
    let { state, firstDice } = await startScratchGame(rng);
    for (let step = 1; step <= 140; step++) {
      const dice = step === 1 ? firstDice : rollDice(rng);
      if (state.turn === 1 && wanted(step, state.pos)) {
        await run(`set dice ${dice[0]} ${dice[1]}`);
        await setPlies(2);
        const hints = parseMoveHints(await run("hint 999"));
        await setPlies(0);
        const gap = hints.length > 1 ? hints[0].equity - hints[1].equity : Infinity;
        const spread = hints.length > 1 ? hints[0].equity - hints[hints.length - 1].equity : 0;
        const acceptProb = phaseName === "middle" ? 0.35 : 0.6;
        if (hints.length >= 2 && spread >= 0.02 && gap <= gapLimit && rng() < acceptProb) {
          const legal = new Map();
          for (const h of hints) legal.set(positionKey(applyNotation(state.pos, h.move)), h);
          return { kind: "checker", phase: phaseName, pos: state.pos, dice, hints, legal, ...(await captureIds()) };
        }
      }
      await setPlies(0);
      if (!(await selfPlay(dice, rng))) break;
      state = await currentState();
    }
  }
  return null;
}

// ---------- cube decisions ----------

export async function generateCubePosition({ rng = cryptoRandom } = {}) {
  for (let game = 0; game < 20; game++) {
    let { state, firstDice } = await startScratchGame(rng);
    for (let step = 1; step <= 120; step++) {
      // Every move after the opening starts with the player on roll and no dice: a cube decision point.
      if (step > 6) {
        const cube = parseCubeHint(await run("hint"));
        if (cube) {
          const gain = Math.min(cube.dt, cube.dp) - cube.nd;
          const phase = hasContact(state.pos) ? "middle" : "bearoff";
          if (state.turn === 1 && gain > -0.12 && rng() < 0.55) {
            return { kind: "double", phase, pos: state.pos, cube, correct: gain > 0 ? "double" : "nodouble", ...(await captureIds()) };
          }
          if (state.turn === -1 && gain > -0.04 && rng() < 0.55) {
            return { kind: "take", phase, pos: state.pos, cube, correct: cube.dt <= cube.dp ? "take" : "pass", ...(await captureIds()) };
          }
        }
      }
      await setPlies(0);
      if (!(await selfPlay(step === 1 ? firstDice : rollDice(rng), rng))) break;
      state = await currentState();
    }
  }
  return null;
}

// ---------- grading ----------

export function gradeFor(loss) {
  if (loss < 0.0005) return { key: "best", label: "Best move" };
  if (loss < 0.02) return { key: "excellent", label: "Excellent" };
  if (loss < 0.05) return { key: "inaccuracy", label: "Inaccuracy" };
  if (loss < 0.1) return { key: "mistake", label: "Mistake" };
  return { key: "blunder", label: "Blunder" };
}

export function gradeChecker(puzzle, finalKey) {
  const chosen = puzzle.legal.get(finalKey);
  const best = puzzle.hints[0];
  const loss = Math.max(0, best.equity - chosen.equity);
  return { chosen, best, loss, grade: gradeFor(loss), total: puzzle.hints.length };
}

export function gradeCube(puzzle, answer) {
  const { nd, dt, dp } = puzzle.cube;
  let loss = 0;
  if (puzzle.kind === "double") {
    const doubleEq = Math.min(dt, dp);
    loss = answer === puzzle.correct ? 0 : Math.abs(doubleEq - nd);
  } else {
    loss = answer === puzzle.correct ? 0 : Math.abs(dt - dp);
  }
  const grade = loss === 0 ? { key: "best", label: "Correct" } : gradeFor(loss);
  return { loss, grade };
}

// Approximate performance rating: average equity loss per decision x 500.
export function ratingFor(avgLoss) {
  const pr = avgLoss * 500;
  let label = "Beginner";
  if (pr <= 2.5) label = "World class";
  else if (pr <= 5) label = "Expert";
  else if (pr <= 8) label = "Advanced";
  else if (pr <= 12) label = "Intermediate";
  else if (pr <= 18) label = "Casual";
  return { pr, label };
}
