// XP, levels and badge counters. Pure functions over a progress object; js/gamify.js wires them to events.
import { BADGES } from "./badges.js";

export const DECISION_XP = { best: 15, excellent: 10, inaccuracy: 5, mistake: 2, blunder: 1 };
export const LEVEL_MULT = { beginner: 0.5, casual: 0.75, intermediate: 1, advanced: 1.25, expert: 1.5, worldclass: 2 };
const TITLES = ["Novice", "Apprentice", "Club player", "Contender", "Expert", "Master", "Grandmaster"];

export function freshProgress() {
  return { xp: 0, badges: {}, counters: {} };
}

// XP needed to go from level L to L+1.
export const xpToNext = (level) => Math.round(100 * level ** 1.5);

export function levelFor(xp) {
  let level = 1, rest = xp;
  while (rest >= xpToNext(level)) {
    rest -= xpToNext(level);
    level++;
  }
  return { level, into: rest, needed: xpToNext(level), title: TITLES[Math.min(TITLES.length - 1, Math.floor(level / 5))] };
}

function bump(c, key, by = 1) {
  c[key] = (c[key] || 0) + by;
}

function max(c, key, value) {
  c[key] = Math.max(c[key] || 0, value);
}

// Applies one app event to the progress object (mutates it).
// Returns { xp, levelUp: {from, to} | null, badges: [{ id, tier }] } for notifications.
export function applyEvent(progress, type, e, ctx = {}) {
  const c = progress.counters;
  let xp = 0;
  const hour = new Date(ctx.now ?? Date.now()).getHours();

  if (type === "decision") {
    xp += DECISION_XP[e.grade] ?? 0;
    bump(c, "decisions");
    if (e.grade === "best") bump(c, "bestDecisions");
    if (e.kind === "checker") {
      c.bestRun = e.grade === "best" ? (c.bestRun || 0) + 1 : 0;
      max(c, "bestRunMax", c.bestRun);
      if (e.phase === "bearoff" && e.loss < 0.02) bump(c, "bearoffGood");
    }
    if (e.kind === "cube" && e.loss === 0) bump(c, "cubeCorrect");
    if (hour < 4) bump(c, "nightOwl");
  } else if (type === "gameEnd") {
    if (e.userWon) {
      xp += Math.round(40 * e.points * (LEVEL_MULT[e.level] ?? 1));
      bump(c, "gamesWon");
      if (e.kind === "gammon") bump(c, "gammonsWon");
      if (e.kind === "backgammon") { bump(c, "gammonsWon"); bump(c, "backgammonsWon"); }
      if (e.level === "expert" || e.level === "worldclass") bump(c, "strongWins");
      if ((e.maxDeficit || 0) >= 60) bump(c, "comebacks");
      if (e.log && e.log.moves >= 10 && e.log.mistakes + e.log.blunders === 0) bump(c, "flawless");
    }
  } else if (type === "matchEnd") {
    if (e.userWon) {
      xp += 30 * e.length;
      bump(c, "matchesWon");
      if (e.length >= 7) bump(c, "longMatchesWon");
    }
  } else if (type === "lessonDone") {
    xp += 50 * e.stars;
    if (e.passed) bump(c, "lessonsPassed");
    if (e.stars === 3) bump(c, "threeStarLessons");
    if (e.chaptersDone !== undefined) max(c, "chaptersDone", e.chaptersDone);
  } else if (type === "dailyDone") {
    xp += 100 + (e.perfect ? 50 : 0);
    bump(c, "dailies");
    if (e.perfect) bump(c, "perfectDailies");
    max(c, "dailyStreak", e.streak);
    if (hour < 8) bump(c, "earlyBird");
  } else if (type === "reviewMastered") {
    xp += 20;
    bump(c, "mastered");
  }

  const before = levelFor(progress.xp).level;
  progress.xp += xp;
  const after = levelFor(progress.xp).level;
  return { xp, levelUp: after > before ? { from: before, to: after } : null, badges: checkBadges(progress, ctx.now) };
}

// Awards any newly reached badge tiers. Returns [{ id, tier }].
export function checkBadges(progress, now = Date.now()) {
  const earned = [];
  for (const b of BADGES) {
    const value = progress.counters[b.counter] || 0;
    let tier = -1;
    b.goals.forEach((g, i) => { if (value >= g) tier = i; });
    const had = progress.badges[b.id]?.tier ?? -1;
    if (tier > had) {
      progress.badges[b.id] = { tier, at: now };
      earned.push({ id: b.id, tier });
    }
  }
  return earned;
}
