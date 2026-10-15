// Shared DOM helpers: the prompt and actions in the dock, the analysis sheet, seats and status pill.
import { pipCount } from "./game.js";

export const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
export const fmtEq = (x) => (x >= 0 ? "+" : "") + x.toFixed(3);
export const pct = (x) => (x * 100).toFixed(1) + "%";
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// "game": board, seats, dock and analysis. "page": a scrolling page (home, learn, daily, profile).
export function setView(kind) {
  $("view-game").hidden = kind !== "game";
  $("page").hidden = kind !== "page";
  if (kind === "page") closeAnalysis();
}

export function setTask(title, sub = "", status = "") {
  $("task-title").textContent = title;
  $("task-sub").innerHTML = sub;
  $("task-status").textContent = status;
}

// which: "checker" | "next" | "roll" | "choice" | null
export function showActions(which) {
  for (const id of ["checker", "next", "roll", "choice"]) $(`actions-${id}`).hidden = which !== id;
}

let pendingChoice = null;

// Renders choice buttons in the dock and resolves with the picked value.
// options: [{ value, label, primary?, ghost? }]
export function choose(options) {
  if (pendingChoice) pendingChoice(null);
  const box = $("actions-choice");
  box.innerHTML = "";
  return new Promise((resolve) => {
    pendingChoice = resolve;
    for (const o of options) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn " + (o.primary ? "btn--primary" : "btn--ghost");
      b.textContent = o.label;
      b.dataset.value = o.value;
      b.addEventListener("click", () => {
        pendingChoice = null;
        box.hidden = true;
        resolve(o.value);
      });
      box.appendChild(b);
    }
    showActions("choice");
  });
}

export function cancelChoice() {
  if (pendingChoice) pendingChoice(null);
  pendingChoice = null;
}

export function setNext(label) {
  $("btn-next-label").textContent = label;
  showActions("next");
}

// Seats above and below the board: pip counts and checkers borne off.
export function updateMeta(pos, positionId = "") {
  const { mine, theirs } = pipCount(pos);
  $("pip-me").textContent = mine;
  $("pip-opp").textContent = theirs;
  $("off-me").textContent = pos.meOff;
  $("off-opp").textContent = pos.oppOff;
  $("position-id").textContent = positionId || "-";
}

export function setSeats({ me = "You", opp = "GNU" } = {}) {
  $("name-me").textContent = me;
  $("name-opp").textContent = opp;
}

// Compact status in the top bar (score, progress). Pass "" to hide.
export function setStatus(html) {
  const el = $("status-pill");
  el.innerHTML = html;
  el.hidden = !html;
}

export function probsBlock(win, gammon, loseGammon) {
  return `<dl class="probs">
    <div class="prob"><dt>Win</dt><dd>${pct(win)}</dd></div>
    <div class="prob"><dt>Gammon</dt><dd>${pct(gammon)}</dd></div>
    <div class="prob"><dt>Lose gammon</dt><dd>${pct(loseGammon)}</dd></div>
  </dl>`;
}

// ---------- analysis ----------

let lastVerdict = null;

export function verdict(label, loss) {
  lastVerdict = { label, loss };
  return `<div class="verdict">
    <span class="verdict-label">${label}</span>
    ${loss === null ? "" : `<span class="verdict-loss">${loss === 0 ? "0.000" : "-" + loss.toFixed(3)}</span>`}
  </div>`;
}

// Fills the analysis. On phones a verdict chip appears in the dock; tapping it opens the sheet.
export function showResult(gradeKey, html, { open = false } = {}) {
  // verdict() ran while the caller built `html`, so lastVerdict belongs to this result.
  const v = lastVerdict;
  lastVerdict = null;
  $("result").className = `result grade-${gradeKey}`;
  $("result").innerHTML = html;
  $("result").hidden = false;
  const chip = $("verdict-chip");
  if (v) {
    const { label, loss } = v;
    chip.className = `verdict-chip grade-${gradeKey}`;
    chip.innerHTML = `<span class="vc-dot"></span><span>${label}</span>${loss ? `<span class="vc-loss">-${loss.toFixed(3)}</span>` : ""}<span class="vc-go"><i class="ph ph-caret-up"></i></span>`;
    chip.hidden = false;
  }
  if (open) openAnalysis();
}

export function hideResult() {
  $("result").hidden = true;
  $("verdict-chip").hidden = true;
  closeAnalysis();
}

export function openAnalysis() {
  if ($("result").hidden) return;
  $("analysis").classList.add("open");
  if (!matchMedia("(min-width: 960px) and (min-height: 600px)").matches) $("scrim").hidden = false;
  $("analysis").scrollTop = 0;
}

export function closeAnalysis() {
  $("analysis").classList.remove("open");
  $("scrim").hidden = true;
}

// "Why" section for a result card. e: { summary, reasons, tradeoff, category } from explain.js.
export function whyBlock(e, { title = "Why", shotsButton = false } = {}) {
  if (!e || (!e.reasons?.length && !e.summary)) return "";
  return `<div class="why">
    <div class="why-head"><h3 class="why-title">${title}</h3>${e.category ? `<span class="why-cat">${esc(e.category)}</span>` : ""}</div>
    ${e.summary ? `<p class="why-summary">${esc(e.summary)}</p>` : ""}
    ${e.reasons?.length ? `<ul class="why-list">${e.reasons.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>` : ""}
    ${e.tradeoff ? `<p class="why-tradeoff">${esc(e.tradeoff)}</p>` : ""}
    ${shotsButton ? `<button class="link-btn" data-shots aria-pressed="false"><i class="ph ph-crosshair"></i><span>Show shots on the board</span></button>` : ""}
  </div>`;
}
