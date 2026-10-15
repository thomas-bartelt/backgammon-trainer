// Click-to-move input for the user's checkers, shared by drills and full games.
import { clonePosition, positionKey, applyStep, playableSteps, removeDie } from "./game.js";

export const inputSettings = { haptics: true };

export class MoveInput {
  constructor(board, { onChange } = {}) {
    this.board = board;
    this.onChange = onChange;
    this.active = false;
  }

  // legal: Map(positionKey after the move -> engine hint)
  start(pos, dice, legal) {
    const [d1, d2] = dice;
    this.dice = dice;
    this.pos = clonePosition(pos);
    this.diceLeft = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
    this.used = this.diceLeft.map(() => false);
    this.history = [];
    this.selected = null;
    this.legal = legal;
    this.legalKeys = new Set(legal.keys());
    this.startSnap = this.board.snapshot();
    this.active = true;
    this.refresh();
  }

  stop() {
    this.active = false;
    this.board.setHighlights({});
  }

  get complete() {
    return this.active && this.legalKeys.has(positionKey(this.pos));
  }

  get chosen() {
    return this.legal.get(positionKey(this.pos));
  }

  get status() {
    if (this.complete) return "Move complete. Confirm it or undo to try something else.";
    if (this.selected !== null) return "Choose where this checker goes.";
    if (!this.history.length) return "Pick a highlighted checker, or drag it to its point.";
    const left = this.diceLeft.length;
    return `${left} ${left === 1 ? "die" : "dice"} left to play.`;
  }

  refresh() {
    this.playable = playableSteps(this.pos, this.diceLeft, this.legalKeys);
    const movable = new Set(this.complete ? [] : this.playable.map((s) => s.from));
    const targets = this.selected === null ? [] : this.playable.filter((s) => s.from === this.selected);
    this.board.setHighlights({ movable, selected: this.selected, targets });
    this.board.setDice(this.dice, this.used);
    this.onChange?.(this);
  }

  pick(i) {
    if (!this.active) return;
    const fromHere = this.playable.filter((s) => s.from === i);
    if (this.selected !== null) {
      const step = this.playable.find((s) => s.from === this.selected && s.to === i);
      if (step) return this.doStep(step);
      this.selected = fromHere.length && i !== this.selected ? i : null;
      if (this.selected !== null && this.autoMove(fromHere)) return;
      if (this.selected === null && this.moveTo(i)) return;
      return this.refresh();
    }
    if (!fromHere.length) return void this.moveTo(i);
    this.selected = i;
    if (!this.autoMove(fromHere)) this.refresh();
  }

  // Tapping an empty destination moves there when exactly one checker can reach it.
  moveTo(i) {
    const steps = this.playable.filter((s) => s.to === i);
    if (!steps.length || new Set(steps.map((s) => s.from)).size !== 1) return false;
    this.doStep(steps.reduce((a, b) => (a.die <= b.die ? a : b)));
    return true;
  }

  canDrag(from) {
    return this.active && this.playable.some((s) => s.from === from);
  }

  // Dropping a dragged checker; returns false if that step isn't playable.
  drop(from, to) {
    const steps = this.playable.filter((s) => s.from === from && s.to === to);
    if (!steps.length) return false;
    this.doStep(steps.reduce((a, b) => (a.die <= b.die ? a : b)));
    return true;
  }

  // With a single possible destination there is nothing to choose: move straight away.
  autoMove(steps) {
    if (new Set(steps.map((s) => s.to)).size !== 1) return false;
    this.doStep(steps.reduce((a, b) => (a.die <= b.die ? a : b)));
    return true;
  }

  doStep(step) {
    this.history.push({ pos: clonePosition(this.pos), diceLeft: this.diceLeft.slice(), used: this.used.slice(), snap: this.board.snapshot() });
    const hit = applyStep(this.pos, step.from, step.to);
    if (inputSettings.haptics) navigator.vibrate?.(hit ? [12, 40, 12] : 10);
    this.diceLeft = removeDie(this.diceLeft, step.die);
    const [d1, d2] = this.dice;
    const idx = this.used.findIndex((u, k) => !u && (d1 === d2 ? d1 : k === 0 ? d1 : d2) === step.die);
    if (idx >= 0) this.used[idx] = true;
    this.selected = null;
    this.board.step(step.from, step.to);
    this.refresh();
  }

  undo() {
    const prev = this.active && this.history.pop();
    if (!prev) return;
    Object.assign(this, { pos: prev.pos, diceLeft: prev.diceLeft, used: prev.used, selected: null });
    this.board.restore(prev.snap);
    this.refresh();
  }

  deselect() {
    if (!this.active) return;
    this.selected = null;
    this.refresh();
  }
}
