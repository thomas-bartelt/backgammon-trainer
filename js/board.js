// SVG board. Checkers are keyed elements so moves animate with CSS transforms.
//
// Geometry is computed in "landscape" coordinates: the 24 points run along x (length L),
// the two rows sit along y (height H). In portrait the static board is rotated 90 degrees
// clockwise so points run down the screen; checkers, dice, cube and labels are placed
// through map() and stay upright.
import { BAR, OFF } from "./game.js";

const NS = "http://www.w3.org/2000/svg";
const H = 720;

function el(name, attrs = {}, parent) {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}

function geometry(L, portrait) {
  const pad = portrait ? 18 : 26;
  const trayW = portrait ? 78 : 86;
  const X0 = pad, Y0 = pad, Y1 = H - pad;
  const TRAY_X1 = L - pad, TRAY_X0 = TRAY_X1 - trayW;
  const X1 = TRAY_X0 - 12;
  const BAR_W = portrait ? 58 : 66;
  const HALF_W = (X1 - X0 - BAR_W) / 2;
  const PW = HALF_W / 6;
  const R = Math.min(PW * 0.46, ((Y1 - Y0) / 2 - 12) / 10.2);
  return {
    L, portrait, pad, X0, X1, Y0, Y1, BAR_W, HALF_W, PW, R,
    MID_Y: H / 2,
    POINT_H: (Y1 - Y0) * 0.42,
    TRAY_X0, TRAY_X1, TRAY_CX: (TRAY_X0 + TRAY_X1) / 2,
    BAR_CX: X0 + HALF_W + BAR_W / 2,
    RIGHT_X0: X0 + HALF_W + BAR_W,
    MAX_SPAN: (Y1 - Y0) / 2 - 8,
  };
}

const PIPS = {
  1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

export class BoardView {
  // onPick(point) for taps; onDragStart(point) -> bool and onDrop(from, to) -> bool for drags.
  constructor(svg, { onPick, onDragStart, onDrop } = {}) {
    this.svg = svg;
    this.onPick = onPick;
    this.onDragStart = onDragStart;
    this.onDrop = onDrop;
    this.stacks = null;
    this.highlights = { movable: new Set(), selected: null, targets: [] };
    this.diceState = null;
    this.cubeState = { hidden: true };
    this.shots = [];
    this.layout = { portrait: false, L: 1000 };
    this.bindPointer();
    this.build();
  }

  // ---------- layout ----------

  // Picks orientation and board length to fill a box of the given pixel size.
  fit(width, height) {
    if (!width || !height) return;
    const portrait = height > width * 1.08;
    const ratio = portrait ? height / width : width / height;
    const L = Math.round(Math.min(portrait ? 1420 : 1180, Math.max(1000, H * ratio)) / 10) * 10;
    if (portrait === this.layout.portrait && L === this.layout.L) return;
    this.layout = { portrait, L };
    this.build();
    if (this.stacks) {
      this.svg.classList.add("no-anim");
      this.render();
      this.restack();
      requestAnimationFrame(() => requestAnimationFrame(() => this.svg.classList.remove("no-anim")));
    }
    if (this.diceState) this.setDice(...this.diceState);
    this.setCube(this.cubeState);
    this.setShotMarkers(this.shots);
  }

  // Landscape coordinates -> screen (viewBox) coordinates.
  map(x, y) {
    return this.g.portrait ? [H - y, x] : [x, y];
  }

  pointGeom(i) {
    const g = this.g;
    let half, col;
    if (i <= 6) { half = g.RIGHT_X0; col = 6 - i; }
    else if (i <= 12) { half = g.X0; col = 12 - i; }
    else if (i <= 18) { half = g.X0; col = i - 13; }
    else { half = g.RIGHT_X0; col = i - 19; }
    return { x: half + g.PW * (col + 0.5), top: i >= 13 };
  }

  stackY(top, k, n) {
    const { R, Y0, Y1, MAX_SPAN } = this.g;
    const s = n <= 5 ? 2 * R : Math.min(2 * R, (MAX_SPAN - 2 * R) / (n - 1));
    return top ? Y0 + R + 1 + k * s : Y1 - R - 1 - k * s;
  }

  // ---------- construction ----------

  build() {
    const g = (this.g = geometry(this.layout.L, this.layout.portrait));
    const svg = this.svg;
    const W = g.portrait ? H : g.L, HH = g.portrait ? g.L : H;
    svg.setAttribute("viewBox", `0 0 ${W} ${HH}`);
    svg.classList.toggle("portrait", g.portrait);
    svg.innerHTML = "";

    const defs = el("defs", {}, svg);
    const grad = (id, stops, cx = "36%", cy = "30%") => {
      const gr = el("radialGradient", { id, cx, cy, r: "78%" }, defs);
      stops.forEach(([o, c]) => el("stop", { offset: o, "stop-color": c }, gr));
    };
    grad("chk-me", [["0%", "var(--chk-me-hi)"], ["70%", "var(--chk-me)"], ["100%", "var(--chk-me-lo)"]]);
    grad("chk-opp", [["0%", "var(--chk-opp-hi)"], ["70%", "var(--chk-opp)"], ["100%", "var(--chk-opp-lo)"]]);
    grad("felt", [["0%", "var(--felt-hi)"], ["100%", "var(--felt)"]], "50%", "50%");

    // Static board, drawn in landscape coordinates and rotated as a whole in portrait.
    const rot = g.portrait ? `translate(${H},0) rotate(90)` : "";
    const st = el("g", { class: "b-static", transform: rot }, svg);
    el("rect", { x: 0, y: 0, width: g.L, height: H, rx: g.portrait ? 26 : 30, class: "b-frame" }, st);
    el("rect", { x: g.X0, y: g.Y0, width: g.HALF_W, height: g.Y1 - g.Y0, rx: 10, class: "b-felt" }, st);
    el("rect", { x: g.RIGHT_X0, y: g.Y0, width: g.HALF_W, height: g.Y1 - g.Y0, rx: 10, class: "b-felt" }, st);
    el("rect", { x: g.X0 + g.HALF_W + 8, y: g.Y0, width: g.BAR_W - 16, height: g.Y1 - g.Y0, rx: 8, class: "b-bar" }, st);
    el("rect", { x: g.TRAY_X0, y: g.Y0, width: g.TRAY_X1 - g.TRAY_X0, height: g.Y1 - g.Y0, rx: 12, class: "b-tray" }, st);
    el("line", { x1: g.TRAY_X0 + 14, x2: g.TRAY_X1 - 14, y1: g.MID_Y, y2: g.MID_Y, class: "b-tray-split" }, st);

    for (let i = 1; i <= 24; i++) {
      const { x, top } = this.pointGeom(i);
      const base = top ? g.Y0 : g.Y1;
      const tip = top ? g.Y0 + g.POINT_H : g.Y1 - g.POINT_H;
      const w = g.PW / 2 - 3;
      el("path", {
        d: `M${x - w},${base} L${x + w},${base} L${x + 1.5},${tip} Q${x},${tip + (top ? 3 : -3)} ${x - 1.5},${tip} Z`,
        class: "b-point " + (i % 2 ? "pt-a" : "pt-b"),
      }, st);
    }
    this.trayGlow = el("rect", { x: g.TRAY_X0 + 4, y: g.MID_Y + 4, width: g.TRAY_X1 - g.TRAY_X0 - 8, height: g.Y1 - g.MID_Y - 8, rx: 9, class: "b-tray-target" }, st);

    // Point numbers, kept upright.
    const labels = el("g", { class: "b-labels" }, svg);
    for (let i = 1; i <= 24; i++) {
      const { x, top } = this.pointGeom(i);
      const [lx, ly] = this.map(x, top ? g.pad / 2 + 1 : H - g.pad / 2 - 1);
      const t = el("text", { x: lx, y: ly, class: "b-label", "dominant-baseline": "central" }, labels);
      t.textContent = i;
    }

    this.markerLayer = el("g", { class: "b-markers" }, svg);
    this.diceLayer = el("g", { class: "b-dice" }, svg);
    this.cubeLayer = el("g", { class: "b-cube" }, svg);
    this.checkerLayer = el("g", { class: "b-checkers" }, svg);
    this.countLayer = el("g", { class: "b-counts" }, svg);
    this.shotLayer = el("g", { class: "b-shots" }, svg);

    // Pointer targets on top, in landscape coordinates inside the rotated group.
    const hits = el("g", { class: "b-hits", transform: rot }, svg);
    for (let i = 1; i <= 24; i++) {
      const { x, top } = this.pointGeom(i);
      el("rect", { x: x - g.PW / 2, y: top ? 0 : g.MID_Y, width: g.PW, height: H / 2, class: "b-hit", "data-point": i }, hits);
    }
    el("rect", { x: g.X0 + g.HALF_W, y: 0, width: g.BAR_W, height: g.MID_Y, class: "b-hit", "data-point": BAR }, hits);
    el("rect", { x: g.TRAY_X0, y: g.MID_Y, width: g.L - g.TRAY_X0, height: H - g.MID_Y, class: "b-hit", "data-point": OFF }, hits);

    this.checkerEls = new Map();
    const r = g.R;
    for (const side of ["me", "opp"]) {
      for (let n = 0; n < 15; n++) {
        const c = el("g", { class: `chk chk-${side}` }, this.checkerLayer);
        el("circle", { r, cx: 1.5, cy: 3, class: "chk-shadow" }, c);
        el("circle", { r, class: "chk-body", fill: `url(#chk-${side})` }, c);
        el("circle", { r: r * 0.74, class: "chk-groove" }, c);
        el("circle", { r: r * 0.5, class: "chk-core" }, c);
        this.checkerEls.set(side + n, c);
      }
    }
  }

  // ---------- pointer input ----------

  bindPointer() {
    const svg = this.svg;
    const pointAt = (e) => {
      const target = document.elementFromPoint(e.clientX, e.clientY);
      const p = target?.closest?.(".b-hit")?.dataset.point;
      return p === undefined ? null : Number(p);
    };
    const toSvg = (e) => {
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      return pt.matrixTransform(svg.getScreenCTM().inverse());
    };
    let drag = null;
    svg.addEventListener("pointerdown", (e) => {
      const from = pointAt(e);
      if (from === null || e.button > 0) return;
      drag = { from, x: e.clientX, y: e.clientY, moved: false, el: null };
      const s = this.stacks;
      const id = s && from !== OFF ? s.me[from]?.[s.me[from].length - 1] : null;
      if (id && this.onDragStart?.(from)) drag.el = this.checkerEls.get(id);
      try { svg.setPointerCapture(e.pointerId); } catch { /* synthetic events have no capturable pointer */ }
    });
    svg.addEventListener("pointermove", (e) => {
      if (!drag?.el) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
      drag.moved = true;
      const p = toSvg(e);
      drag.el.classList.add("dragging");
      this.checkerLayer.appendChild(drag.el);
      drag.el.style.transform = `translate(${p.x}px, ${p.y}px) scale(1.12)`;
    });
    const end = (e, cancelled) => {
      if (!drag) return;
      const d = drag;
      drag = null;
      if (d.el) d.el.classList.remove("dragging");
      if (cancelled) return this.render();
      if (!d.moved) return this.onPick?.(d.from);
      const to = pointAt(e);
      if (to === null || to === d.from || !this.onDrop?.(d.from, to)) this.render();
    };
    svg.addEventListener("pointerup", (e) => end(e, false));
    svg.addEventListener("pointercancel", (e) => end(e, true));
  }

  // ---------- state ----------

  setPosition(pos) {
    let me = 0, opp = 0;
    const st = { me: Array.from({ length: 26 }, () => []), opp: Array.from({ length: 26 }, () => []), meOff: [], oppOff: [] };
    for (let i = 0; i <= 25; i++) {
      for (let k = 0; k < pos.me[i]; k++) st.me[i].push("me" + me++);
      for (let k = 0; k < pos.opp[i]; k++) st.opp[i].push("opp" + opp++);
    }
    while (me < 15) st.meOff.push("me" + me++);
    while (opp < 15) st.oppOff.push("opp" + opp++);
    const first = !this.stacks;
    this.stacks = st;
    this.svg.classList.add("no-anim");
    this.render();
    this.restack();
    requestAnimationFrame(() => requestAnimationFrame(() => this.svg.classList.remove("no-anim")));
    if (first) this.svg.classList.add("ready");
  }

  snapshot() {
    const s = this.stacks;
    return { me: s.me.map((a) => a.slice()), opp: s.opp.map((a) => a.slice()), meOff: s.meOff.slice(), oppOff: s.oppOff.slice() };
  }

  restore(snap) {
    this.stacks = { me: snap.me.map((a) => a.slice()), opp: snap.opp.map((a) => a.slice()), meOff: snap.meOff.slice(), oppOff: snap.oppOff.slice() };
    this.render();
    this.restackLater();
  }

  step(from, to) {
    const s = this.stacks;
    const id = s.me[from].pop();
    if (to === OFF) s.meOff.push(id);
    else {
      if (s.opp[to].length === 1) s.opp[0].push(s.opp[to].pop());
      s.me[to].push(id);
    }
    this.render();
    this.restackLater();
  }

  // Engine checker move in the user's numbering. to === "off" bears off; hits send the user's blot to the bar.
  stepOpp(from, to) {
    const s = this.stacks;
    const id = s.opp[from].pop();
    if (to === "off") s.oppOff.push(id);
    else {
      if (s.me[to].length === 1) s.me[BAR].push(s.me[to].pop());
      s.opp[to].push(id);
    }
    this.render();
    this.restackLater();
  }

  // Current counts as a position object (used once gnubg has already moved on to a new game).
  position() {
    const s = this.stacks;
    return { me: s.me.map((a) => a.length), opp: s.opp.map((a) => a.length), meOff: s.meOff.length, oppOff: s.oppOff.length };
  }

  matches(pos) {
    const s = this.stacks;
    for (let i = 0; i <= 25; i++) if (s.me[i].length !== pos.me[i] || s.opp[i].length !== pos.opp[i]) return false;
    return s.meOff.length === pos.meOff && s.oppOff.length === pos.oppOff;
  }

  restackLater() {
    clearTimeout(this.restackTimer);
    this.restackTimer = setTimeout(() => this.restack(), 380);
  }

  restack() {
    const s = this.stacks;
    const order = [];
    for (let i = 0; i <= 25; i++) order.push(...s.opp[i], ...s.me[i]);
    order.push(...s.meOff, ...s.oppOff);
    for (const id of order) this.checkerLayer.appendChild(this.checkerEls.get(id));
  }

  // ---------- rendering ----------

  render() {
    const s = this.stacks;
    if (!s) return;
    const g = this.g;
    const place = (id, x, y, off = false) => {
      const c = this.checkerEls.get(id);
      const [sx, sy] = this.map(x, y);
      const squash = off ? (g.portrait ? " scale(0.24, 1)" : " scale(1, 0.24)") : "";
      c.style.transform = `translate(${sx}px, ${sy}px)${squash}`;
      c.classList.toggle("is-off", off);
    };
    this.countLayer.innerHTML = "";
    const count = (x, y, n, side) => {
      if (n < 6) return;
      const [cx, cy] = this.map(x, y);
      const t = el("text", { x: cx, y: cy, class: "chk-count " + side, "dominant-baseline": "central" }, this.countLayer);
      t.textContent = n;
    };
    for (let i = 1; i <= 24; i++) {
      const { x, top } = this.pointGeom(i);
      const ids = s.me[i].length ? s.me[i] : s.opp[i];
      ids.forEach((id, k) => place(id, x, this.stackY(top, k, ids.length)));
      if (ids.length) count(x, this.stackY(top, ids.length - 1, ids.length), ids.length, s.me[i].length ? "me" : "opp");
    }
    const barStep = (n) => Math.min(2 * g.R - 4, (g.MID_Y - g.Y0 - 2 * g.R - 20) / Math.max(1, n - 1));
    s.me[BAR].forEach((id, k) => place(id, g.BAR_CX, g.MID_Y - g.R - 10 - k * barStep(s.me[BAR].length)));
    s.opp[0].forEach((id, k) => place(id, g.BAR_CX, g.MID_Y + g.R + 10 + k * barStep(s.opp[0].length)));
    const slab = Math.min(15, (g.Y1 - g.MID_Y - 16) / 15);
    s.meOff.forEach((id, k) => place(id, g.TRAY_CX, g.Y1 - 12 - k * slab, true));
    s.oppOff.forEach((id, k) => place(id, g.TRAY_CX, g.Y0 + 12 + k * slab, true));
    this.renderHighlights();
  }

  setHighlights(h) {
    this.highlights = { movable: new Set(), selected: null, targets: [], ...h };
    this.renderHighlights();
  }

  renderHighlights() {
    const { movable, selected, targets } = this.highlights;
    const s = this.stacks;
    if (!s) return;
    for (const c of this.checkerEls.values()) c.classList.remove("movable", "selected");
    const topOf = (i) => s.me[i][s.me[i].length - 1];
    for (const i of movable) {
      const id = topOf(i);
      if (id) this.checkerEls.get(id).classList.add(i === selected ? "selected" : "movable");
    }
    this.markerLayer.innerHTML = "";
    this.trayGlow.classList.toggle("on", targets.some((t) => t.to === OFF));
    for (const t of targets) {
      if (t.to === OFF) continue;
      const { x, top } = this.pointGeom(t.to);
      const n = s.me[t.to].length;
      const [mx, my] = this.map(x, this.stackY(top, n, Math.max(n + 1, 1)));
      const m = el("g", { class: "target", style: `transform: translate(${mx}px, ${my}px)` }, this.markerLayer);
      el("circle", { r: this.g.R - 3, class: "target-ring" }, m);
      el("circle", { r: 5, class: "target-dot" }, m);
    }
    this.svg.classList.toggle("has-selection", selected !== null && selected !== undefined);
    // While a move is being entered, touches on the board move checkers instead of scrolling the page.
    this.svg.classList.toggle("interactive", movable.size > 0 || targets.length > 0);
  }

  // Rings the user's blots and labels each with how many of GNU's 36 rolls hit it.
  // markers: [{ point, shots }]
  setShotMarkers(markers = []) {
    this.shots = markers;
    this.shotLayer.innerHTML = "";
    const R = this.g.R;
    for (const { point, shots } of markers) {
      const { x, top } = this.pointGeom(point);
      const [sx, sy] = this.map(x, this.stackY(top, 0, 1));
      const m = el("g", { class: "shot", style: `transform: translate(${sx}px, ${sy}px)` }, this.shotLayer);
      el("circle", { r: R + 4, class: "shot-ring" }, m);
      el("circle", { cx: R * 0.8, cy: -R * 0.8, r: 15, class: "shot-badge" }, m);
      const t = el("text", { x: R * 0.8, y: -R * 0.8, class: "shot-num", "dominant-baseline": "central" }, m);
      t.textContent = shots;
    }
  }

  // side: "me" (dice in the user's half) or "opp".
  setDice(dice, used = [], side = "me") {
    this.diceState = dice ? [dice, used, side] : null;
    this.diceLayer.innerHTML = "";
    if (!dice || !dice.length) return;
    const g = this.g;
    const list = dice[0] === dice[1] ? [dice[0], dice[0], dice[0], dice[0]] : dice;
    const size = list.length === 4 ? Math.min(46, g.R * 1.5) : Math.min(58, g.R * 1.8);
    const gap = size * 0.22;
    const total = list.length * size + (list.length - 1) * gap;
    const [cx, cy] = this.map(side === "me" ? g.RIGHT_X0 + g.HALF_W / 2 : g.X0 + g.HALF_W / 2, g.MID_Y);
    list.forEach((v, idx) => {
      const x = cx - total / 2 + idx * (size + gap);
      const d = el("g", { class: `die die-${side}` + (used[idx] ? " used" : ""), style: `transform: translate(${x}px, ${cy - size / 2}px)` }, this.diceLayer);
      el("rect", { x: 1.5, y: 3, width: size, height: size, rx: size * 0.24, class: "die-shadow" }, d);
      el("rect", { width: size, height: size, rx: size * 0.24, class: "die-body" }, d);
      for (const [px, py] of PIPS[v]) {
        el("circle", { cx: size / 2 + px * size * 0.26, cy: size / 2 + py * size * 0.26, r: size * 0.088, class: "die-pip" }, d);
      }
    });
  }

  // owner: "center" | "me" | "opp"; offeredBy: null | "me" | "opp" (the cube is on the board at value x2)
  setCube({ value = 1, owner = "center", offeredBy = null, hidden = false } = {}) {
    this.cubeState = { value, owner, offeredBy, hidden };
    this.cubeLayer.innerHTML = "";
    if (hidden) return;
    const g = this.g;
    const size = Math.min(54, g.R * 1.7);
    let x = g.TRAY_CX, y = g.MID_Y;
    if (offeredBy) {
      x = (offeredBy === "me" ? g.RIGHT_X0 : g.X0) + g.HALF_W / 2;
    } else if (owner === "me") y = g.MID_Y + 64 + size / 2;
    else if (owner === "opp") y = g.MID_Y - 64 - size / 2;
    const [cx, cy] = this.map(x, y);
    const c = el("g", { class: "cube" + (offeredBy ? " offered" : ""), style: `transform: translate(${cx - size / 2}px, ${cy - size / 2}px)` }, this.cubeLayer);
    el("rect", { x: 1.5, y: 3, width: size, height: size, rx: 11, class: "die-shadow" }, c);
    el("rect", { width: size, height: size, rx: 11, class: "cube-body" }, c);
    const t = el("text", { x: size / 2, y: size / 2, class: "cube-num", "dominant-baseline": "central" }, c);
    const shown = offeredBy ? value * 2 : value;
    t.textContent = shown === 1 ? "64" : shown;
  }
}
