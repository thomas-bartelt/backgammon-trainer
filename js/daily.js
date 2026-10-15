// Daily challenge: the same ten positions for everyone on a given date (seeded from the date,
// drawn from the curated bank), plus streak bookkeeping. Pure functions; no DOM or engine.
import { mulberry32, seedFrom } from "./rng.js";

export const DAILY_SIZE = 10;
export const FREEZE_EVERY = 7; // a streak freeze is earned every 7 days of streak
export const MAX_FREEZES = 2;

// Local calendar date "YYYY-MM-DD" (not UTC, so the challenge flips at the user's midnight).
export function dayKey(date = new Date()) {
  const y = date.getFullYear(), m = String(date.getMonth() + 1).padStart(2, "0"), d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Whole days between two day keys, immune to DST (both parsed as UTC midnights).
export function daysBetween(a, b) {
  const toUtc = (k) => { const [y, m, d] = k.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((toUtc(b) - toUtc(a)) / 86400000);
}

export function addDays(key, n) {
  const [y, m, d] = key.split("-").map(Number);
  return dayKey(new Date(y, m - 1, d + n));
}

const PLAN = [
  ["opening", "replies"], ["points", "hitting"], ["safety", "primes"], ["hitting", "points"],
  ["racing", "bearoff"], ["bearoff", "racing"],
];

// Picks today's slots from the bank: 6 checker plays, 3 cube decisions, 1 close-call boss.
// Each slot: { chapter, kind, p, m, tier, boss? }.
export function pickDaily(bank, chapters, key) {
  const rng = mulberry32(seedFrom("daily:" + key));
  const kindOf = Object.fromEntries(chapters.map((c) => [c.id, c.kind]));
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const used = new Set();
  const draw = (chapter, tiers) => {
    const pool = tiers.flatMap((t) => (bank[chapter]?.[t] || []).map((e) => ({ ...e, tier: t })))
      .filter((e) => !used.has(e.p + e.m));
    if (!pool.length) return null;
    const e = pick(pool);
    used.add(e.p + e.m);
    return { chapter, kind: kindOf[chapter], p: e.p, m: e.m, tier: e.tier };
  };
  const slots = [];
  for (const options of PLAN) {
    const chapter = pick(options);
    slots.push(draw(chapter, ["easy", "medium", "hard"]) || draw(options[0], ["easy", "medium", "hard", "close"]));
  }
  slots.push(draw("cube", ["easy", "medium", "hard"]));
  slots.push(draw("take", ["easy", "medium", "hard"]));
  slots.push(draw(pick(["cube", "take"]), ["medium", "hard"]));
  const boss = draw(pick(["points", "hitting", "safety", "primes"]), ["close"]);
  if (boss) slots.push({ ...boss, boss: true });
  return slots.filter(Boolean);
}

// 100 per decision, minus 1000 x equity lost, floored at 0.
export function scoreFor(loss) {
  return Math.max(0, Math.round(100 - loss * 1000));
}

// streak: { current, best, lastDay, freezes, freezeUsedOn: [] }. Returns the updated streak
// after completing the challenge on `today`.
export function completeDay(streak, today) {
  const s = { current: 0, best: 0, lastDay: null, freezes: 0, freezeUsedOn: [], ...streak };
  if (s.lastDay === today) return s;
  const gap = s.lastDay ? daysBetween(s.lastDay, today) : Infinity;
  if (gap === 1) s.current++;
  else if (gap > 1 && gap - 1 <= s.freezes) {
    // Missed days are covered by freezes.
    for (let i = 1; i < gap; i++) s.freezeUsedOn.push(addDays(s.lastDay, i));
    s.freezes -= gap - 1;
    s.current++;
  } else s.current = 1;
  if (s.current % FREEZE_EVERY === 0) s.freezes = Math.min(MAX_FREEZES, s.freezes + 1);
  s.best = Math.max(s.best, s.current);
  s.lastDay = today;
  return s;
}

// Streak as it stands today, before playing: broken if more days were missed than freezes cover.
export function liveStreak(streak, today) {
  if (!streak?.lastDay) return 0;
  const gap = daysBetween(streak.lastDay, today);
  return gap <= 1 || gap - 1 <= (streak.freezes || 0) ? streak.current : 0;
}

const SQUARE = { best: "🟩", excellent: "🟩", inaccuracy: "🟨", mistake: "🟧", blunder: "🟥" };

export function shareText(key, results, total, streak) {
  const squares = results.map((r) => SQUARE[r.grade] || "⬜").join("");
  return `Backgammon Trainer daily ${key}\n${squares}\n${total}/${results.length * 100}${streak > 1 ? `  ${streak}-day streak` : ""}`;
}
