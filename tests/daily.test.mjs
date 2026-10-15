import { test } from "node:test";
import assert from "node:assert/strict";
import { dayKey, daysBetween, addDays, pickDaily, scoreFor, completeDay, liveStreak, shareText } from "../js/daily.js";
import { mulberry32, seedFrom } from "../js/rng.js";

test("seeded rng is reproducible", () => {
  const a = mulberry32(seedFrom("2026-10-14")), b = mulberry32(seedFrom("2026-10-14"));
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
  assert.notEqual(mulberry32(seedFrom("2026-10-15"))(), mulberry32(seedFrom("2026-10-14"))());
});

test("day arithmetic ignores DST shifts", () => {
  assert.equal(daysBetween("2026-10-24", "2026-10-26"), 2); // across the end of summer time in Europe
  assert.equal(daysBetween("2026-03-28", "2026-03-30"), 2);
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(dayKey(new Date(2026, 9, 14, 23, 59)), "2026-10-14");
});

test("daily picks are deterministic per date and well mixed", () => {
  const mk = (n) => Array.from({ length: n }, (_, i) => ({ p: `p${i}`, m: `m${i}`, g: 0 }));
  const tiers = () => ({ easy: mk(10), medium: mk(10), hard: mk(10), close: mk(10) });
  const ids = ["opening", "replies", "points", "hitting", "safety", "primes", "racing", "bearoff", "cube", "take"];
  const bank = Object.fromEntries(ids.map((id) => [id, tiers()]));
  // Distinct ids per chapter so duplicates across chapters can't collide.
  for (const id of ids) for (const t of Object.keys(bank[id])) bank[id][t] = bank[id][t].map((e) => ({ ...e, p: id + e.p }));
  const chapters = ids.map((id) => ({ id, kind: id === "cube" ? "double" : id === "take" ? "take" : "checker" }));
  const a = pickDaily(bank, chapters, "2026-10-14");
  const b = pickDaily(bank, chapters, "2026-10-14");
  assert.deepEqual(a, b);
  assert.equal(a.length, 10);
  assert.equal(a.filter((s) => s.kind === "checker").length, 7);
  assert.equal(a.filter((s) => s.kind !== "checker").length, 3);
  assert.equal(a.filter((s) => s.boss).length, 1);
  assert.notDeepEqual(pickDaily(bank, chapters, "2026-10-15"), a);
});

test("scores", () => {
  assert.equal(scoreFor(0), 100);
  assert.equal(scoreFor(0.034), 66);
  assert.equal(scoreFor(0.5), 0);
});

test("streaks grow, break, and are rescued by freezes", () => {
  let s = completeDay(undefined, "2026-10-01");
  assert.equal(s.current, 1);
  s = completeDay(s, "2026-10-01");
  assert.equal(s.current, 1, "same day twice counts once");
  for (let d = 2; d <= 7; d++) s = completeDay(s, `2026-10-0${d}`);
  assert.equal(s.current, 7);
  assert.equal(s.freezes, 1, "a freeze every 7 days");
  // Miss the 8th, play the 9th: the freeze covers it.
  assert.equal(liveStreak(s, "2026-10-09"), 7);
  s = completeDay(s, "2026-10-09");
  assert.equal(s.current, 8);
  assert.equal(s.freezes, 0);
  assert.deepEqual(s.freezeUsedOn, ["2026-10-08"]);
  // Miss two days without freezes: reset.
  assert.equal(liveStreak(s, "2026-10-12"), 0);
  s = completeDay(s, "2026-10-12");
  assert.equal(s.current, 1);
  assert.equal(s.best, 8);
});

test("share text", () => {
  const t = shareText("2026-10-14", [{ grade: "best" }, { grade: "blunder" }], 150, 3);
  assert.match(t, /🟩🟥/);
  assert.match(t, /150\/200  3-day streak/);
});
