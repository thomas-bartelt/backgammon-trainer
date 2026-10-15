// Drills: endless checker-play or cube positions, plus spaced review of past mistakes.
import { generateCheckerPosition, generateCubePosition, puzzleFromIds } from "../trainer.js";
import { inScratch } from "../session.js";
import { store, REVIEW_DAYS } from "../store.js";
import { $, setTask, showActions, setNext, setSeats } from "../ui.js";

const statsMode = (p) => (p.kind === "checker" ? "checker" : "cube");

export function createTrainScreen({ runner }) {
  let kind = "checker";
  let token = 0;
  let answered = false;

  function record(p, r, source) {
    store.recordDecision(statsMode(p), {
      source, kind: statsMode(p), phase: p.phase, loss: r.loss, grade: r.grade.key, category: r.category,
      positionId: p.positionId, matchId: p.matchId, reviewKind: p.kind, dice: p.dice,
    });
  }

  async function deal() {
    const my = ++token;
    answered = false;
    runner.reset();
    if (kind === "review") return dealReview(my);
    $("board-shell").classList.add("dealing");
    setTask("Dealing a position", "The engine is playing itself into a fresh spot.");
    showActions(null);
    const prefs = store.prefs;
    const p = await inScratch(() =>
      kind === "checker" ? generateCheckerPosition({ phase: prefs.phase, closeOnly: prefs.closeOnly }) : generateCubePosition()
    );
    if (my !== token) return;
    $("board-shell").classList.remove("dealing");
    if (!p) {
      setTask("No position found", "The engine could not find a matching spot. Try another phase or turn off close calls.");
      return setNext("Try again");
    }
    const r = await runner.present(p);
    if (my !== token) return;
    answered = true;
    record(p, r, "drill");
    setNext("Next position");
  }

  async function dealReview(my) {
    const due = store.dueReviews();
    if (!due.length) {
      const waiting = store.state.review;
      const next = waiting.length ? Math.min(...waiting.map((r) => r.due)) : null;
      setTask(
        "Nothing to review",
        waiting.length
          ? `${waiting.length} position${waiting.length > 1 ? "s" : ""} waiting. The next one is due ${new Date(next).toLocaleDateString("en-GB", { weekday: "long" })}.`
          : "Mistakes from drills, lessons and games land here, then come back after 1, 3, 7 and 21 days until you have them down."
      );
      showActions(null);
      return;
    }
    const item = due[0];
    setTask("Loading review", "");
    showActions(null);
    const p = await inScratch(() => puzzleFromIds(item));
    if (my !== token) return;
    if (!p) {
      store.reviewAnswered(item.key, true, Infinity); // unreadable entry: drop it
      return deal();
    }
    const sub = `Review: ${due.length} due. You missed this one before; step ${item.box + 1} of ${REVIEW_DAYS.length}.`;
    const r = await runner.present(p, { sub });
    if (my !== token) return;
    answered = true;
    const box = store.reviewAnswered(item.key, r.correct);
    record(p, r, "review");
    if (box === "mastered") store.emit("reviewMastered", { key: item.key });
    $("task-status").textContent = box === "mastered"
      ? "Mastered. This one leaves your review deck."
      : r.correct ? `Correct. It comes back in ${REVIEW_DAYS[box - 1]} day${REVIEW_DAYS[box - 1] > 1 ? "s" : ""}.` : "Not yet. It comes back tomorrow.";
    setNext(due.length > 1 ? "Next review" : "Finish");
  }

  return {
    statsMode: () => (kind === "cube" ? "cube" : "checker"),
    enter(params) {
      kind = params.kind;
      store.setPref("trainKind", kind);
      $("settings-checker").hidden = kind !== "checker";
      setSeats();
      document.querySelectorAll("#train-tabs .seg").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.kind === kind)));
      const due = store.dueReviews().length;
      $("review-count").textContent = due ? due : "";
      deal();
    },
    leave() {
      token++;
      runner.reset();
      $("board-shell").classList.remove("dealing");
      $("settings-checker").hidden = true;
    },
    settingsChanged() {
      if (!answered && kind === "checker") deal();
    },
    submit: () => runner.submit(),
    next: deal,
  };
}
