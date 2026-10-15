// Connects app events to XP, levels and badges, and shows toasts for what was earned.
import { store } from "./store.js";
import { freshProgress, applyEvent, levelFor } from "./progress.js";
import { badgeById, TIER_NAMES } from "./badges.js";
import { esc } from "./ui.js";

const EVENTS = ["decision", "gameEnd", "matchEnd", "lessonDone", "dailyDone", "reviewMastered"];

export function progress() {
  return (store.state.progress ||= freshProgress());
}

export function initGamify({ onChange } = {}) {
  for (const type of EVENTS) {
    store.on(type, (e) => {
      const r = applyEvent(progress(), type, e);
      store.save();
      if (r.levelUp) toast("ph-arrow-fat-up", `Level ${r.levelUp.to}`, `You are now a ${levelFor(progress().xp).title.toLowerCase()}.`, "level");
      for (const b of r.badges) {
        const def = badgeById[b.id];
        const tier = def.goals.length > 1 ? `${TIER_NAMES[b.tier]} ` : "";
        toast(def.icon, `${tier}badge: ${def.name}`, def.hint, `tier-${b.tier}`);
      }
      onChange?.();
    });
  }
}

let stack = null;
export function toast(icon, title, text, cls = "") {
  stack ||= document.getElementById("toasts");
  const el = document.createElement("div");
  el.className = `toast ${cls}`;
  el.setAttribute("role", "status");
  el.innerHTML = `<span class="toast-icon"><i class="ph-fill ${icon}"></i></span>
    <span class="toast-body"><strong>${esc(title)}</strong><span>${esc(text)}</span></span>`;
  stack.appendChild(el);
  setTimeout(() => el.classList.add("leaving"), 4200);
  setTimeout(() => el.remove(), 4700);
}
