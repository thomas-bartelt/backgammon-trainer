// Learning path: chapters of curated positions in lessons of 8, from easy to close calls.
import { puzzleFromIds } from "../trainer.js";
import { inScratch } from "../session.js";
import { store } from "../store.js";
import { TIER_LABELS, LESSON_SIZE, lessonsFor } from "../themes.js";
import { $, setView, esc, setTask, showActions, choose, setNext, showResult, hideResult, verdict } from "../ui.js";

const PASS_SHARE = 0.75; // 6 of 8 answers Excellent or better

let data = null;
async function loadData() {
  if (data) return data;
  const [curriculum, bank] = await Promise.all([
    fetch("data/curriculum.json").then((r) => r.json()),
    fetch("data/bank.json").then((r) => r.json()),
  ]);
  data = { chapters: curriculum.chapters, bank: bank.chapters };
  return data;
}

const CATEGORY_CHAPTER = {
  "Safety error": "safety",
  "Missed attack": "hitting",
  "Structural miss": "points",
  "Stuck back checkers": "primes",
  "Gammon management": "safety",
};

// The chapter where recent losses concentrate, or the first unfinished one.
function recommend(chapters) {
  const losses = {};
  for (const d of store.state.decisions.slice(-300)) {
    let ch = CATEGORY_CHAPTER[d.category];
    if (d.category === "Racing inefficiency") ch = d.phase === "bearoff" ? "bearoff" : "racing";
    if (d.category === "Cube error") ch = d.reviewKind === "take" ? "take" : "cube";
    if (!ch || !d.loss) continue;
    (losses[ch] ||= { loss: 0, n: 0 }).loss += d.loss;
    losses[ch].n++;
  }
  const weak = Object.entries(losses).filter(([, v]) => v.n >= 3).sort((a, b) => b[1].loss - a[1].loss)[0];
  if (weak) {
    const ch = chapters.find((c) => c.id === weak[0]);
    return { chapter: ch, reason: `${weak[1].n} of your recent errors were in this area, costing ${weak[1].loss.toFixed(2)} equity in total.` };
  }
  const next = chapters.find((c) => !chapterDone(c));
  return next ? { chapter: next, reason: "Pick up where the path continues." } : null;
}

function chapterProgress(c) {
  const lessons = lessonsFor(data.bank[c.id]);
  const stars = lessons.map((_, i) => store.lessonStars(c.id, i) ?? 0);
  const passed = stars.filter((s) => s >= 1).length;
  return { lessons, stars, passed, total: lessons.length, next: Math.min(passed, lessons.length - 1) };
}

function chapterDone(c) {
  const p = chapterProgress(c);
  return p.passed >= p.total;
}

const starIcons = (n, max = 3) =>
  Array.from({ length: max }, (_, i) => `<i class="ph${i < n ? "-fill" : ""} ph-star"></i>`).join("");

export function createLearnScreen({ runner }) {
  let token = 0;
  let lesson = null; // { chapter, index, items, results: [] }

  const pageMode = (on) => setView(on ? "page" : "game");

  // ---------- overview ----------

  function renderOverview() {
    const rec = recommend(data.chapters);
    const due = store.dueReviews().length;
    $("page").innerHTML = `
      <header class="page-head">
        <h1>Learn</h1>
        <p>Ten chapters, from the opening roll to the doubling cube. Each lesson has ${LESSON_SIZE} positions; get 6 right to unlock the next.</p>
      </header>
      <div class="learn-top">
        ${rec ? `<a class="feature-card" href="#/learn/${rec.chapter.id}">
          <span class="feature-icon"><i class="ph ${rec.chapter.icon}"></i></span>
          <span class="feature-body"><span class="feature-label">Recommended for you</span>
          <strong>${esc(rec.chapter.title)}</strong><span class="feature-text">${esc(rec.reason)}</span></span>
          <i class="ph ph-arrow-right feature-go"></i></a>` : ""}
        <a class="feature-card quiet" href="#/train/review">
          <span class="feature-icon"><i class="ph ph-arrow-counter-clockwise"></i></span>
          <span class="feature-body"><span class="feature-label">Review</span>
          <strong>${due ? `${due} mistake${due > 1 ? "s" : ""} to revisit` : "No reviews due"}</strong>
          <span class="feature-text">${store.state.review.length} position${store.state.review.length === 1 ? "" : "s"} in your deck.</span></span>
          <i class="ph ph-arrow-right feature-go"></i></a>
      </div>
      <ol class="chapter-grid">
        ${data.chapters.map((c, i) => {
          const p = chapterProgress(c);
          const earned = p.stars.reduce((a, b) => a + b, 0);
          return `<li><a class="chapter-card ${p.passed === p.total ? "done" : ""}" href="#/learn/${c.id}">
            <span class="chapter-num">${i + 1}</span>
            <span class="chapter-icon"><i class="ph ${c.icon}"></i></span>
            <strong class="chapter-title">${esc(c.title)}</strong>
            <span class="chapter-meta">${p.passed} of ${p.total} lessons<span class="stars" aria-label="${earned} stars">${starIcons(Math.round((earned / (p.total * 3)) * 3))}</span></span>
          </a></li>`;
        }).join("")}
      </ol>`;
  }

  // ---------- chapter ----------

  function renderChapter(c) {
    const p = chapterProgress(c);
    $("page").innerHTML = `
      <a class="back-link" href="#/learn"><i class="ph ph-arrow-left"></i>All chapters</a>
      <header class="page-head">
        <span class="chapter-icon big"><i class="ph ${c.icon}"></i></span>
        <h1>${esc(c.title)}</h1>
        <p>${esc(c.concept)}</p>
      </header>
      <ol class="lesson-list">
        ${p.lessons.map((l, i) => {
          const stars = store.lessonStars(c.id, i);
          const locked = i > 0 && !((store.lessonStars(c.id, i - 1) ?? 0) >= 1);
          return `<li><a class="lesson-tile ${locked ? "locked" : ""} ${stars >= 1 ? "passed" : ""}" ${locked ? 'aria-disabled="true"' : `href="#/learn/${c.id}/${i}"`}>
            <span class="lesson-num">Lesson ${i + 1}</span>
            <span class="tier tier-${l.tier}">${TIER_LABELS[l.tier]}</span>
            <span class="lesson-meta">${l.items.length} positions</span>
            <span class="stars">${locked ? '<i class="ph ph-lock-simple"></i>' : starIcons(stars ?? 0)}</span>
          </a></li>`;
        }).join("")}
      </ol>`;
  }

  // ---------- lesson ----------

  function renderDots() {
    const el = $("scoreline");
    el.hidden = false;
    el.innerHTML = `<span class="lesson-dots">${lesson.items.map((_, i) => {
      const r = lesson.results[i];
      return `<span class="dot ${r ? `grade-${r.grade.key}` : i === lesson.results.length ? "current" : ""}"></span>`;
    }).join("")}</span><span>${esc(lesson.chapter.title)}, lesson ${lesson.index + 1}</span>`;
  }

  async function startLesson(c, index, my) {
    const lessons = lessonsFor(data.bank[c.id]);
    const l = lessons[index];
    if (!l) return (location.hash = `#/learn/${c.id}`);
    lesson = { chapter: c, index, tier: l.tier, items: l.items, results: [] };
    hideResult();
    renderDots();
    setTask(`${c.title}: lesson ${index + 1}`, `${esc(c.concept)}`, `${TIER_LABELS[l.tier]}. ${l.items.length} positions.`);
    const go = await choose([{ value: "back", label: "Back", ghost: true }, { value: "start", label: "Start lesson", primary: true }]);
    if (my !== token || !go) return;
    if (go === "back") return (location.hash = `#/learn/${c.id}`);
    nextPosition(my);
  }

  async function nextPosition(my) {
    const i = lesson.results.length;
    if (i >= lesson.items.length) return finishLesson(my);
    renderDots();
    setTask("Loading position", "");
    showActions(null);
    const item = lesson.items[i];
    const kind = lesson.chapter.kind;
    const p = await inScratch(() => puzzleFromIds({ kind, positionId: item.p, matchId: item.m, phase: lesson.chapter.id === "bearoff" ? "bearoff" : null }));
    if (my !== token) return;
    if (!p) {
      lesson.results.push({ loss: 0, grade: { key: "best" }, correct: true, skipped: true });
      return nextPosition(my);
    }
    const sub = `${lesson.chapter.title}, ${TIER_LABELS[lesson.tier].toLowerCase()}. Position ${i + 1} of ${lesson.items.length}.`;
    const r = await runner.present(p, { sub });
    if (my !== token) return;
    lesson.results.push(r);
    renderDots();
    const mode = p.kind === "checker" ? "checker" : "cube";
    store.recordDecision(mode, {
      source: "lesson", kind: mode, phase: p.phase, loss: r.loss, grade: r.grade.key, category: r.category,
      positionId: p.positionId, matchId: p.matchId, reviewKind: p.kind, chapter: lesson.chapter.id,
    });
    setNext(i + 1 < lesson.items.length ? "Next position" : "See results");
  }

  async function finishLesson(my) {
    const { results, chapter, index } = lesson;
    const scored = results.filter((r) => !r.skipped);
    const good = scored.filter((r) => r.loss < 0.02).length;
    const avg = scored.reduce((a, r) => a + r.loss, 0) / Math.max(1, scored.length);
    const passed = good >= Math.ceil(scored.length * PASS_SHARE);
    const stars = !passed ? 0 : avg < 0.01 ? 3 : avg < 0.025 ? 2 : 1;
    store.setLessonResult(chapter.id, index, stars);
    store.emit("lessonDone", { chapter: chapter.id, index, stars, passed, good, total: scored.length, chaptersDone: data.chapters.filter(chapterDone).length });
    runner.reset();
    renderDots();
    const lessons = lessonsFor(data.bank[chapter.id]);
    const hasNext = index + 1 < lessons.length;
    setTask(passed ? "Lesson passed" : "Not quite", passed
      ? `${good} of ${scored.length} answers were excellent or better.${hasNext ? " The next lesson is unlocked." : " You finished this chapter."}`
      : `${good} of ${scored.length} were excellent or better. You need ${Math.ceil(scored.length * PASS_SHARE)} to pass. Your mistakes are in the review deck.`);
    showResult(passed ? "best" : "mistake", `
      ${verdict(passed ? "Lesson summary" : "Try again", null)}
      <div class="lesson-stars">${starIcons(stars)}</div>
      <dl class="probs">
        <div class="prob"><dt>Correct</dt><dd>${good}/${scored.length}</dd></div>
        <div class="prob"><dt>Avg. loss</dt><dd>${avg.toFixed(3)}</dd></div>
        <div class="prob"><dt>Tier</dt><dd class="small">${TIER_LABELS[lesson.tier]}</dd></div>
      </dl>
      <p class="verdict-note">3 stars: average loss under 0.010. 2 stars: under 0.025.</p>
    `);
    const options = [{ value: "chapter", label: "Chapter", ghost: true }, { value: "retry", label: "Retry" }];
    if (passed && hasNext) options.push({ value: "next", label: "Next lesson", primary: true });
    else options[1].primary = true;
    const answer = await choose(options);
    if (my !== token || !answer) return;
    if (answer === "chapter") location.hash = `#/learn/${chapter.id}`;
    else if (answer === "retry") startLesson(chapter, index, ++token);
    else location.hash = `#/learn/${chapter.id}/${index + 1}`;
  }

  return {
    statsMode: () => (lesson?.chapter.kind === "checker" || !lesson ? "checker" : "cube"),
    async enter(params) {
      const my = ++token;
      await loadData();
      if (my !== token) return;
      const chapter = data.chapters.find((c) => c.id === params.chapter);
      if (chapter && params.lesson !== undefined) {
        pageMode(false);
        return startLesson(chapter, Number(params.lesson), my);
      }
      pageMode(true);
      $("scoreline").hidden = true;
      if (chapter) renderChapter(chapter);
      else renderOverview();
      window.scrollTo(0, 0);
    },
    leave() {
      token++;
      lesson = null;
      runner.reset();
      pageMode(false);
      $("scoreline").hidden = true;
    },
    submit: () => runner.submit(),
    next() {
      if (lesson) nextPosition(token);
    },
  };
}
