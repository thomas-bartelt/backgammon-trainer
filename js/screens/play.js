// Full games and matches against GNU: resume after leaving, resignations both ways, match play with Crawford.
import * as Play from "../play.js";
import { classifyPhase, pipCount } from "../game.js";
import { explainChecker, explainCube } from "../explain.js";
import { gradeFor, ratingFor, captureIds } from "../trainer.js";
import { MISTAKE } from "../store.js";
import { inGame, checkpoint, hasSavedGame, clearGame } from "../session.js";
import { store } from "../store.js";
import { $, esc, wait, setTask, showActions, choose, cancelChoice, setNext, updateMeta, showResult, hideResult, verdict, whyBlock, setStatus, setSeats } from "../ui.js";

const KIND_TEXT = ["a single game", "a gammon", "a backgammon"];
const freshLog = () => ({ moves: 0, loss: 0, blunders: 0, mistakes: 0 });

export function createPlayScreen({ board, input }) {
  let token = 0;
  let phase = "idle";
  let meta = null; // persisted as store.state.activeGame
  let hints = null;
  let cubeCheck = null;
  let cubeIds = null;
  let lastState = null;

  const prefs = () => store.prefs;
  const levelLabel = () => Play.LEVELS[prefs().level].label;
  const alive = (my) => my === token;

  function saveMeta(extra = {}) {
    Object.assign(meta, extra);
    store.state.activeGame = meta;
    store.save();
  }

  // ---------- rendering ----------

  function cubeOwner(s) {
    if (s.cube <= 1) return "center";
    return s.iMayDouble ? "me" : "opp";
  }

  function showCube(s, offeredBy = null) {
    if (!meta.cubeOn) return board.setCube({ hidden: true });
    board.setCube({ value: s.cube, owner: cubeOwner(s), offeredBy });
  }

  // Score in the top bar; the opponent's strength on its seat.
  function renderScoreline(s) {
    setSeats({ opp: `GNU, ${levelLabel()}` });
    if (meta.matchLength > 0) {
      setStatus(`<b>${s.myScore}</b><span class="sep"></span><b>${s.oppScore}</b><span>to ${meta.matchLength}</span>${s.crawford ? '<span class="tag">Crawford</span>' : ""}`);
    } else {
      const pts = store.state.stats.play.points;
      setStatus(`<span>Money</span><b>${pts >= 0 ? "+" : ""}${pts}</b>`);
    }
  }

  function subText(s) {
    const cube = !meta.cubeOn ? "No doubling cube" : s.crawford ? "Crawford game, no doubling" : s.cube > 1 ? `Cube at ${s.cube}, ${cubeOwner(s) === "me" ? "yours" : "GNU's"}` : "Cube centered";
    return `${levelLabel()} GNU. ${cube}.`;
  }

  function render(s) {
    lastState = s;
    board.setPosition(s.pos);
    board.setDice(null);
    showCube(s);
    updateMeta(s.pos);
    renderScoreline(s);
  }

  const showResign = (on) => ($("btn-resign").hidden = !on);

  // ---------- lifecycle ----------

  async function startNew(my) {
    clearGame();
    hideResult();
    meta = {
      matchLength: prefs().matchLength, cubeOn: prefs().cube, log: freshLog(), lastEngineMove: "",
      userResignRejected: -1, engineResignRejected: -1, pendingResign: null, phase: "start",
    };
    saveMeta();
    setTask(meta.matchLength ? `New ${meta.matchLength}-point match` : "New game", "Rolling for who goes first.");
    showActions(null);
    const s = await inGame(async () => {
      const s = await Play.startMatch({ length: meta.matchLength, cube: meta.cubeOn });
      await checkpoint();
      return s;
    });
    if (alive(my)) begin(s, my);
  }

  async function resume(my) {
    const s = await inGame(() => Play.state());
    if (!alive(my)) return;
    if (!s) return startNew(my);
    render(s);
    if (meta.phase === "between") return showBetween(s, my);
    if (meta.pendingResign !== null && meta.pendingResign !== undefined) return engineResignOffer(meta.pendingResign, my);
    begin(s, my);
  }

  // Picks up from whatever state gnubg is in.
  async function begin(s, my) {
    render(s);
    if (s.wasDoubled === -1) return engineDoubled(s, null, my);
    if (s.turn === 1) {
      if (s.dice[0] > 0) {
        const moves = await inGame(() => Play.legalMoves());
        if (alive(my)) beginUserMove(s.dice, moves);
      } else userPreRoll(my);
    } else engineTurn(my, { dice: s.dice[0] > 0 ? s.dice : null });
  }

  // ---------- user turn ----------

  async function userPreRoll(my) {
    const s = await inGame(async () => {
      const s = await Play.state();
      await checkpoint();
      return s;
    });
    if (!alive(my)) return;
    phase = "user-preroll";
    const { mine, theirs } = pipCount(s.pos);
    saveMeta({ phase, maxDeficit: Math.max(meta.maxDeficit || 0, mine - theirs) });
    lastState = s;
    board.setDice(null);
    showCube(s);
    updateMeta(s.pos);
    renderScoreline(s);
    setTask("Your turn", subText(s), meta.lastEngineMove ? `GNU played ${meta.lastEngineMove}.` : "");
    showResign(true);
    if (meta.cubeOn && s.iMayDouble && !s.crawford) {
      [cubeCheck, cubeIds] = await inGame(async () => [await Play.cubeAnalysis(), await captureIds()]);
      if (!alive(my)) return;
      $("btn-double").textContent = `Double to ${s.cube * 2}`;
      showActions("roll");
    } else {
      cubeCheck = null;
      showActions(null);
      await wait(450);
      if (alive(my)) userRoll();
    }
  }

  function gradeDoubleChoice(doubled) {
    const c = cubeCheck;
    cubeCheck = null;
    if (!c) return;
    const gain = Math.min(c.dt, c.dp) - c.nd;
    const wrong = doubled !== gain > 0;
    if (!wrong && gain < -0.1) return; // obvious no-double: not a real decision
    noteDecision(wrong ? Math.abs(gain) : 0, `You chose ${doubled ? "to double" : "to roll"}. Right call: ${gain > 0 ? "Double" : "No double"}.`, "cube", undefined,
      wrong ? { reasons: explainCube("double", c).reasons, category: "Cube error" } : null, { ...cubeIds, reviewKind: "double" });
  }

  async function userRoll() {
    if (phase !== "user-preroll") return;
    const my = token;
    phase = "rolling";
    showActions(null);
    gradeDoubleChoice(false);
    const r = await inGame(async () => {
      const r = await Play.rollForUser();
      await checkpoint(); // the roll is saved: reloading can't re-roll
      return r;
    });
    if (!alive(my)) return;
    if (!r.hints.length) {
      board.setDice(r.dice, [true, true]);
      setTask("No legal moves", subText(lastState), `You rolled ${r.dice[0]}-${r.dice[1]} and cannot move.`);
      showResign(false);
      await wait(1400);
      if (!alive(my)) return;
      await inGame(() => Play.playUserMove(null));
      return engineTurn(my);
    }
    beginUserMove(r.dice, r);
  }

  function beginUserMove(dice, moves) {
    phase = "user-move";
    saveMeta({ phase });
    hints = moves.hints;
    $("task-title").textContent = `Your roll: ${Math.max(...dice)}-${Math.min(...dice)}`;
    $("task-sub").textContent = subText(lastState);
    $("btn-submit-label").textContent = "Confirm move";
    showActions("checker");
    showResign(true);
    input.start(board.position(), dice, moves.legal);
  }

  async function confirmMove() {
    if (phase !== "user-move" || !input.complete) return;
    const my = token;
    const chosen = input.chosen;
    const best = hints[0];
    const before = lastState.pos;
    input.stop();
    phase = "engine";
    showResign(false);
    showActions(null);
    board.setDice(null);
    const loss = hints.length > 1 ? Math.max(0, best.equity - chosen.equity) : 0;
    const res = await inGame(async () => {
      // Mistakes go to the review deck, so remember the position before playing the move.
      const ids = loss >= MISTAKE ? await captureIds() : {};
      if (hints.length > 1) {
        const why = chosen === best ? null : explainChecker(before, best, chosen);
        noteDecision(loss, chosen === best ? `You played ${chosen.move}, the engine's choice.` : `You played ${chosen.move}. Best was ${best.move}.`, "checker", classifyPhase(before), why, { ...ids, reviewKind: "checker" });
      }
      return Play.playUserMove(chosen.move);
    });
    if (!alive(my)) return;
    if (res.win) return gameOver(res.win, my);
    await wait(350);
    if (alive(my)) engineTurn(my);
  }

  async function userDouble() {
    if (phase !== "user-preroll") return;
    const my = token;
    phase = "doubling";
    showResign(false);
    showActions(null);
    gradeDoubleChoice(true);
    board.setCube({ value: lastState.cube, offeredBy: "me" });
    const r = await inGame(() => Play.userDoubles(prefs().level));
    if (!alive(my)) return;
    setTask(r.takes ? "GNU takes" : "GNU passes", subText(lastState), r.takes ? `The cube is now at ${lastState.cube * 2}.` : "");
    await wait(1100);
    if (!alive(my)) return;
    if (r.win) return gameOver(r.win, my);
    lastState = await inGame(() => Play.state());
    showCube(lastState);
    phase = "user-preroll";
    userRoll();
  }

  async function userResign() {
    if (phase !== "user-preroll" && phase !== "user-move") return;
    const my = token;
    const prev = phase;
    const s = lastState;
    const pos = s.pos;
    const cube = meta.cubeOn ? s.cube : 1;
    const deepInside = pos.me[25] > 0 || pos.me.slice(19, 25).some((n) => n > 0);
    const possible = [true, pos.meOff === 0, pos.meOff === 0 && deepInside];
    const options = [0, 1, 2]
      .filter((k) => possible[k] && k > meta.userResignRejected)
      .map((k) => ({ value: String(k), label: `${["Single", "Gammon", "Backgammon"][k]} (-${(k + 1) * cube})` }));
    phase = "resigning";
    setTask("Resign this game?", "Offer GNU the points. It may refuse if it expects more by playing on.");
    const answer = await choose([...options, { value: "cancel", label: "Keep playing", ghost: true }]);
    if (!alive(my)) return;
    if (!answer || answer === "cancel") {
      phase = prev;
      if (prev === "user-move") {
        $("task-title").textContent = "Your move";
        $("task-sub").textContent = subText(s);
        showActions("checker");
        input.refresh();
      } else userPreRoll(my);
      return;
    }
    const kind = Number(answer);
    input.stop();
    showActions(null);
    showResign(false);
    const r = await inGame(() => Play.userResigns(prefs().level, Play.RESIGN_KINDS[kind]));
    if (!alive(my)) return;
    if (r.accepted && r.win) {
      setTask("GNU accepts", "");
      await wait(700);
      if (alive(my)) gameOver(r.win, my);
      return;
    }
    saveMeta({ userResignRejected: kind });
    setTask("GNU declines", "It wants to play on for more.");
    await wait(1200);
    if (!alive(my)) return;
    begin(await inGame(() => Play.state()), my);
  }

  // ---------- engine turn ----------

  async function engineTurn(my, { dice = null, skipCube = false } = {}) {
    phase = "engine";
    saveMeta({ phase });
    showActions(null);
    showResign(false);
    setTask("GNU is thinking", subText(lastState));
    const s = await inGame(() => Play.state());
    if (!alive(my)) return;
    lastState = s;
    if (!dice && !skipCube) {
      const kind = await inGame(async () => {
        const k = await Play.engineConsidersResign(meta.engineResignRejected + 1);
        if (k !== null) await checkpoint();
        return k;
      });
      if (!alive(my)) return;
      if (kind !== null) return engineResignOffer(kind, my);
      if (meta.cubeOn && s.oppMayDouble && !s.crawford) {
        const d = await inGame(async () => {
          const d = await Play.engineWantsToDouble(prefs().level);
          if (d.doubles) await checkpoint();
          return d;
        });
        if (!alive(my)) return;
        if (d.doubles) return engineDoubled(s, d.analysis, my);
      }
    }
    await wait(500);
    if (!alive(my)) return;
    const mv = await inGame(() => Play.engineMove(prefs().level, dice || undefined));
    if (!alive(my)) return;
    board.setDice(mv.dice, [], "opp");
    await wait(450);
    for (const seg of mv.segments) {
      if (!alive(my)) return;
      board.stepOpp(seg.from, seg.to);
      await wait(320);
    }
    if (!alive(my)) return;
    meta.lastEngineMove = mv.move ? `${mv.dice[0]}-${mv.dice[1]}: ${mv.move}` : `${mv.dice[0]}-${mv.dice[1]} and could not move`;
    if (mv.win) return gameOver(mv.win, my);
    const after = await inGame(() => Play.state());
    if (!alive(my)) return;
    if (!board.matches(after.pos)) board.setPosition(after.pos);
    await wait(250);
    if (alive(my)) userPreRoll(my);
  }

  async function engineDoubled(s, analysis, my) {
    phase = "user-respond";
    saveMeta({ phase });
    board.setDice(null);
    board.setCube({ value: s.cube, offeredBy: "opp" });
    setTask(`GNU doubles to ${s.cube * 2}`, subText(s), "Take and play on for twice the stake, or pass and give up this game.");
    const answer = await choose([{ value: "pass", label: `Pass (-${s.cube})` }, { value: "take", label: "Take", primary: true }]);
    if (!answer || !alive(my)) return;
    const take = answer === "take";
    if (analysis) {
      const shouldTake = analysis.dt <= analysis.dp;
      const wrong = take !== shouldTake;
      noteDecision(wrong ? Math.abs(analysis.dt - analysis.dp) : 0, `You chose to ${take ? "take" : "pass"}. Right call: ${shouldTake ? "Take" : "Pass"}.`, "cube", undefined,
        wrong ? { reasons: explainCube("take", analysis).reasons, category: "Cube error" } : null);
    }
    const res = await inGame(() => Play.userRespondsToDouble(take));
    if (!alive(my)) return;
    if (res.win) return gameOver(res.win, my);
    lastState = await inGame(() => Play.state());
    showCube(lastState);
    engineTurn(my, { skipCube: true });
  }

  async function engineResignOffer(kind, my) {
    phase = "resign-offer";
    saveMeta({ phase, pendingResign: kind });
    const s = lastState;
    const pts = (kind + 1) * (meta.cubeOn ? s.cube : 1);
    board.setDice(null);
    setTask(`GNU resigns ${KIND_TEXT[kind]}`, `Accept to win ${pts} point${pts > 1 ? "s" : ""} now, or play on for more.`);
    const gain = await inGame(() => Play.resignAdvice());
    if (!alive(my)) return;
    const answer = await choose([{ value: "reject", label: "Play on" }, { value: "accept", label: `Accept (+${pts})`, primary: true }]);
    if (!answer || !alive(my)) return;
    const accept = answer === "accept";
    if (gain !== null) {
      const right = gain >= 0;
      noteDecision(accept === right ? 0 : Math.abs(gain), `You chose to ${accept ? "accept" : "play on"}. Right call: ${right ? "Accept" : "Play on"}.`, "cube");
    }
    const res = await inGame(() => Play.userAnswersResign(accept));
    if (!alive(my)) return;
    saveMeta({ pendingResign: null });
    if (res.win) return gameOver(res.win, my);
    saveMeta({ engineResignRejected: kind });
    engineTurn(my, { skipCube: true });
  }

  // ---------- feedback, game and match end ----------

  function noteDecision(loss, text, kind, phaseTag = classifyPhase(lastState.pos), why = null, extra = {}) {
    const grade = loss === 0 && kind === "cube" ? { key: "best", label: "Correct" } : gradeFor(loss);
    const log = meta.log;
    log.moves++;
    log.loss += loss;
    if (grade.key === "blunder") log.blunders++;
    if (grade.key === "mistake") log.mistakes++;
    saveMeta();
    store.recordDecision("play", { source: "game", kind, phase: phaseTag, loss, grade: grade.key, category: why?.category || null, ...extra });
    if (!prefs().feedback) return;
    const avg = log.loss / log.moves;
    showResult(grade.key, `
      ${verdict(grade.label, loss)}
      <p class="verdict-note">${esc(text)}</p>
      ${loss >= 0.02 ? whyBlock(why) : ""}
      <p class="game-line">This game: ${log.moves} decision${log.moves > 1 ? "s" : ""}, avg. loss ${avg.toFixed(3)}${log.blunders ? `, ${log.blunders} blunder${log.blunders > 1 ? "s" : ""}` : ""}.</p>
    `);
  }

  async function gameOver(win, my) {
    input.stop();
    cancelChoice();
    showResign(false);
    board.setHighlights({});
    updateMeta(board.position());
    const p = store.state.stats.play;
    p.games++;
    if (win.userWon) p.won++;
    if (meta.matchLength === 0) p.points += win.userWon ? win.points : -win.points;
    if (win.matchOver) {
      p.matches++;
      if (win.userWonMatch) p.matchesWon++;
    }
    store.save();
    store.emit("gameEnd", { ...win, level: prefs().level, log: meta.log, matchLength: meta.matchLength, maxDeficit: meta.maxDeficit || 0 });
    if (win.matchOver) store.emit("matchEnd", { userWon: win.userWonMatch, length: meta.matchLength, level: prefs().level });

    const s = await inGame(() => Play.state());
    if (!alive(my)) return;
    lastState = s;
    renderScoreline(s);
    const head = win.userWon ? `You win ${KIND_TEXT.find((t) => t.endsWith(win.kind)) || win.kind}` : `GNU wins ${KIND_TEXT.find((t) => t.endsWith(win.kind)) || win.kind}`;
    const ptsText = `${win.userWon ? "+" : "-"}${win.points} point${win.points > 1 ? "s" : ""}`;
    showSummary();

    if (meta.matchLength === 0 || win.matchOver) {
      phase = "over";
      clearGame();
      store.state.activeGame = null;
      store.save();
      if (win.matchOver) {
        setTask(win.userWonMatch ? "You win the match" : "GNU wins the match",
          `${s.myScore}-${s.oppScore} in a ${meta.matchLength}-point match against ${levelLabel()} GNU. Last game: ${win.userWon ? "you won" : "GNU won"} ${KIND_TEXT.find((t) => t.endsWith(win.kind)) || win.kind}, ${ptsText}.`);
        setNext("New match");
      } else {
        setTask(head, `${ptsText} against ${levelLabel()} GNU. Session total ${p.points >= 0 ? "+" : ""}${p.points}.`);
        setNext("New game");
      }
    } else {
      phase = "between";
      await inGame(() => checkpoint());
      saveMeta({ phase });
      setTask(head, `${ptsText}. Score ${s.myScore}-${s.oppScore}, match to ${meta.matchLength}.`);
      setNext("Next game");
    }
  }

  function showBetween(s, my) {
    phase = "between";
    setTask("Next game", `Score ${s.myScore}-${s.oppScore}, match to ${meta.matchLength}.`);
    setNext("Next game");
  }

  function showSummary() {
    const log = meta.log;
    if (!log.moves) return hideResult();
    const avg = log.loss / log.moves;
    const r = ratingFor(avg);
    showResult(log.blunders + log.mistakes === 0 ? "best" : "inaccuracy", `
      ${verdict("Game summary", null)}
      <dl class="probs">
        <div class="prob"><dt>Decisions</dt><dd>${log.moves}</dd></div>
        <div class="prob"><dt>Avg. loss</dt><dd>${avg.toFixed(3)}</dd></div>
        <div class="prob"><dt>Errors</dt><dd>${log.mistakes + log.blunders}</dd></div>
      </dl>
      <p class="verdict-note">You played at roughly ${r.label.toLowerCase()} level this game (PR ${r.pr.toFixed(1)}).</p>
    `);
  }

  async function nextGame(my) {
    hideResult();
    saveMeta({ log: freshLog(), lastEngineMove: "", userResignRejected: -1, engineResignRejected: -1, pendingResign: null, phase: "start", maxDeficit: 0 });
    const s = await inGame(async () => {
      const s = await Play.nextGame();
      await checkpoint();
      return s;
    });
    if (alive(my)) begin(s, my);
  }

  // ---------- screen interface ----------

  return {
    statsMode: () => "play",
    async enter() {
      const my = ++token;
      $("settings-play").hidden = false;
      $("btn-submit-label").textContent = "Confirm move";
      if (meta && phase !== "idle" && phase !== "over" && phase !== "prompt") return resume(my);
      if (store.state.activeGame && hasSavedGame()) {
        meta = store.state.activeGame;
        phase = "prompt";
        setTask("Welcome back", `You have ${meta.matchLength ? `a ${meta.matchLength}-point match` : "a game"} in progress.`);
        showActions(null);
        const saved = await inGame(() => Play.state());
        if (!alive(my)) return;
        if (saved) render(saved);
        const answer = await choose([{ value: "new", label: meta.matchLength ? "New match" : "New game", ghost: true }, { value: "resume", label: "Resume", primary: true }]);
        if (!alive(my) || !answer) return;
        if (answer === "resume") return resume(my);
        return startNew(my);
      }
      startNew(my);
    },
    leave() {
      token++;
      input.stop();
      cancelChoice();
      showResign(false);
      setStatus("");
      setSeats();
      $("settings-play").hidden = true;
    },
    settingsChanged(key) {
      if (key === "level" && lastState && phase !== "over") $("task-sub").textContent = subText(lastState);
    },
    submit: confirmMove,
    next() {
      const my = ++token;
      if (phase === "between") return nextGame(my);
      startNew(my);
    },
    roll: userRoll,
    restart() {
      startNew(++token);
    },
    double: userDouble,
    resign: userResign,
  };
}
