// Presents one checker-play or cube puzzle, grades the answer and renders the result card
// (ranking, odds, "Why", shots overlay). Shared by drills, lessons, review and the daily challenge.
import { notationSegments, positionKey, applyNotation } from "../game.js";
import { gradeChecker, gradeCube } from "../trainer.js";
import { explainChecker, explainCube, shotsAgainst } from "../explain.js";
import { $, esc, fmtEq, setTask, showActions, choose, cancelChoice, updateMeta, probsBlock, showResult, hideResult, verdict, whyBlock, closeAnalysis } from "../ui.js";

const phaseNames = { opening: "Opening", middle: "Middle game", bearoff: "Bear-off" };
const cubeLabels = { double: "Double", nodouble: "No double", take: "Take", pass: "Pass" };

export function createDrillRunner({ board, input }) {
  let token = 0;
  let puzzle = null;
  let answered = false;
  let resolveAnswer = null;
  let previewTimer = null;
  let startSnap = null;
  let finalSnap = null;
  let shotsOn = false;
  let shownPos = null;

  function reset() {
    token++;
    clearTimeout(previewTimer);
    answered = false;
    puzzle = null;
    input.stop();
    cancelChoice();
    hideResult();
    shotsOn = false;
    shownPos = null;
    board.setShotMarkers([]);
  }

  // Shows the puzzle; resolves with { loss, grade, category, correct } once answered and rendered.
  // opts: { title, sub } override the task card text.
  function present(p, opts = {}) {
    reset();
    puzzle = p;
    const my = token;
    board.setPosition(p.pos);
    updateMeta(p.pos, p.positionId);
    return new Promise((resolve) => {
      resolveAnswer = resolve;
      if (p.kind === "checker") startChecker(opts);
      else startCube(my, opts);
    });
  }

  // ---------- checker play ----------

  function startChecker({ title, sub }) {
    const [d1, d2] = puzzle.dice;
    board.setCube();
    setTask(
      title || `Play ${Math.max(d1, d2)}-${Math.min(d1, d2)}`,
      sub || `${phaseNames[puzzle.phase] || "Money game"}. You move white toward your home board at the bottom right. ${puzzle.hints.length} legal plays.`
    );
    $("btn-submit-label").textContent = "Submit move";
    showActions("checker");
    input.start(puzzle.pos, puzzle.dice, puzzle.legal);
    startSnap = input.startSnap;
  }

  function submit() {
    if (answered || !puzzle || puzzle.kind !== "checker" || !input.complete) return;
    answered = true;
    finalSnap = board.snapshot();
    const res = gradeChecker(puzzle, positionKey(input.pos));
    shownPos = input.pos;
    input.stop();
    const { chosen, best } = res;
    res.why = chosen !== best
      ? explainChecker(puzzle.pos, best, chosen)
      : puzzle.hints[1] && explainChecker(puzzle.pos, best, puzzle.hints[1], { betterLabel: "Your play", worseLabel: `The runner-up ${puzzle.hints[1].move}` });
    if (chosen === best && res.why) res.why.category = null;
    renderCheckerResult(res);
    $("task-sub").textContent = "Open the analysis to see why, and tap any play to watch it on the board.";
    $("task-status").textContent = "";
    showActions(null);
    resolveAnswer?.({ loss: res.loss, grade: res.grade, category: res.why?.category || null, correct: res.loss < 0.02 });
  }

  function refreshShots() {
    if (!shotsOn || !shownPos) return board.setShotMarkers([]);
    const { perBlot } = shotsAgainst(shownPos);
    board.setShotMarkers([...perBlot].filter(([, n]) => n > 0).map(([point, shots]) => ({ point, shots })));
  }

  function renderCheckerResult(res) {
    const { chosen, best, loss, grade } = res;
    const rows = puzzle.hints.slice(0, 6);
    if (!rows.includes(chosen)) rows.push(chosen);
    const p = best.probs;
    const note = chosen === best
      ? "You found the engine's top play."
      : `Your play ranked ${chosen.rank} of ${res.total}. Best was ${esc(best.move)}.`;
    showResult(grade.key, `
      ${verdict(grade.label, loss)}
      <p class="verdict-note">${note}</p>
      ${whyBlock(res.why, { title: chosen === best ? "Why it's best" : "Why", shotsButton: true })}
      <div class="cands-head"><span>Engine ranking (2-ply)</span><span>Loss</span></div>
      <ol class="cands">
        ${rows.map((h) => `
          <li><button class="cand ${h === best ? "best" : ""} ${h === chosen ? "active" : ""}" data-rank="${h.rank}">
            <span class="cand-rank">${h.rank}</span>
            <span class="cand-move"><span>${esc(h.move)}</span>${h === chosen ? '<span class="tag">You</span>' : ""}</span>
            <span class="cand-eq">${h === best ? "Best" : h.diff.toFixed(3)}</span>
          </button></li>`).join("")}
      </ol>
      ${p ? probsBlock(p[0], p[1], p[4]) : ""}
    `);
    $("result").querySelector("[data-shots]")?.addEventListener("click", (e) => {
      shotsOn = !shotsOn;
      if (shotsOn) closeAnalysis();
      e.currentTarget.setAttribute("aria-pressed", String(shotsOn));
      e.currentTarget.querySelector("span").textContent = shotsOn ? "Hide shots" : "Show shots on the board";
      refreshShots();
    });
    $("result").querySelectorAll(".cand").forEach((btn) =>
      btn.addEventListener("click", () => {
        const h = puzzle.hints.find((x) => x.rank === Number(btn.dataset.rank));
        $("result").querySelectorAll(".cand").forEach((b) => b.classList.toggle("active", b === btn));
        closeAnalysis();
        preview(h, h === chosen);
      })
    );
  }

  // Rewinds the board and replays a candidate move checker by checker.
  function preview(h, isUserMove) {
    clearTimeout(previewTimer);
    board.setShotMarkers([]);
    shownPos = applyNotation(puzzle.pos, h.move);
    if (isUserMove) {
      board.restore(finalSnap);
      previewTimer = setTimeout(refreshShots, 340);
      return;
    }
    board.restore(startSnap);
    const segs = notationSegments(h.move);
    let i = 0;
    const next = () => {
      if (i >= segs.length) return void (previewTimer = setTimeout(refreshShots, 200));
      const s = segs[i++];
      board.step(s.from, s.to);
      previewTimer = setTimeout(next, 280);
    };
    previewTimer = setTimeout(next, 340);
  }

  // ---------- cube ----------

  async function startCube(my, { title, sub }) {
    board.setDice(null);
    board.setHighlights({});
    const isTake = puzzle.kind === "take";
    board.setCube(isTake ? { offeredBy: "opp" } : {});
    if (isTake) setTask(title || "GNU doubles", sub || "Black turns the cube to 2. Money game, Jacoby off.", "Do you take or pass?");
    else setTask(title || "Double or roll?", sub || "You are on roll with the cube in the middle. Money game, Jacoby off.", "Should you double?");
    const answer = await choose(isTake
      ? [{ value: "pass", label: "Pass" }, { value: "take", label: "Take" }]
      : [{ value: "nodouble", label: "No double" }, { value: "double", label: "Double" }]);
    if (answer && my === token) answerCube(answer);
  }

  function answerCube(answer) {
    if (answered) return;
    answered = true;
    const res = gradeCube(puzzle, answer);
    $("task-sub").innerHTML = `You chose <strong>${cubeLabels[answer]}</strong>. The right call is <strong>${cubeLabels[puzzle.correct]}</strong>.`;
    $("task-status").textContent = "";
    renderCubeResult(res, answer);
    showActions(null);
    resolveAnswer?.({ loss: res.loss, grade: res.grade, category: res.loss > 0 ? "Cube error" : null, correct: answer === puzzle.correct });
  }

  function renderCubeResult(res, answer) {
    const { nd, dt, dp, proper, probs } = puzzle.cube;
    const isTake = puzzle.kind === "take";
    // Equities are from the doubler's side. For take decisions show them from the user's side.
    const rows = isTake
      ? [["take", "Take", -dt], ["pass", "Pass", -dp]]
      : [["nodouble", "No double", nd], ["double", `Double (${dt <= dp ? "take" : "pass"})`, Math.min(dt, dp)]];
    const sideProbs = probs && (isTake ? [probs[3], probs[4], probs[1]] : [probs[0], probs[1], probs[4]]);
    showResult(res.grade.key, `
      ${verdict(answer === puzzle.correct ? "Correct" : res.grade.label, res.loss)}
      ${whyBlock({ reasons: explainCube(isTake ? "take" : "double", puzzle.cube).reasons })}
      <div class="cube-table">
        ${rows.map(([key, label, eq]) => `
          <div class="cube-row ${key === puzzle.correct ? "correct" : ""} ${key === answer ? "picked" : ""}">
            <span>${label}${key === answer ? ' <span class="tag">You</span>' : ""}</span><span>${fmtEq(eq)}</span>
          </div>`).join("")}
      </div>
      <p class="cube-proper">${isTake ? "Engine verdict on GNU's cube" : "Engine verdict"}: <strong>${esc(proper.replace(/\s*\(.*\)$/, ""))}</strong></p>
      ${sideProbs ? probsBlock(...sideProbs) : ""}
    `);
  }

  return {
    present,
    submit,
    reset,
    get puzzle() { return puzzle; },
  };
}
