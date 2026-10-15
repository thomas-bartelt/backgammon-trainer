// Full games and matches against the engine. gnubg keeps the game state (board, cube, score, Crawford);
// both sides are "human" in gnubg so we choose the engine's moves ourselves, with level-based noise.
// Callers wrap these in session.inGame so commands never interleave with drills.
import { Engine } from "./engine.js";
import { parseMoveHints, parseCubeHint, applyNotation, positionKey, notationSegments, OFF } from "./game.js";
import { setPlies, currentState, rollDice } from "./trainer.js";

const run = (c) => Engine.run(c);

// Noise is added to each candidate's equity before the engine picks, like gnubg's own levels.
export const LEVELS = {
  beginner: { label: "Beginner", plies: 0, noise: 0.1 },
  casual: { label: "Casual", plies: 0, noise: 0.06 },
  intermediate: { label: "Intermediate", plies: 0, noise: 0.035 },
  advanced: { label: "Advanced", plies: 0, noise: 0.015 },
  expert: { label: "Expert", plies: 1, noise: 0 },
  worldclass: { label: "World class", plies: 2, noise: 0 },
};

export const RESIGN_KINDS = ["normal", "gammon", "backgammon"];

function gauss(sigma) {
  if (!sigma) return 0;
  const u = 1 - Math.random(), v = Math.random();
  return sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Game result (and match result when the match is over) from engine output.
export function parseWin(out) {
  const m = out.match(/(somebody|gnubg) wins (a single game|a gammon|a backgammon) and (\d+) points?/);
  if (!m) return null;
  const match = out.match(/(somebody|gnubg) has won the match/);
  return {
    userWon: m[1] === "somebody",
    kind: m[2].replace(/^a /, ""),
    points: Number(m[3]),
    matchOver: Boolean(match),
    userWonMatch: match ? match[1] === "somebody" : null,
  };
}

// length 0 = money game.
export async function startMatch({ length, cube }) {
  await Engine.runAll([`set matchlength ${length}`, `set cube use ${cube ? "on" : "off"}`, "new match"]);
  return currentState();
}

// Next game of a running match.
export async function nextGame() {
  await run("new game");
  return currentState();
}

export function state() {
  return currentState();
}

// ---------- user side ----------

export async function rollForUser() {
  const dice = rollDice();
  await run(`set dice ${dice[0]} ${dice[1]}`);
  return { dice, ...(await legalMoves()) };
}

// Legal moves for whoever is on roll with dice already set (e.g. the opening roll).
export async function legalMoves() {
  await setPlies(2);
  const s = await currentState();
  const hints = parseMoveHints(await run("hint 999"));
  const legal = new Map();
  for (const h of hints) legal.set(positionKey(applyNotation(s.pos, h.move)), h);
  return { hints, legal };
}

export async function playUserMove(move) {
  const out = await run(move ? `move ${move}` : "move");
  return { win: parseWin(out) };
}

// Pre-roll cube analysis for the player on roll (2-ply, score-aware in matches).
export async function cubeAnalysis() {
  return parseCubeHint(await run("hint"));
}

export async function userDoubles(level) {
  const c = await cubeAnalysis();
  // From the doubler's side: the engine takes when "double, take" is not worse for it than passing.
  const takes = c ? c.dp - c.dt + gauss(LEVELS[level].noise * 2) >= 0 : true;
  await run("double");
  const out = await run(takes ? "take" : "drop");
  return { takes, win: parseWin(out), analysis: c };
}

export async function userRespondsToDouble(take) {
  const out = await run(take ? "take" : "drop");
  return { win: parseWin(out) };
}

// With a resignation on the table, gnubg reports what accepting gains the player who must decide.
export async function resignAdvice() {
  const h = await run("hint");
  const before = Number((h.match(/Equity before resignation\s*:\s*([+-]?\d+\.\d+)/) || [])[1]);
  const after = Number((h.match(/Equity after resignation\s*:\s*([+-]?\d+\.\d+)/) || [])[1]);
  return Number.isFinite(before) && Number.isFinite(after) ? after - before : null;
}

// The user (on roll) offers to resign; gnubg's resignation analysis decides, plus level noise.
export async function userResigns(level, kind) {
  await run(`resign ${kind}`);
  const gain = (await resignAdvice()) ?? 1;
  const accepted = gain + gauss(LEVELS[level].noise * 3) >= 0;
  const out = await run(accepted ? "accept" : "reject");
  return { accepted, win: parseWin(out) };
}

// ---------- engine side ----------

export async function engineWantsToDouble(level) {
  const c = await cubeAnalysis();
  if (!c) return { doubles: false, analysis: null };
  const gain = Math.min(c.dt, c.dp) - c.nd;
  const doubles = gain + gauss(LEVELS[level].noise * 2) > 0;
  if (doubles) await run("double");
  return { doubles, analysis: c };
}

// Win, W(g), W(bg), L(g), L(bg) for the player on roll from the deepest `eval` line.
async function evalProbs() {
  const out = await run("eval");
  const lines = out.split("\n").filter((l) => /^\s*\d+ ply:/.test(l));
  const last = lines[lines.length - 1];
  if (!last) return null;
  const [win, wg, wbg, lg, lbg] = last.split(":")[1].trim().split(/\s+/).map(Number);
  return { win, wg, wbg, lg, lbg };
}

// Before rolling, a hopeless engine offers to resign when the outcome is clear.
// Returns the resignation kind it offered, or null. `minKind` skips levels already rejected.
export async function engineConsidersResign(minKind = 0) {
  const p = await evalProbs();
  if (!p || p.win > 0.003) return null;
  let kind = null;
  if (p.lbg > 0.985) kind = 2;
  else if (p.lg > 0.985 && p.lbg < 0.01) kind = 1;
  else if (p.lg < 0.01) kind = 0;
  if (kind === null || kind < minKind) return null;
  await run(`resign ${RESIGN_KINDS[kind]}`);
  return kind;
}

export async function userAnswersResign(accept) {
  const out = await run(accept ? "accept" : "reject");
  return { win: parseWin(out) };
}

// Rolls and plays for the engine. Returns its move in the user's point numbering for animation.
export async function engineMove(level, dice = rollDice()) {
  const lv = LEVELS[level];
  await run(`set dice ${dice[0]} ${dice[1]}`);
  await setPlies(lv.plies);
  const hints = parseMoveHints(await run("hint 999"));
  let choice = null, bestScore = -Infinity;
  for (const h of hints) {
    const score = h.equity + gauss(lv.noise);
    if (score > bestScore) { bestScore = score; choice = h; }
  }
  const out = await run(choice ? `move ${choice.move}` : "move");
  const segments = choice
    ? notationSegments(choice.move).map((s) => ({ from: 25 - s.from, to: s.to === OFF ? "off" : 25 - s.to }))
    : [];
  return { dice, move: choice ? toUserNumbering(choice.move) : null, segments, win: parseWin(out) };
}

// "24/20 13/8*" from the engine's side reads "1/5 12/17*" on the user's board.
export function toUserNumbering(move) {
  return move.replace(/\b(\d+)\b(?!\))/g, (m, n, offset, str) => (str[offset - 1] === "(" ? m : String(25 - Number(n))));
}
