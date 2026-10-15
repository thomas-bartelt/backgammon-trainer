// Bootstrap: engine, board, router, top bar, sheets and the stats shown in the menu.
import { Engine } from "./engine.js";
import { BoardView } from "./board.js";
import { MoveInput, inputSettings } from "./moveinput.js";
import { ENGINE_SETUP, ratingFor } from "./trainer.js";
import { store } from "./store.js";
import { $, setView, openAnalysis, closeAnalysis } from "./ui.js";
import { createPlayScreen } from "./screens/play.js";
import { createTrainScreen } from "./screens/train.js";
import { createLearnScreen } from "./screens/learn.js";
import { createDailyScreen } from "./screens/daily.js";
import { createDrillRunner } from "./screens/drill.js";
import { createProfileScreen } from "./screens/profile.js";
import { createHomeScreen } from "./screens/home.js";
import { initGamify } from "./gamify.js";

const board = new BoardView($("board"), {
  onPick: (i) => input.pick(i),
  onDragStart: (i) => input.canDrag(i),
  onDrop: (from, to) => input.drop(from, to),
});
const input = new MoveInput(board, { onChange: onInputChange });
const runner = createDrillRunner({ board, input });
const ctx = { board, input, runner };

const screens = {
  home: createHomeScreen(ctx),
  play: createPlayScreen(ctx),
  train: createTrainScreen(ctx),
  learn: createLearnScreen(ctx),
  daily: createDailyScreen(ctx),
  profile: createProfileScreen(ctx),
};

// The board picks orientation and length to fill whatever space it gets.
new ResizeObserver(([entry]) => {
  const { width, height } = entry.contentRect;
  board.fit(width, height);
}).observe($("board-area"));

let current = null;

function onInputChange(inp) {
  $("btn-undo").disabled = !inp.history.length;
  $("btn-submit").disabled = !inp.complete;
  $("btn-submit").classList.toggle("ready", inp.complete);
  $("task-status").textContent = inp.status;
}

// ---------- routing ----------
// #/ (home), #/play, #/daily, #/learn[/chapter[/lesson]], #/train/checker|cube|review, #/profile
function parseRoute(hash) {
  let m;
  if (hash === "" || hash === "#" || hash === "#/") return { screen: "home", params: {}, nav: "home" };
  if (hash === "#/play") return { screen: "play", params: {}, nav: "play", title: "Play", options: true };
  if (hash === "#/daily") return { screen: "daily", params: {}, nav: "daily", title: "Daily" };
  if (hash === "#/profile") return { screen: "profile", params: {}, nav: "profile", title: "Profile" };
  if (hash === "#/train") return { redirect: `#/train/${store.prefs.trainKind || "checker"}` };
  if ((m = hash.match(/^#\/train\/(checker|cube|review)$/))) {
    return { screen: "train", params: { kind: m[1] }, nav: "train", title: "Train", options: m[1] === "checker", tabs: true };
  }
  if ((m = hash.match(/^#\/learn(?:\/([a-z]+)(?:\/(\d+))?)?$/))) {
    const back = m[2] !== undefined ? `#/learn/${m[1]}` : m[1] ? "#/learn" : "#/";
    return { screen: "learn", params: { chapter: m[1], lesson: m[2] }, nav: "learn", title: "Learn", back };
  }
  return null;
}

function route() {
  let r = parseRoute(location.hash);
  if (r?.redirect) {
    history.replaceState(null, "", r.redirect);
    r = parseRoute(r.redirect);
  }
  if (!r) {
    history.replaceState(null, "", "#/");
    r = parseRoute("#/");
  }
  closeSheets();
  closeAnalysis();
  current?.leave();
  current = screens[r.screen];
  setBar(r);
  $("result").hidden = true;
  $("verdict-chip").hidden = true;
  $("status-pill").hidden = true;
  setView(r.screen === "home" || r.screen === "profile" ? "page" : "game");
  current.enter(r.params);
  renderStats();
}

function setBar(r) {
  const home = r.screen === "home";
  $("wordmark").hidden = !home;
  $("back-btn").hidden = home;
  $("back-btn").href = r.back || "#/";
  $("bar-title").hidden = home;
  $("bar-title").textContent = r.title || "";
  $("train-tabs").hidden = !r.tabs;
  $("options-btn").hidden = !r.options;
  document.querySelector(".bar").dataset.route = r.screen;
  document.querySelectorAll(".desk-nav a, .menu-nav a").forEach((a) => {
    if (a.dataset.nav === r.nav) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
}

// ---------- sheets ----------
function openSheet(id) {
  const d = $(id);
  if (d.open) return;
  d.showModal();
  // Focus the sheet itself rather than its first button, so no focus ring flashes on open.
  d.tabIndex = -1;
  d.focus();
}

function closeSheet(d) {
  if (!d.open || d.classList.contains("closing")) return;
  d.classList.add("closing");
  setTimeout(() => {
    d.classList.remove("closing");
    d.close();
  }, 240);
}

function closeSheets() {
  document.querySelectorAll("dialog.sheet[open]").forEach((d) => {
    d.classList.remove("closing");
    d.close();
  });
}

document.querySelectorAll("dialog.sheet").forEach((d) => {
  d.addEventListener("click", (e) => {
    // A click on the backdrop lands on the dialog element itself.
    if (e.target === d || e.target.closest("[data-close]")) closeSheet(d);
  });
  d.addEventListener("cancel", (e) => {
    e.preventDefault();
    closeSheet(d);
  });
});
document.querySelectorAll(".menu-nav a").forEach((a) => a.addEventListener("click", () => closeSheet($("menu"))));
$("menu-btn").addEventListener("click", () => openSheet("menu"));
$("options-btn").addEventListener("click", () => openSheet("options"));
$("credits-btn").addEventListener("click", () => { closeSheets(); openSheet("credits"); });
document.addEventListener("click", (e) => {
  const opener = e.target.closest("[data-open]");
  if (opener) openSheet(opener.dataset.open);
});
$("new-game-btn").addEventListener("click", () => {
  closeSheet($("options"));
  current?.restart?.();
});

// ---------- analysis sheet ----------
$("verdict-chip").addEventListener("click", openAnalysis);
$("analysis-close").addEventListener("click", closeAnalysis);
$("analysis-grab").addEventListener("click", closeAnalysis);
$("scrim").addEventListener("click", closeAnalysis);

// ---------- theme and haptics ----------
function applyTheme() {
  const t = store.prefs.theme;
  if (t === "dark" || t === "light") document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  document.querySelectorAll("[data-theme-value]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.themeValue === (t || "auto"))));
}
document.querySelectorAll("[data-theme-value]").forEach((b) =>
  b.addEventListener("click", () => {
    store.setPref("theme", b.dataset.themeValue === "auto" ? null : b.dataset.themeValue);
    applyTheme();
  })
);
$("set-haptics").addEventListener("change", (e) => {
  store.setPref("haptics", e.target.checked);
  inputSettings.haptics = e.target.checked;
});

// ---------- settings ----------
function syncSettingsUI() {
  const p = store.prefs;
  const check = (sel, attr, val) => document.querySelectorAll(sel).forEach((c) => c.setAttribute("aria-checked", String(c.dataset[attr] === String(val))));
  check("[data-phase]", "phase", p.phase);
  check("[data-level]", "level", p.level);
  check("[data-match]", "match", p.matchLength);
  $("close-only").checked = p.closeOnly;
  $("play-cube").checked = p.cube;
  $("play-feedback").checked = p.feedback;
  $("set-haptics").checked = p.haptics !== false;
  inputSettings.haptics = p.haptics !== false;
}

function bindChips(selector, attr, key, parse = (v) => v) {
  document.querySelectorAll(selector).forEach((c) =>
    c.addEventListener("click", () => {
      store.setPref(key, parse(c.dataset[attr]));
      syncSettingsUI();
      current?.settingsChanged?.(key);
    })
  );
}
bindChips("[data-phase]", "phase", "phase");
bindChips("[data-level]", "level", "level");
bindChips("[data-match]", "match", "matchLength", Number);

for (const [id, key] of [["close-only", "closeOnly"], ["play-cube", "cube"], ["play-feedback", "feedback"]]) {
  $(id).addEventListener("change", (e) => {
    store.setPref(key, e.target.checked);
    if (key === "feedback" && !e.target.checked) closeAnalysis();
    current?.settingsChanged?.(key);
  });
}

// ---------- stats (menu sheet) ----------
function renderStats() {
  const mode = current?.statsMode() || "play";
  const s = store.state.stats[mode];
  const isPlay = mode === "play";
  $("stat-a-label").textContent = isPlay ? "Games won" : "Decisions";
  $("stat-c-label").textContent = isPlay ? (s.matches ? "Matches" : "Points") : "Accuracy";
  $("stat-a").textContent = isPlay ? `${s.won}/${s.games}` : s.n;
  $("stat-c").textContent = isPlay
    ? s.matches ? `${s.matchesWon}/${s.matches}` : s.games ? (s.points >= 0 ? "+" : "") + s.points : "-"
    : s.n ? Math.round((s.good / s.n) * 100) + "%" : "-";
  if (s.n) {
    const avg = s.loss / s.n;
    $("stat-loss").textContent = avg.toFixed(3);
    $("stat-level").textContent = s.n >= 10 ? ratingFor(avg).label.split(" ")[0] : "-";
  } else {
    $("stat-loss").textContent = $("stat-level").textContent = "-";
  }
  $("recent").innerHTML = store.state.recent
    .filter((r) => r.mode === mode)
    .slice(-30)
    .map((r) => `<li class="grade-${r.grade}" title="${r.grade}"></li>`)
    .join("");
}
store.on("decision", renderStats);
store.on("gameEnd", () => setTimeout(renderStats));

$("btn-reset-stats").addEventListener("click", () => {
  store.resetStats(current?.statsMode() || "play");
  renderStats();
});

// ---------- actions ----------
$("btn-undo").addEventListener("click", () => input.undo());
$("btn-submit").addEventListener("click", () => current?.submit?.());
$("btn-next").addEventListener("click", () => current?.next?.());
$("btn-roll").addEventListener("click", () => current?.roll?.());
$("btn-double").addEventListener("click", () => current?.double?.());
$("btn-resign").addEventListener("click", () => current?.resign?.());

document.addEventListener("keydown", (e) => {
  if (e.target.closest("input, textarea") || document.querySelector("dialog[open]")) return;
  if (e.key === "Enter") {
    const primary = ["actions-next", "actions-roll", "actions-checker", "actions-choice"]
      .map((id) => $(id))
      .find((el) => !el.hidden)
      ?.querySelector(".btn--primary:not(:disabled)");
    if (primary) { e.preventDefault(); primary.click(); }
  } else if (e.key === "Backspace" || e.key.toLowerCase() === "u") {
    if (input.active) { e.preventDefault(); input.undo(); }
  } else if (e.key === "Escape") {
    closeAnalysis();
    input.deselect();
  }
});

// ---------- progression ----------
initGamify({
  onChange() {
    if (current === screens.profile || current === screens.home) current.refresh();
  },
});

// ---------- offline support ----------
if ("serviceWorker" in navigator && window.isSecureContext) {
  navigator.serviceWorker.register("sw.js").catch(() => { /* offline mode is optional */ });
}

// ---------- start ----------
applyTheme();
syncSettingsUI();
// Engine commands queue until the WASM build is loaded and configured, so routing can start now.
const engineReady = Engine.load(ENGINE_SETUP);
window.addEventListener("hashchange", route);
route();
engineReady.then(() => $("board-loading").classList.add("hidden"));
