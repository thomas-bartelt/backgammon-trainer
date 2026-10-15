// Board model, gnubg output parsers and move legality.
//
// Positions are always seen from the user's side ("somebody" in gnubg):
//   me[1..24]  the user's checkers, moving 24 -> 1, me[25] = user's bar
//   opp[1..24] the engine's checkers in the same numbering, opp[0] = engine's bar
//   meOff / oppOff = checkers borne off

export const BAR = 25;
export const OFF = 0;

export function emptyPosition() {
  return { me: new Array(26).fill(0), opp: new Array(26).fill(0), meOff: 0, oppOff: 0 };
}

export function clonePosition(p) {
  return { me: p.me.slice(), opp: p.opp.slice(), meOff: p.meOff, oppOff: p.oppOff };
}

export function positionKey(p) {
  return p.me.join(",") + "|" + p.opp.join(",") + "|" + p.meOff + "|" + p.oppOff;
}

// gnubg "rawboard" line: board:me:opp:matchlen:score:score:<26 points>:turn:dice...
export function parseBoardLine(line) {
  const f = line.trim().split(":");
  const raw = f.slice(6, 32).map(Number);
  const pos = emptyPosition();
  for (let i = 1; i <= 24; i++) {
    if (raw[i] > 0) pos.me[i] = raw[i];
    else if (raw[i] < 0) pos.opp[i] = -raw[i];
  }
  pos.me[BAR] = Math.abs(raw[25]);
  pos.opp[0] = Math.abs(raw[0]);
  pos.meOff = 15 - pos.me.reduce((a, b) => a + b, 0);
  pos.oppOff = 15 - pos.opp.reduce((a, b) => a + b, 0);
  const turn = Number(f[32]);
  return {
    pos,
    turn, // 1 = user, -1 = engine
    dice: turn === 1 ? [Number(f[33]), Number(f[34])] : [Number(f[35]), Number(f[36])],
    cube: Number(f[37]),
    iMayDouble: Number(f[38]) === 1,
    oppMayDouble: Number(f[39]) === 1,
    wasDoubled: Number(f[40]), // non-zero while a double is waiting for an answer
    matchLength: Number(f[3]),
    myScore: Number(f[4]),
    oppScore: Number(f[5]),
    crawford: Number(f[51]) === 1,
  };
}

export function lastBoardLine(output) {
  const lines = output.split("\n").filter((l) => l.startsWith("board:"));
  return lines.length ? lines[lines.length - 1] : null;
}

export function pipCount(p) {
  let mine = 0, theirs = 0;
  for (let i = 1; i <= 25; i++) mine += p.me[i] * i;
  for (let i = 0; i <= 24; i++) theirs += p.opp[i] * (25 - i);
  return { mine, theirs };
}

// Rough game phase used to tag decisions: opening, middle or bearoff (race / bear-off).
export function classifyPhase(p) {
  if (!hasContact(p)) return "bearoff";
  const { mine, theirs } = pipCount(p);
  return mine + theirs >= 290 ? "opening" : "middle";
}

export function hasContact(p) {
  let myBack = 0;
  for (let i = 25; i >= 1; i--) if (p.me[i]) { myBack = i; break; }
  let oppBack = 25;
  for (let i = 0; i <= 24; i++) if (p.opp[i]) { oppBack = i; break; }
  return myBack > oppBack;
}

// ---------- move application ----------

// Moves one of the user's checkers. Returns whether an engine blot was hit.
export function applyStep(p, from, to) {
  p.me[from]--;
  if (to === OFF) {
    p.meOff++;
    return false;
  }
  let hit = false;
  if (p.opp[to] === 1) {
    p.opp[to] = 0;
    p.opp[0]++;
    hit = true;
  }
  p.me[to]++;
  return hit;
}

const pointValue = (s) => (s === "bar" ? BAR : s === "off" ? OFF : Number(s));

// Expands gnubg notation ("24/18*/12 6/off(2)") into single from/to segments.
export function notationSegments(move) {
  const segs = [];
  for (const token of move.trim().split(/\s+/)) {
    const m = token.match(/^(.*?)(?:\((\d)\))?$/);
    const count = m[2] ? Number(m[2]) : 1;
    const pts = m[1].split("/").map((s) => pointValue(s.replace("*", "").toLowerCase()));
    for (let c = 0; c < count; c++) {
      for (let i = 0; i < pts.length - 1; i++) segs.push({ from: pts[i], to: pts[i + 1] });
    }
  }
  return segs;
}

export function applyNotation(p, move) {
  const next = clonePosition(p);
  for (const s of notationSegments(move)) applyStep(next, s.from, s.to);
  return next;
}

// ---------- legality ----------

function allHome(p) {
  if (p.me[BAR]) return false;
  for (let i = 7; i <= 24; i++) if (p.me[i]) return false;
  return true;
}

// Single-die steps available to the user, ignoring the "use as many dice as possible" rule.
export function singleSteps(p, die) {
  const steps = [];
  const sources = p.me[BAR] ? [BAR] : [];
  if (!sources.length) for (let i = 1; i <= 24; i++) if (p.me[i]) sources.push(i);
  const home = allHome(p);
  for (const from of sources) {
    const target = from - die;
    if (target >= 1) {
      if (p.opp[target] < 2) steps.push({ from, to: target, die });
    } else if (home) {
      if (target === 0) steps.push({ from, to: OFF, die });
      else {
        let higher = false;
        for (let j = from + 1; j <= 6; j++) if (p.me[j]) higher = true;
        if (!higher) steps.push({ from, to: OFF, die });
      }
    }
  }
  return steps;
}

function removeDie(dice, die) {
  const i = dice.indexOf(die);
  const next = dice.slice();
  next.splice(i, 1);
  return next;
}

// Steps from the current state that can still be completed into one of the engine's legal moves.
export function playableSteps(p, diceLeft, legalKeys) {
  const memo = new Map();
  const canFinish = (pos, dice) => {
    const key = positionKey(pos) + "#" + dice.join("");
    if (memo.has(key)) return memo.get(key);
    let ok = legalKeys.has(positionKey(pos));
    if (!ok) {
      for (const die of new Set(dice)) {
        for (const s of singleSteps(pos, die)) {
          const next = clonePosition(pos);
          applyStep(next, s.from, s.to);
          if (canFinish(next, removeDie(dice, die))) { ok = true; break; }
        }
        if (ok) break;
      }
    }
    memo.set(key, ok);
    return ok;
  };
  const result = [];
  for (const die of new Set(diceLeft)) {
    for (const s of singleSteps(p, die)) {
      const next = clonePosition(p);
      applyStep(next, s.from, s.to);
      if (canFinish(next, removeDie(diceLeft, die))) result.push(s);
    }
  }
  return result;
}

export { removeDie };

// ---------- gnubg output parsers ----------

export function parseMoveHints(output) {
  const lines = output.split("\n");
  const hints = [];
  const re = /^\s*(\d+)\.\s+(?:Cubeful|Cubeless)\s+(\d+)-ply\s+(.+?)\s+Eq\.:\s+([+-]?\d+\.\d+)(?:\s+\(\s*([+-]?\d+\.\d+)\))?/;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(re);
    if (!m) continue;
    const probs = (lines[i + 1] || "").trim().split(/\s+/).filter((x) => x !== "-").map(Number);
    hints.push({
      rank: Number(m[1]),
      ply: Number(m[2]),
      move: m[3].trim(),
      equity: Number(m[4]),
      diff: m[5] ? Number(m[5]) : 0,
      probs: probs.length === 6 && probs.every((x) => !Number.isNaN(x)) ? probs : null,
    });
  }
  return hints;
}

export function parseCubeHint(output) {
  const get = (label) => {
    const m = output.match(new RegExp("\\d\\.\\s+" + label + "\\s+([+-]?\\d+\\.\\d+)"));
    return m ? Number(m[1]) : null;
  };
  const nd = get("No (?:re)?double");
  const dt = get("(?:Re)?[Dd]ouble, take");
  const dp = get("(?:Re)?[Dd]ouble, pass");
  if (nd === null || dt === null || dp === null) return null;
  const proper = (output.match(/Proper cube action:\s*(.+)/) || [])[1] || "";
  const probLine = output.split("\n").find((l) => /^\s*\d\.\d{3}\s+\d\.\d{3}\s+\d\.\d{3}\s+-/.test(l));
  const probs = probLine ? probLine.trim().split(/\s+/).filter((x) => x !== "-").map(Number) : null;
  return { nd, dt, dp, proper: proper.trim(), probs };
}
