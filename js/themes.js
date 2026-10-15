// Sorts positions into curriculum chapters and difficulty tiers. Pure functions.
import { applyNotation, hasContact } from "./game.js";
import { features } from "./explain.js";

export const TIERS = ["easy", "medium", "hard", "close"];
export const TIER_LABELS = { easy: "Easy", medium: "Medium", hard: "Hard", close: "Close calls" };

// Checker play: gap between the best and second-best play.
export function checkerTier(gap) {
  if (gap >= 0.1) return "easy";
  if (gap >= 0.04) return "medium";
  if (gap >= 0.015) return "hard";
  return "close";
}

// Cube: how far the decision is from the doubling (or take) boundary.
export function cubeTier(margin) {
  if (margin >= 0.15) return "easy";
  if (margin >= 0.07) return "medium";
  if (margin >= 0.03) return "hard";
  return "close";
}

const hits = (start, after) => after.opp[0] > start.opp[0];

// Chapters a checker-play position belongs to. moveNumber: 1 = first move of the game.
export function checkerThemes(start, hints, moveNumber) {
  if (hints.length < 2) return [];
  if (moveNumber === 1) return ["opening"];
  if (moveNumber <= 4) return ["replies"];
  const themes = [];
  const contact = hasContact(start);
  const [b1, b2] = hints;
  const p1 = applyNotation(start, b1.move), p2 = applyNotation(start, b2.move);
  const f0 = features(start), f1 = features(p1), f2 = features(p2);

  if (!contact) {
    let outside = start.me[25];
    for (let i = 7; i <= 24; i++) outside += start.me[i];
    themes.push(outside > 0 ? "racing" : "bearoff");
    return themes;
  }
  const newPoint = (f) => f.made.some((m, i) => m && !f0.made[i] && i <= 11);
  if (newPoint(f1) || newPoint(f2)) themes.push("points");
  if (hits(start, p1) || hits(start, p2)) themes.push("hitting");
  if (Math.abs(f1.shots.exposed - f2.shots.exposed) >= 6) themes.push("safety");
  if (Math.max(f0.prime, f1.prime, f2.prime) >= 4 || f1.anchors.length !== f2.anchors.length) themes.push("primes");
  return themes;
}

// cube: parsed cube hint; kind "double" (user on roll) or "take" (engine on roll).
export function cubeMargin(kind, cube) {
  return kind === "double" ? Math.abs(Math.min(cube.dt, cube.dp) - cube.nd) : Math.abs(cube.dt - cube.dp);
}

export const LESSON_SIZE = 8;

// Groups a chapter's positions into lessons, easiest tier first. Tiers too small for a lesson
// roll into the next one, and short leftovers join the previous lesson.
export function lessonsFor(bankChapter) {
  const lessons = [];
  let carry = [];
  for (const tier of TIERS) {
    const list = carry.concat((bankChapter?.[tier] || []).map((e) => ({ ...e, tier })));
    carry = [];
    if (list.length < 4) { carry = list; continue; }
    for (let i = 0; i < list.length; i += LESSON_SIZE) {
      const chunk = list.slice(i, i + LESSON_SIZE);
      if (chunk.length < 4 && lessons.length) lessons[lessons.length - 1].items.push(...chunk);
      else lessons.push({ tier, items: chunk });
    }
  }
  if (carry.length) {
    if (lessons.length) lessons[lessons.length - 1].items.push(...carry);
    else lessons.push({ tier: carry[0].tier, items: carry });
  }
  return lessons;
}
