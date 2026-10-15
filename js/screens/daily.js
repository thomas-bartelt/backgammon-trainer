// Daily challenge screen: intro, ten positions with one try each, results with streak and calendar.
import { puzzleFromIds } from "../trainer.js";
import { inScratch } from "../session.js";
import { store } from "../store.js";
import { dayKey, pickDaily, scoreFor, completeDay, liveStreak, shareText, DAILY_SIZE, FREEZE_EVERY } from "../daily.js";
import { $, setView, esc, setTask, showActions, setNext, hideResult } from "../ui.js";

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

const prettyDate = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { weekday: "long", month: "long", day: "numeric" });
};

function untilMidnight() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const mins = Math.max(1, Math.round((next - now) / 60000));
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
}

export function createDailyScreen({ runner }) {
  let token = 0;
  let countdown = null;

  const daily = () => store.state.daily;

  const pageMode = (on) => setView(on ? "page" : "game");

  // ---------- calendar ----------

  function calendar(today) {
    const [y, m] = today.split("-").map(Number);
    const first = new Date(y, m - 1, 1);
    const days = new Date(y, m, 0).getDate();
    const offset = (first.getDay() + 6) % 7; // weeks start on Monday
    const done = daily().days;
    const frozen = new Set(daily().streak.freezeUsedOn || []);
    const cells = [];
    for (let i = 0; i < offset; i++) cells.push('<span class="cal-cell empty"></span>');
    for (let d = 1; d <= days; d++) {
      const key = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const rec = done[key];
      const cls = rec ? (rec.perfect ? "done perfect" : "done") : frozen.has(key) ? "frozen" : "";
      cells.push(`<span class="cal-cell ${cls} ${key === today ? "today" : ""}" title="${rec ? `${rec.total} points` : frozen.has(key) ? "Streak freeze used" : ""}">${d}</span>`);
    }
    const weekdays = ["M", "T", "W", "T", "F", "S", "S"].map((w) => `<span class="cal-head">${w}</span>`).join("");
    return `<div class="calendar"><div class="cal-title">${first.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</div>
      <div class="cal-grid">${weekdays}${cells.join("")}</div></div>`;
  }

  function streakBlock(today) {
    const s = daily().streak;
    const live = liveStreak(s, today);
    const toFreeze = FREEZE_EVERY - (live % FREEZE_EVERY);
    return `<div class="streak">
      <span class="streak-icon ${live ? "on" : ""}"><i class="ph-fill ph-fire"></i></span>
      <span class="streak-body"><strong>${live} day${live === 1 ? "" : "s"}</strong>
        <span>Current streak. Best ${s.best}.</span></span>
      <span class="streak-freeze" title="Streak freezes cover a missed day automatically">
        <i class="ph ph-snowflake"></i> ${s.freezes || 0}
        <span class="freeze-note">${toFreeze === FREEZE_EVERY && live ? "" : `next in ${toFreeze} day${toFreeze === 1 ? "" : "s"}`}</span></span>
    </div>`;
  }

  // ---------- intro and results pages ----------

  function renderIntro(today, my) {
    pageMode(true);
    $("page").innerHTML = `
      <header class="page-head">
        <span class="eyebrow-date">${esc(prettyDate(today))}</span>
        <h1>Daily challenge</h1>
        <p>${DAILY_SIZE} positions, the same for every player today. One try each: checker plays from opening to bear-off, three cube decisions and a final close call.</p>
      </header>
      <div class="daily-grid">
        <div class="daily-main">
          ${streakBlock(today)}
          <button class="btn btn--primary daily-start" id="daily-start"><span>${daily().current?.key === today ? "Continue" : "Start"} challenge</span><span class="btn__orb"><i class="ph ph-arrow-right"></i></span></button>
        </div>
        ${calendar(today)}
      </div>`;
    $("daily-start").addEventListener("click", () => play(today, my));
  }

  function renderResults(today) {
    pageMode(true);
    const rec = daily().days[today];
    const due = store.dueReviews().length;
    const squares = rec.grades.map((g, i) => `<span class="sq grade-${g}" style="--i:${i}"></span>`).join("");
    $("page").innerHTML = `
      <header class="page-head">
        <span class="eyebrow-date">${esc(prettyDate(today))}</span>
        <h1>${rec.total} <span class="out-of">/ ${rec.grades.length * 100}</span></h1>
        <p>${rec.perfect ? "A perfect run." : rec.total >= 800 ? "Strong play today." : "Your misses are in the review deck."} Next challenge in <span id="daily-countdown">${untilMidnight()}</span>.</p>
      </header>
      <div class="daily-grid">
        <div class="daily-main">
          <div class="squares">${squares}</div>
          ${streakBlock(today)}
          <div class="daily-actions">
            <button class="btn btn--ghost" id="daily-share"><i class="ph ph-share-network"></i><span>Copy result</span></button>
            ${due ? `<a class="btn btn--primary" href="#/train/review"><span>Review ${due} mistake${due > 1 ? "s" : ""}</span><span class="btn__orb"><i class="ph ph-arrow-right"></i></span></a>` : `<a class="btn btn--primary" href="#/learn"><span>Keep learning</span><span class="btn__orb"><i class="ph ph-arrow-right"></i></span></a>`}
          </div>
        </div>
        ${calendar(today)}
      </div>`;
    $("daily-share").addEventListener("click", async (e) => {
      const text = shareText(today, rec.grades.map((grade) => ({ grade })), rec.total, liveStreak(daily().streak, today));
      try {
        await navigator.clipboard.writeText(text);
        e.currentTarget.querySelector("span").textContent = "Copied";
      } catch {
        e.currentTarget.querySelector("span").textContent = "Copy failed";
      }
    });
    clearInterval(countdown);
    countdown = setInterval(() => {
      const el = $("daily-countdown");
      if (!el) return clearInterval(countdown);
      if (dayKey() !== today) return location.reload();
      el.textContent = untilMidnight();
    }, 30000);
  }

  // ---------- playing ----------

  function renderDots(cur) {
    const el = $("scoreline");
    el.hidden = false;
    const total = cur.results.reduce((a, r) => a + r.score, 0);
    el.innerHTML = `<span class="lesson-dots">${cur.slots.map((_, i) => {
      const r = cur.results[i];
      return `<span class="dot ${r ? `grade-${r.grade}` : i === cur.results.length ? "current" : ""}"></span>`;
    }).join("")}</span><span>Daily challenge</span><span><strong>${total}</strong> points</span>`;
  }

  async function play(today, my) {
    const d = daily();
    if (d.current?.key !== today) {
      d.current = { key: today, slots: pickDaily(data.bank, data.chapters, today), results: [] };
      store.save();
    }
    pageMode(false);
    hideResult();
    next(my);
  }

  async function next(my) {
    const cur = daily().current;
    const i = cur.results.length;
    if (i >= cur.slots.length) return finish(my);
    renderDots(cur);
    setTask("Loading position", "");
    showActions(null);
    const slot = cur.slots[i];
    const p = await inScratch(() => puzzleFromIds({ kind: slot.kind, positionId: slot.p, matchId: slot.m, phase: slot.chapter === "bearoff" ? "bearoff" : null }));
    if (my !== token) return;
    if (!p) {
      cur.results.push({ score: 100, grade: "best", loss: 0, skipped: true });
      store.save();
      return next(my);
    }
    const sub = `Position ${i + 1} of ${cur.slots.length}${slot.boss ? ". Final position: a close call." : "."} One try.`;
    const r = await runner.present(p, { sub });
    if (my !== token) return;
    const score = scoreFor(r.loss);
    cur.results.push({ score, grade: r.grade.key, loss: r.loss });
    store.save();
    const mode = p.kind === "checker" ? "checker" : "cube";
    store.recordDecision(mode, {
      source: "daily", kind: mode, phase: p.phase, loss: r.loss, grade: r.grade.key, category: r.category,
      positionId: p.positionId, matchId: p.matchId, reviewKind: p.kind,
    });
    renderDots(cur);
    $("task-status").textContent = `+${score} points`;
    setNext(i + 1 < cur.slots.length ? "Next position" : "See results");
  }

  function finish(my) {
    const d = daily();
    const cur = d.current;
    const total = cur.results.reduce((a, r) => a + r.score, 0);
    const grades = cur.results.map((r) => r.grade);
    const perfect = cur.results.every((r) => r.loss < 0.02);
    d.days[cur.key] = { total, grades, perfect };
    d.streak = completeDay(d.streak, cur.key);
    d.current = null;
    store.save();
    store.emit("dailyDone", { key: cur.key, total, perfect, streak: d.streak.current });
    runner.reset();
    $("scoreline").hidden = true;
    if (my === token) renderResults(cur.key);
  }

  return {
    statsMode: () => "checker",
    async enter() {
      const my = ++token;
      await loadData();
      if (my !== token) return;
      const today = dayKey();
      const d = daily();
      if (d.current && d.current.key !== today) d.current = null; // yesterday's unfinished run expires
      if (d.days[today]) return renderResults(today);
      if (d.current?.key === today && d.current.results.length) {
        // Resume an interrupted run straight on the board.
        pageMode(false);
        return next(my);
      }
      renderIntro(today, my);
    },
    leave() {
      token++;
      clearInterval(countdown);
      runner.reset();
      pageMode(false);
      $("scoreline").hidden = true;
    },
    submit: () => runner.submit(),
    next() {
      next(token);
    },
  };
}
