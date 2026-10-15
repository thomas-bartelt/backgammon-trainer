import { test } from "node:test";
import assert from "node:assert/strict";
import { freshProgress, applyEvent, levelFor, xpToNext } from "../js/progress.js";
import { BADGES } from "../js/badges.js";

test("level curve", () => {
  assert.equal(xpToNext(1), 100);
  assert.equal(xpToNext(4), 800);
  assert.deepEqual(levelFor(0), { level: 1, into: 0, needed: 100, title: "Novice" });
  assert.equal(levelFor(100).level, 2);
  assert.equal(levelFor(99).level, 1);
  const l5 = levelFor(100 + 283 + 520 + 800);
  assert.equal(l5.level, 5);
  assert.equal(l5.title, "Apprentice");
});

test("decisions give XP and feed streak-style counters", () => {
  const p = freshProgress();
  for (let i = 0; i < 5; i++) applyEvent(p, "decision", { grade: "best", kind: "checker", loss: 0, phase: "middle" }, { now: new Date(2026, 9, 14, 12).getTime() });
  assert.equal(p.xp, 75);
  assert.equal(p.counters.bestRunMax, 5);
  assert.equal(p.badges["sharp-eye"].tier, 0);
  const r = applyEvent(p, "decision", { grade: "blunder", kind: "checker", loss: 0.3, phase: "middle" }, { now: new Date(2026, 9, 14, 12).getTime() });
  assert.equal(p.counters.bestRun, 0);
  assert.equal(r.xp, 1);
});

test("wins scale with points and opponent level, and award badges once", () => {
  const p = freshProgress();
  const r = applyEvent(p, "gameEnd", { userWon: true, kind: "gammon", points: 2, level: "worldclass", log: { moves: 12, mistakes: 0, blunders: 0 } });
  assert.equal(r.xp, 160);
  const ids = r.badges.map((b) => b.id).sort();
  assert.deepEqual(ids, ["first-win", "flawless", "gammon-hunter", "giant-slayer"]);
  const again = applyEvent(p, "gameEnd", { userWon: true, kind: "single game", points: 1, level: "beginner", log: { moves: 3, mistakes: 1, blunders: 0 } });
  assert.equal(again.xp, 20);
  assert.deepEqual(again.badges, []);
});

test("level-up is reported", () => {
  const p = freshProgress();
  const r = applyEvent(p, "dailyDone", { perfect: true, streak: 3 }, { now: new Date(2026, 9, 14, 7).getTime() });
  assert.equal(r.xp, 150);
  assert.deepEqual(r.levelUp, { from: 1, to: 2 });
  assert.ok(r.badges.some((b) => b.id === "streak"));
  assert.ok(r.badges.some((b) => b.id === "early-bird"));
});

test("badge catalogue is well formed", () => {
  const ids = new Set();
  for (const b of BADGES) {
    assert.ok(!ids.has(b.id), `duplicate ${b.id}`);
    ids.add(b.id);
    assert.ok(b.goals.length >= 1 && b.goals.length <= 3);
    assert.deepEqual([...b.goals].sort((x, y) => x - y), b.goals);
  }
});
