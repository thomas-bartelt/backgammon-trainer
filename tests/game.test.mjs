// Run with: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseBoardLine, parseMoveHints, parseCubeHint, applyNotation, notationSegments,
  positionKey, playableSteps, singleSteps, emptyPosition, pipCount, hasContact, classifyPhase, BAR, OFF,
} from "../js/game.js";
import { parseWin, toUserNumbering } from "../js/play.js";

// Captured from the engine: opening position, gnubg on roll with 4-2.
const START = "board:somebody:gnubg:0:0:0:0:-2:0:0:0:0:5:0:3:0:0:0:-5:5:0:0:0:-3:0:-5:0:0:0:0:2:0:-1:4:2:4:2:1:1:1:0:1:-1:0:25:0:0:0:0:0:0:0:0";
// 3-point match, user leads 2-0, Crawford game, user on roll.
const CRAWFORD = "board:somebody:gnubg:3:2:0:0:-2:0:0:0:0:5:0:3:0:0:0:-5:5:0:0:0:-3:0:-5:0:0:0:0:2:0:1:6:4:6:4:1:1:1:0:1:-1:0:25:0:0:0:0:0:0:1:0";

const HINT_31 = `    1. Cubeful 0-ply    8/5 6/5                      Eq.:  +0.200
       0.551 0.174 0.013 - 0.449 0.124 0.005
        0-ply cubeful prune [expert]
    2. Cubeful 0-ply    24/23 13/10                  Eq.:  -0.011 ( -0.211)
       0.497 0.137 0.008 - 0.503 0.140 0.007
        0-ply cubeful prune [expert]
    3. Cubeful 0-ply    24/20                        Eq.:  -0.018 ( -0.218)
       0.497 0.125 0.005 - 0.503 0.135 0.004`;

const CUBE = `
Cube analysis
2-ply cubeless equity  +0.231
  0.570 0.183 0.007 - 0.430 0.094 0.003
Cubeful equities:
1. No double            +0.305
2. Double, pass         +1.000  ( +0.695)
3. Double, take         +0.169  ( -0.137)
Proper cube action: No double, take (16.4%)
`;

test("parseBoardLine reads checkers, turn, dice and cube flags", () => {
  const s = parseBoardLine(START);
  assert.equal(s.pos.me[6], 5);
  assert.equal(s.pos.me[8], 3);
  assert.equal(s.pos.me[13], 5);
  assert.equal(s.pos.me[24], 2);
  assert.equal(s.pos.opp[1], 2);
  assert.equal(s.pos.opp[19], 5);
  assert.equal(s.pos.meOff, 0);
  assert.equal(s.turn, -1);
  assert.deepEqual(s.dice, [4, 2]);
  assert.equal(s.cube, 1);
  assert.equal(s.iMayDouble, true);
  assert.equal(s.crawford, false);
  assert.equal(pipCount(s.pos).mine, 167);
});

test("parseBoardLine reads match score and Crawford", () => {
  const s = parseBoardLine(CRAWFORD);
  assert.equal(s.matchLength, 3);
  assert.equal(s.myScore, 2);
  assert.equal(s.oppScore, 0);
  assert.equal(s.crawford, true);
  assert.equal(s.turn, 1);
  assert.deepEqual(s.dice, [6, 4]);
});

test("parseMoveHints reads moves, equities and probabilities", () => {
  const h = parseMoveHints(HINT_31);
  assert.equal(h.length, 3);
  assert.equal(h[0].move, "8/5 6/5");
  assert.equal(h[0].equity, 0.2);
  assert.equal(h[1].diff, -0.211);
  assert.deepEqual(h[0].probs, [0.551, 0.174, 0.013, 0.449, 0.124, 0.005]);
});

test("parseCubeHint reads cubeful equities and the proper action", () => {
  const c = parseCubeHint(CUBE);
  assert.deepEqual([c.nd, c.dt, c.dp], [0.305, 0.169, 1]);
  assert.match(c.proper, /^No double, take/);
  assert.equal(c.probs[0], 0.57);
});

test("applyNotation handles points, hits, doubles and bear-off", () => {
  const start = parseBoardLine(START).pos;
  const p = applyNotation(start, "8/5 6/5");
  assert.equal(p.me[5], 2);
  assert.equal(p.me[8], 2);
  assert.equal(p.me[6], 4);

  const hit = emptyPosition();
  hit.me[13] = 1; hit.opp[7] = 1;
  const after = applyNotation(hit, "13/7*");
  assert.equal(after.opp[7], 0);
  assert.equal(after.opp[0], 1);
  assert.equal(after.me[7], 1);

  assert.equal(notationSegments("13/8(2) 6/off").length, 3);
  assert.deepEqual(notationSegments("bar/22*")[0], { from: BAR, to: 22 });
  assert.equal(notationSegments("6/off")[0].to, OFF);
});

test("playableSteps only offers steps that finish a legal play", () => {
  const start = parseBoardLine(START).pos;
  const legal = new Set([positionKey(applyNotation(start, "8/5 6/5"))]);
  const steps = playableSteps(start, [3, 1], legal);
  const keys = steps.map((s) => `${s.from}>${s.to}`).sort();
  assert.deepEqual(keys, ["6>5", "8>5"]);
});

test("singleSteps applies bear-off rules", () => {
  const p = emptyPosition();
  p.me[3] = 1; p.me[5] = 1;
  p.meOff = 13;
  // A 6 must bear off from the highest point; a 4 can't move the 3 off while the 5 is behind it.
  assert.deepEqual(singleSteps(p, 6).map((s) => s.from), [5]);
  assert.deepEqual(singleSteps(p, 4).map((s) => [s.from, s.to]), [[5, 1]]);
  p.me[8] = 1;
  assert.equal(singleSteps(p, 3).some((s) => s.to === OFF), false, "no bear-off with a checker outside home");
});

test("phase and contact detection", () => {
  const start = parseBoardLine(START).pos;
  assert.equal(hasContact(start), true);
  assert.equal(classifyPhase(start), "opening");
  const race = emptyPosition();
  race.me[3] = 5; race.opp[20] = 5;
  assert.equal(hasContact(race), false);
  assert.equal(classifyPhase(race), "bearoff");
});

test("parseWin reads game and match results", () => {
  assert.deepEqual(parseWin("somebody wins a single game and 1 point."), {
    userWon: true, kind: "single game", points: 1, matchOver: false, userWonMatch: null,
  });
  const m = parseWin("gnubg wins a backgammon and 3 points.\nThe score...\ngnubg has won the match.");
  assert.equal(m.userWon, false);
  assert.equal(m.kind, "backgammon");
  assert.equal(m.matchOver, true);
  assert.equal(m.userWonMatch, false);
  assert.equal(parseWin("The dice have been set to 3 and 1."), null);
});

test("engine moves are converted to the user's point numbering", () => {
  assert.equal(toUserNumbering("24/20 7/2"), "1/5 18/23");
  assert.equal(toUserNumbering("bar/22* 6/off"), "bar/3* 19/off");
  assert.equal(toUserNumbering("13/8(2) 6/1*(2)"), "12/17(2) 19/24*(2)");
});
