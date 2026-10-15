// Profile: level and XP, headline stats, error trend chart, accuracy by game phase, badges.
import { store } from "../store.js";
import { levelFor } from "../progress.js";
import { BADGES, TIER_NAMES } from "../badges.js";
import { progress } from "../gamify.js";
import { dayKey, liveStreak } from "../daily.js";
import { $, esc, setView } from "../ui.js";

const DAYS = 30;

// Average loss per day over the last 30 days (days with at least 3 decisions).
function dailyLoss() {
  const byDay = new Map();
  const since = Date.now() - DAYS * 86400000;
  for (const d of store.state.decisions) {
    if (d.ts < since) continue;
    const key = dayKey(new Date(d.ts));
    const v = byDay.get(key) || { loss: 0, n: 0 };
    v.loss += d.loss;
    v.n++;
    byDay.set(key, v);
  }
  return [...byDay].filter(([, v]) => v.n >= 3).sort(([a], [b]) => a.localeCompare(b))
    .map(([day, v]) => ({ day, avg: v.loss / v.n, n: v.n }));
}

const shortDate = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

// Single-series line chart: 2px line, hairline grid, end dot with its value, crosshair tooltip.
function trendChart(points) {
  if (points.length < 2) {
    return `<p class="chart-empty">Train on two or more days to see your trend here.</p>`;
  }
  const W = 640, H = 220, L = 44, R = 56, T = 14, B = 28;
  const today = dayKey();
  const dayIndex = (key) => DAYS - 1 - Math.round((Date.parse(today) - Date.parse(key)) / 86400000);
  const maxY = Math.max(0.05, ...points.map((p) => p.avg)) * 1.15;
  const x = (i) => L + (i / (DAYS - 1)) * (W - L - R);
  const y = (v) => T + (1 - v / maxY) * (H - T - B);
  const ticks = [0, maxY / 2, maxY].map((v) => Number(v.toFixed(3)));
  const pts = points.map((p) => ({ ...p, cx: x(dayIndex(p.day)), cy: y(p.avg) }));
  const last = pts[pts.length - 1];
  return `
    <div class="chart" data-points='${JSON.stringify(pts.map(({ day, avg, n, cx, cy }) => ({ day, avg, n, cx, cy })))}'>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Average equity loss per day, last ${DAYS} days">
        ${ticks.map((v) => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/>
          <text class="axis" x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v.toFixed(3)}</text>`).join("")}
        <text class="axis" x="${L}" y="${H - 8}">${shortDate(dayKey(new Date(Date.now() - (DAYS - 1) * 86400000)))}</text>
        <text class="axis" x="${W - R}" y="${H - 8}" text-anchor="end">Today</text>
        <path class="series-area" d="M${pts.map((p) => `${p.cx},${p.cy}`).join(" L")} L${last.cx},${y(0)} L${pts[0].cx},${y(0)} Z"/>
        <polyline class="series" points="${pts.map((p) => `${p.cx},${p.cy}`).join(" ")}"/>
        <circle class="series-dot" cx="${last.cx}" cy="${last.cy}" r="5"/>
        <text class="end-label" x="${last.cx + 9}" y="${last.cy + 4}">${last.avg.toFixed(3)}</text>
        <line class="crosshair" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/>
        <circle class="hover-dot" r="5" visibility="hidden"/>
        <rect class="hit" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" tabindex="0" aria-label="Explore values"/>
      </svg>
      <div class="chart-tip" hidden></div>
    </div>`;
}

function bindChart(root) {
  const chart = root.querySelector(".chart");
  if (!chart) return;
  const pts = JSON.parse(chart.dataset.points);
  const svg = chart.querySelector("svg");
  const hair = svg.querySelector(".crosshair"), dot = svg.querySelector(".hover-dot"), tip = chart.querySelector(".chart-tip");
  const show = (p) => {
    hair.setAttribute("x1", p.cx); hair.setAttribute("x2", p.cx); hair.setAttribute("visibility", "visible");
    dot.setAttribute("cx", p.cx); dot.setAttribute("cy", p.cy); dot.setAttribute("visibility", "visible");
    tip.hidden = false;
    tip.replaceChildren();
    const head = document.createElement("strong");
    head.textContent = shortDate(p.day);
    const row = document.createElement("span");
    row.innerHTML = '<i class="tip-key"></i>';
    row.append(`Avg. loss ${p.avg.toFixed(3)} over ${p.n} decisions`);
    tip.append(head, row);
    const box = svg.getBoundingClientRect();
    const px = (p.cx / 640) * box.width;
    tip.style.left = `${Math.min(Math.max(px, 90), box.width - 90)}px`;
  };
  const hide = () => { hair.setAttribute("visibility", "hidden"); dot.setAttribute("visibility", "hidden"); tip.hidden = true; };
  const nearest = (clientX) => {
    const box = svg.getBoundingClientRect();
    const vx = ((clientX - box.left) / box.width) * 640;
    return pts.reduce((a, b) => (Math.abs(b.cx - vx) < Math.abs(a.cx - vx) ? b : a));
  };
  const hit = svg.querySelector(".hit");
  hit.addEventListener("pointermove", (e) => show(nearest(e.clientX)));
  hit.addEventListener("pointerleave", hide);
  let focusIdx = pts.length - 1;
  hit.addEventListener("focus", () => show(pts[focusIdx]));
  hit.addEventListener("blur", hide);
  hit.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") focusIdx = Math.max(0, focusIdx - 1);
    else if (e.key === "ArrowRight") focusIdx = Math.min(pts.length - 1, focusIdx + 1);
    else return;
    e.preventDefault();
    show(pts[focusIdx]);
  });
}

const PHASES = [
  ["opening", "Opening", (d) => d.kind === "checker" && d.phase === "opening"],
  ["middle", "Middle game", (d) => d.kind === "checker" && d.phase === "middle"],
  ["bearoff", "Race and bear-off", (d) => d.kind === "checker" && d.phase === "bearoff"],
  ["cube", "Cube decisions", (d) => d.kind === "cube"],
];

function phaseRows() {
  const recent = store.state.decisions.slice(-500);
  const rows = PHASES.map(([id, label, test]) => {
    const ds = recent.filter(test);
    const n = ds.length;
    return { id, label, n, acc: n ? ds.filter((d) => d.loss < 0.02).length / n : null, avg: n ? ds.reduce((a, d) => a + d.loss, 0) / n : null };
  });
  const scored = rows.filter((r) => r.n >= 5);
  const weakest = scored.length > 1 ? scored.reduce((a, b) => (b.avg > a.avg ? b : a)).id : null;
  return `<div class="phase-table" role="table" aria-label="Accuracy by game phase">
    <div class="phase-row head" role="row"><span role="columnheader">Phase</span><span role="columnheader">Decisions</span><span role="columnheader">Accuracy</span><span role="columnheader">Avg. loss</span></div>
    ${rows.map((r) => `<div class="phase-row" role="row">
      <span role="cell">${r.label}${r.id === weakest ? ' <span class="weak-tag">Weakest</span>' : ""}</span>
      <span role="cell">${r.n}</span>
      <span role="cell">${r.acc === null ? "-" : Math.round(r.acc * 100) + "%"}</span>
      <span role="cell">${r.avg === null ? "-" : r.avg.toFixed(3)}</span></div>`).join("")}
  </div>`;
}

function badgeGrid() {
  const prog = progress();
  const groups = [...new Set(BADGES.map((b) => b.group))];
  return groups.map((g) => `
    <h3 class="badge-group">${g}</h3>
    <ul class="badge-grid">
      ${BADGES.filter((b) => b.group === g).map((b) => {
        const got = prog.badges[b.id];
        const tier = got ? got.tier : -1;
        const value = prog.counters[b.counter] || 0;
        const next = b.goals[tier + 1];
        const medal = tier < 0 ? "locked" : b.goals.length === 1 ? "tier-2" : `tier-${tier}`;
        return `<li class="badge ${medal}" title="${esc(b.hint)}">
          <span class="badge-icon"><i class="${tier < 0 ? "ph" : "ph-fill"} ${b.icon}"></i></span>
          <span class="badge-name">${esc(b.name)}</span>
          <span class="badge-sub">${tier >= 0 && b.goals.length > 1 ? `${TIER_NAMES[tier]}. ` : ""}${next !== undefined ? `${Math.min(value, next)} / ${next}` : "Complete"}</span>
        </li>`;
      }).join("")}
    </ul>`).join("");
}

function ring(fraction, size = 96) {
  const r = size / 2 - 6, c = 2 * Math.PI * r;
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
    <circle class="ring-track" cx="${size / 2}" cy="${size / 2}" r="${r}"/>
    <circle class="ring-fill" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - fraction)}"/>
  </svg>`;
}

export function renderProfileChip() {
  const lv = levelFor(progress().xp);
  $("profile-chip").innerHTML = `${ring(lv.into / lv.needed, 30)}<span>${lv.level}</span>`;
  $("profile-chip").setAttribute("aria-label", `Profile, level ${lv.level}`);
}

export function createProfileScreen() {
  function render() {
    const prog = progress();
    const lv = levelFor(prog.xp);
    const s = store.state.stats;
    const lessons = Object.values(store.state.learn).reduce((n, c) => n + Object.values(c).filter((x) => x >= 1).length, 0);
    const streak = store.state.daily.streak;
    const decisions = s.checker.n + s.cube.n + s.play.n;
    const points = dailyLoss();
    $("page").innerHTML = `
      <header class="profile-head">
        <div class="level-ring">${ring(lv.into / lv.needed)}<span class="level-num">${lv.level}</span></div>
        <div>
          <h1>${lv.title}</h1>
          <p>Level ${lv.level}. ${prog.xp.toLocaleString("en-GB")} XP, ${(lv.needed - lv.into).toLocaleString("en-GB")} to level ${lv.level + 1}.</p>
        </div>
      </header>
      <dl class="tiles">
        <div class="tile"><dt>Games won</dt><dd>${s.play.won}<span> of ${s.play.games}</span></dd></div>
        <div class="tile"><dt>Lessons passed</dt><dd>${lessons}</dd></div>
        <div class="tile"><dt>Daily streak</dt><dd>${liveStreak(streak, dayKey())}<span> best ${streak.best}</span></dd></div>
        <div class="tile"><dt>Decisions</dt><dd>${decisions.toLocaleString("en-GB")}</dd></div>
      </dl>
      <div class="profile-grid">
        <section class="card">
          <div class="card-head"><h2>Average loss per day</h2><button class="link-btn" id="trend-table-toggle">Show table</button></div>
          <p class="card-sub">Last ${DAYS} days, all modes. Lower is better.</p>
          ${trendChart(points)}
          <table class="trend-table" hidden>
            <thead><tr><th>Day</th><th>Decisions</th><th>Avg. loss</th></tr></thead>
            <tbody>${points.map((p) => `<tr><td>${shortDate(p.day)}</td><td>${p.n}</td><td>${p.avg.toFixed(3)}</td></tr>`).join("")}</tbody>
          </table>
        </section>
        <section class="card">
          <div class="card-head"><h2>By game phase</h2></div>
          <p class="card-sub">Your last 500 decisions. Accuracy counts answers within 0.020 of the best.</p>
          ${phaseRows()}
        </section>
      </div>
      <section class="badges">
        <div class="card-head"><h2>Badges</h2><span class="card-sub">${Object.keys(prog.badges).length} of ${BADGES.length} earned</span></div>
        ${badgeGrid()}
      </section>`;
    bindChart($("page"));
    $("trend-table-toggle").addEventListener("click", (e) => {
      const t = $("page").querySelector(".trend-table");
      t.hidden = !t.hidden;
      e.currentTarget.textContent = t.hidden ? "Show table" : "Hide table";
    });
  }

  return {
    statsMode: () => "play",
    enter() {
      setView("page");
      render();
      window.scrollTo(0, 0);
    },
    leave() {
      setView("game");
    },
    refresh: render,
  };
}
