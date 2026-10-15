// Versioned on-device storage plus a small event bus.
// Events: "decision", "gameEnd", "matchEnd" (later phases add "lessonDone", "dailyDone").

const KEY = "bgt.v2";
const MAX_DECISIONS = 1000;

const defaults = () => ({
  version: 2,
  prefs: {
    route: "#/play",
    phase: "any",
    closeOnly: false,
    theme: null,
    level: "intermediate",
    cube: true,
    feedback: true,
    matchLength: 0,
  },
  stats: {
    checker: { n: 0, loss: 0, good: 0 },
    cube: { n: 0, loss: 0, good: 0 },
    play: { n: 0, loss: 0, good: 0, games: 0, won: 0, points: 0, matches: 0, matchesWon: 0 },
  },
  recent: [],
  decisions: [],
  activeGame: null,
  learn: {}, // chapterId -> { lessonIndex: stars (0-3) }
  review: [], // spaced-repetition deck of past mistakes
  daily: {
    streak: { current: 0, best: 0, lastDay: null, freezes: 0, freezeUsedOn: [] },
    days: {}, // "YYYY-MM-DD" -> { total, grades: [], perfect }
    current: null, // in-progress challenge: { key, slots, results }
  },
});

const DAY = 24 * 60 * 60 * 1000;
// Leitner boxes: after a correct answer in box n the position comes back after REVIEW_DAYS[n] days.
export const REVIEW_DAYS = [1, 3, 7, 21];
export const MISTAKE = 0.05;

function merge(base, saved) {
  if (!saved || typeof saved !== "object" || Array.isArray(base)) return saved ?? base;
  const out = { ...base };
  for (const k of Object.keys(saved)) {
    out[k] = base[k] && typeof base[k] === "object" && !Array.isArray(base[k]) ? merge(base[k], saved[k]) : saved[k];
  }
  return out;
}

// v1 kept prefs and stats under separate keys.
function migrateV1(state) {
  try {
    const prefs = JSON.parse(localStorage.getItem("bgt.prefs.v1") || "null");
    const stats = JSON.parse(localStorage.getItem("bgt.stats.v1") || "null");
    if (prefs) {
      const { mode, ...rest } = prefs;
      Object.assign(state.prefs, rest);
      state.prefs.route = mode === "checker" ? "#/train/checker" : mode === "cube" ? "#/train/cube" : "#/play";
    }
    if (stats) {
      for (const k of ["checker", "cube", "play"]) if (stats[k]) Object.assign(state.stats[k], stats[k]);
      if (Array.isArray(stats.recent)) state.recent = stats.recent;
    }
  } catch { /* ignore broken v1 data */ }
  return state;
}

function load() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return migrateV1(defaults());
  try {
    return merge(defaults(), JSON.parse(raw));
  } catch {
    return defaults();
  }
}

const listeners = new Map();

export const store = {
  state: load(),

  save() {
    localStorage.setItem(KEY, JSON.stringify(this.state));
  },

  get prefs() {
    return this.state.prefs;
  },

  setPref(key, value) {
    this.state.prefs[key] = value;
    this.save();
  },

  on(event, fn) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(fn);
    return () => listeners.get(event).delete(fn);
  },

  emit(event, payload) {
    for (const fn of listeners.get(event) || []) fn(payload);
  },

  // mode: "checker" | "cube" | "play"; d: { source, kind, phase, loss, grade, category, positionId, matchId, reviewKind }
  // Mistakes with restorable IDs join the review deck.
  recordDecision(mode, d) {
    if (d.loss >= MISTAKE && d.positionId && d.matchId && d.reviewKind && d.source !== "review") {
      this.addReview({ kind: d.reviewKind, positionId: d.positionId, matchId: d.matchId, source: d.source });
    }
    const s = this.state.stats[mode];
    s.n++;
    s.loss += d.loss;
    if (d.loss < 0.02) s.good++;
    this.state.recent.push({ mode, grade: d.grade });
    this.state.recent = this.state.recent.slice(-60);
    this.state.decisions.push({ ts: Date.now(), mode, ...d });
    if (this.state.decisions.length > MAX_DECISIONS) this.state.decisions.splice(0, this.state.decisions.length - MAX_DECISIONS);
    this.save();
    this.emit("decision", { mode, ...d });
  },

  // ---------- review deck ----------

  addReview({ kind, positionId, matchId, source }) {
    const key = `${positionId}|${matchId}`;
    if (this.state.review.some((r) => r.key === key)) return;
    this.state.review.push({ key, kind, positionId, matchId, source, box: 0, due: Date.now(), added: Date.now() });
    this.save();
  },

  dueReviews(now = Date.now()) {
    return this.state.review.filter((r) => r.due <= now).sort((a, b) => a.due - b.due);
  },

  // Correct: move up a box (and retire after the last one). Wrong: back to box 0, due tomorrow.
  reviewAnswered(key, correct, now = Date.now()) {
    const i = this.state.review.findIndex((r) => r.key === key);
    if (i < 0) return null;
    const r = this.state.review[i];
    if (correct) {
      if (r.box >= REVIEW_DAYS.length - 1) {
        this.state.review.splice(i, 1);
        this.save();
        return "mastered";
      }
      r.due = now + REVIEW_DAYS[r.box] * DAY;
      r.box++;
    } else {
      r.box = 0;
      r.due = now + DAY;
    }
    this.save();
    return r.box;
  },

  // ---------- lessons ----------

  lessonStars(chapter, index) {
    return this.state.learn[chapter]?.[index] ?? null;
  },

  setLessonResult(chapter, index, stars) {
    const c = (this.state.learn[chapter] ||= {});
    c[index] = Math.max(c[index] ?? 0, stars);
    this.save();
  },

  resetStats(mode) {
    this.state.stats[mode] = defaults().stats[mode];
    this.state.recent = this.state.recent.filter((r) => r.mode !== mode);
    this.save();
  },
};
