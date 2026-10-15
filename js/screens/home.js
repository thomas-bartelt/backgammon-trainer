// Home: the hub every section starts from.
import { store } from "../store.js";
import { levelFor } from "../progress.js";
import { progress } from "../gamify.js";
import { dayKey, liveStreak } from "../daily.js";
import { LEVELS } from "../play.js";
import { $, esc, setView } from "../ui.js";

function ring(fraction, size = 64) {
  const r = size / 2 - 5, c = 2 * Math.PI * r;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
    <circle class="ring-track" cx="${size / 2}" cy="${size / 2}" r="${r}"/>
    <circle class="ring-fill" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - fraction)}"/>
  </svg>`;
}

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Late session" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export function createHomeScreen() {
  function render() {
    const lv = levelFor(progress().xp);
    const today = dayKey();
    const daily = store.state.daily;
    const streak = liveStreak(daily.streak, today);
    const doneToday = daily.days[today];
    const game = store.state.activeGame;
    const prefs = store.prefs;
    const due = store.dueReviews().length;
    const lessons = Object.values(store.state.learn).reduce((n, c) => n + Object.values(c).filter((x) => x >= 1).length, 0);
    const level = LEVELS[prefs.level]?.label || "Intermediate";
    const playMeta = game
      ? `Resume your ${game.matchLength ? `${game.matchLength}-point match` : "money game"}`
      : `${level} GNU. ${prefs.matchLength ? `${prefs.matchLength}-point match` : "Money game"}.`;

    $("page").innerHTML = `
      <section class="home-hero">
        <div>
          <h1>${greeting()}<span>.</span></h1>
          <p>${streak ? `${streak}-day streak. Keep it going.` : "Ten minutes a day makes a stronger player."}</p>
        </div>
        <a class="home-level" href="#/profile" aria-label="Profile, level ${lv.level}">
          <span class="level-ring">${ring(lv.into / lv.needed)}<span class="level-num">${lv.level}</span></span>
          <small>${esc(lv.title)}</small>
        </a>
      </section>

      <div class="home-grid">
        <a class="tile tile--hero" href="#/play">
          <span class="tile__icon"><i class="ph-fill ph-play"></i></span>
          <span>
            <span class="tile__title">${game ? "Resume game" : "Play GNU"}</span>
            <span class="tile__meta">${esc(playMeta)}</span>
          </span>
          <span class="tile__go"><i class="ph ph-arrow-up-right"></i></span>
          <span class="tile-stack" aria-hidden="true"><i class="me"></i><i class="opp"></i><i class="me"></i></span>
        </a>

        <a class="tile tile--accent" href="#/daily">
          <span class="tile__icon"><i class="ph-fill ph-fire"></i></span>
          <span>
            <span class="tile__title">Daily</span>
            <span class="tile__meta">${doneToday ? `${doneToday.total} / ${doneToday.grades.length * 100} today` : "Ten positions, one try"}</span>
          </span>
          <span class="tile__go"><i class="ph ph-arrow-up-right"></i></span>
        </a>

        <a class="tile" href="#/learn">
          <span class="tile__icon"><i class="ph ph-graduation-cap"></i></span>
          <span>
            <span class="tile__title">Learn</span>
            <span class="tile__meta">${lessons ? `${lessons} lesson${lessons > 1 ? "s" : ""} passed` : "Ten chapters, easy to expert"}</span>
          </span>
          <span class="tile__go"><i class="ph ph-arrow-up-right"></i></span>
        </a>

        <a class="tile" href="#/train/checker">
          <span class="tile__icon"><i class="ph ph-target"></i></span>
          <span>
            <span class="tile__title">Train</span>
            <span class="tile__meta">Endless moves and cube drills</span>
          </span>
          <span class="tile__go"><i class="ph ph-arrow-up-right"></i></span>
        </a>

        <a class="tile" href="#/train/review">
          <span class="tile__icon"><i class="ph ph-arrow-counter-clockwise"></i></span>
          <span>
            <span class="tile__title">Review</span>
            <span class="tile__meta">${due ? `${due} mistake${due > 1 ? "s" : ""} due` : "Nothing due right now"}</span>
          </span>
          <span class="tile__go"><i class="ph ph-arrow-up-right"></i></span>
        </a>
      </div>

      <footer class="home-foot">
        <span>GNU Backgammon engine, runs offline</span>
        <button class="link-btn" type="button" data-open="credits">Credits</button>
      </footer>`;
  }

  return {
    statsMode: () => "play",
    enter() {
      setView("page");
      render();
      window.scrollTo(0, 0);
    },
    leave() {},
    refresh: render,
  };
}
