import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyPosition, parseBoardLine } from "../js/game.js";
import { shotsAgainst, explainChecker, explainCube, features } from "../js/explain.js";

// User blot on `blot`, one engine checker on `from` (engine moves upward in the user's numbering).
function blotAndShooter(blot, from) {
  const p = emptyPosition();
  p.me[blot] = 1;
  p.me[2] = 14; // the rest out of the way, behind the shooter's path
  p.opp[from] = 1;
  p.opp[24] = 14;
  return p;
}

test("a blot 6 pips away is hit by 17 of 36 rolls", () => {
  assert.equal(shotsAgainst(blotAndShooter(13, 7)).total, 17);
});

test("a blot 1 pip away is hit by 11 rolls", () => {
  assert.equal(shotsAgainst(blotAndShooter(8, 7)).total, 11);
});

test("an 8-pip indirect shot is 6 rolls", () => {
  assert.equal(shotsAgainst(blotAndShooter(15, 7)).total, 6);
});

test("made points block combination shots", () => {
  const p = blotAndShooter(13, 7);
  p.me[2] = 10;
  p.me[9] = 2;
  p.me[10] = 2;
  // 6s (11) + 5-1 (2) + 4-2 via 11 (2); 3-3 and 2-2 are blocked.
  assert.equal(shotsAgainst(p).total, 15);
});

test("a closed board means no shots from the bar", () => {
  const p = emptyPosition();
  for (let i = 1; i <= 6; i++) p.me[i] = 2;
  p.me[13] = 1;
  p.me[14] = 2;
  p.opp[0] = 1;
  p.opp[24] = 14;
  assert.equal(shotsAgainst(p).total, 0);
});

const START = "board:somebody:gnubg:0:0:0:0:-2:0:0:0:0:5:0:3:0:0:0:-5:5:0:0:0:-3:0:-5:0:0:0:0:2:0:1:3:1:3:1:1:1:1:0:1:-1:0:25:0:0:0:0:0:0:0:0";

test("opening 3-1: making the 5-point beats slotting and splitting", () => {
  const start = parseBoardLine(START).pos;
  const best = { move: "8/5 6/5", equity: 0.2, probs: [0.551, 0.174, 0.013, 0.449, 0.124, 0.005] };
  const worse = { move: "24/23 13/10", equity: -0.011, probs: [0.497, 0.137, 0.008, 0.503, 0.14, 0.007] };
  const e = explainChecker(start, best, worse);
  assert.ok(e.reasons.some((r) => r.includes("5-point")), e.reasons.join(" | "));
  assert.ok(e.reasons.some((r) => /of 36 rolls/.test(r)), e.reasons.join(" | "));
  assert.match(e.summary, /wins 5\.4% more games/);
  assert.ok(e.reasons.some((r) => r.includes("blot on your 10-point")), e.reasons.join(" | "));
  assert.equal(features(start).homePoints, 1);
});

test("cube explanations pick the right story", () => {
  const take = explainCube("take", { nd: 0.746, dt: 0.738, dp: 1, probs: [0.705, 0.089, 0.003, 0.295, 0.033, 0] });
  assert.match(take.reasons[0], /still win 29\.5%/);
  const tooGood = explainCube("double", { nd: 1.012, dt: 1.67, dp: 1, probs: [0.875, 0.14, 0.004, 0.125, 0.017, 0] });
  assert.match(tooGood.reasons[0], /too good to double/);
  const notYet = explainCube("double", { nd: 0.428, dt: 0.342, dp: 1, probs: [0.635, 0.098, 0.002, 0.365, 0.073, 0.002] });
  assert.match(notYet.reasons[0], /not quite enough/);
});

import { lessonsFor, checkerTier, cubeTier } from "../js/themes.js";

test("lessons group tiers in order and absorb small leftovers", () => {
  const mk = (n) => Array.from({ length: n }, (_, i) => ({ p: String(i), m: "x", g: 0 }));
  const lessons = lessonsFor({ easy: mk(2), medium: mk(10), hard: mk(16), close: mk(3) });
  // 2 easy carry into medium (12 = 8 + 4), hard makes 2 lessons, 3 close join the last one.
  assert.deepEqual(lessons.map((l) => [l.tier, l.items.length]), [["medium", 8], ["medium", 4], ["hard", 8], ["hard", 11]]);
  assert.equal(checkerTier(0.12), "easy");
  assert.equal(checkerTier(0.01), "close");
  assert.equal(cubeTier(0.05), "hard");
});
