// Explains engine verdicts in plain language. Pure functions, no DOM or engine.
//
// The engine says WHICH play is best; we describe WHY by comparing the position after the best play
// with the position after the other play (blots and exact shot counts, points made, primes, hits,
// race...). Reasons are only stated in the direction the engine already agrees with, so they never
// contradict its ranking; they are heuristics, not proofs.
import {
  emptyPosition, clonePosition, applyStep, applyNotation, singleSteps, removeDie,
  positionKey, pipCount, hasContact, OFF,
} from "./game.js";

// ---------- shots ----------

// The opponent's view of the board, so the user's move generator can be reused for its rolls.
export function mirror(p) {
  const m = emptyPosition();
  for (let i = 1; i <= 24; i++) {
    m.me[i] = p.opp[25 - i];
    m.opp[i] = p.me[25 - i];
  }
  m.me[25] = p.opp[0];
  m.opp[0] = p.me[25];
  m.meOff = p.oppOff;
  m.oppOff = p.meOff;
  return m;
}

// Points (in the mirrored numbering) the side to move can hit with these dice.
function hitsWith(pos, dice, seen, hits) {
  const key = positionKey(pos) + "#" + dice.join("");
  if (seen.has(key)) return;
  seen.add(key);
  for (const die of new Set(dice)) {
    for (const s of singleSteps(pos, die)) {
      if (s.to !== OFF && pos.opp[s.to] === 1) hits.add(s.to);
      const next = clonePosition(pos);
      applyStep(next, s.from, s.to);
      const rest = removeDie(dice, die);
      if (rest.length) hitsWith(next, rest, seen, hits);
    }
  }
}

// For the user's blots in p: how many of the opponent's 36 rolls hit each one, hit at least one,
// and hit at least one "exposed" blot (outside GNU's home board, where a hit really costs).
export function shotsAgainst(p) {
  const m = mirror(p);
  const perBlot = new Map();
  for (let i = 1; i <= 24; i++) if (p.me[i] === 1) perBlot.set(i, 0);
  let total = 0, exposed = 0;
  if (!perBlot.size) return { total, exposed, perBlot };
  for (let a = 1; a <= 6; a++) {
    for (let b = a; b <= 6; b++) {
      const weight = a === b ? 1 : 2;
      const hits = new Set();
      hitsWith(m, a === b ? [a, a, a, a] : [a, b], new Set(), hits);
      if (hits.size) total += weight;
      if ([...hits].some((h) => 25 - h <= 18)) exposed += weight;
      for (const h of hits) {
        const point = 25 - h;
        if (perBlot.has(point)) perBlot.set(point, perBlot.get(point) + weight);
      }
    }
  }
  return { total, exposed, perBlot };
}

// ---------- position features (user's side, opponent to roll next) ----------

export function features(p) {
  const made = (i) => p.me[i] >= 2;
  let prime = 0, primeLow = 0, run = 0;
  for (let i = 1; i <= 24; i++) {
    run = made(i) ? run + 1 : 0;
    if (run > prime) { prime = run; primeLow = i - run + 1; }
  }
  let builders = 0;
  for (let i = 4; i <= 11; i++) builders += p.me[i] === 1 ? 1 : Math.max(0, p.me[i] - 2);
  const contact = hasContact(p);
  let gaps = 0;
  if (!contact) {
    let high = 0;
    for (let i = 6; i >= 1; i--) if (p.me[i]) { high = i; break; }
    for (let i = 1; i < high; i++) if (!p.me[i]) gaps++;
  }
  // Engine checkers behind the prime (they move upward in the user's numbering).
  let trapped = 0;
  for (let i = 0; i < primeLow; i++) trapped += p.opp[i];
  const { mine, theirs } = pipCount(p);
  const shots = contact ? shotsAgainst(p) : { total: 0, exposed: 0, perBlot: new Map() };
  return {
    made: Array.from({ length: 25 }, (_, i) => i > 0 && made(i)),
    blots: countBlots(p),
    exposedBlots: [...shots.perBlot.keys()].filter((i) => i <= 18),
    backBlots: [19, 20, 21, 22, 23, 24].filter((i) => p.me[i] === 1).length,
    oppAttackers: [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24].reduce((n, i) => n + p.opp[i], 0),
    shots,
    homePoints: [1, 2, 3, 4, 5, 6].filter(made).length,
    prime, primeLow, trapped: prime >= 4 ? trapped : 0,
    anchors: [19, 20, 21, 22, 23, 24].filter(made),
    back: p.me[25] + [19, 20, 21, 22, 23, 24].reduce((n, i) => n + p.me[i], 0),
    builders,
    maxStack: Math.max(...p.me.slice(1, 25)),
    oppBar: p.opp[0],
    mine, theirs, lead: theirs - mine,
    contact,
    off: p.meOff,
    gaps,
  };
}

function countBlots(p) {
  let n = 0;
  for (let i = 1; i <= 24; i++) if (p.me[i] === 1) n++;
  return n;
}

// ---------- wording helpers ----------

const plural = (n, word, many = word + "s") => `${n} ${n === 1 ? word : many}`;
const pct = (x) => `${(Math.abs(x) * 100).toFixed(1)}%`;

function pointName(i) {
  if (i >= 19) return `GNU's ${25 - i}-point`;
  if (i === 18) return "GNU's bar point";
  if (i === 13) return "your midpoint";
  if (i === 7) return "your bar point";
  return `your ${i}-point`;
}

// How much owning each point is worth in a typical middle game (rough weights).
const POINT_VALUE = { 5: 0.07, 4: 0.05, 7: 0.05, 6: 0.04, 3: 0.03, 8: 0.03, 9: 0.025, 10: 0.02, 11: 0.02, 2: 0.015, 1: 0.005, 20: 0.06, 21: 0.045, 18: 0.04, 19: 0.03, 22: 0.02, 23: 0.015, 24: 0.01 };
const POINT_NOTE = {
  5: "the most valuable point in your home board",
  4: "a strong home-board point",
  7: "which blocks GNU's 6s from escaping",
  20: "the best anchor you can hold",
  21: "a solid advanced anchor",
  18: "an outfield point that blocks GNU's runners",
};

// ---------- checker play ----------

// Compares two candidate plays from the same start position.
// better/worse: engine hints { move, equity, probs }. Labels name them in the text.
export function explainChecker(start, better, worse, { betterLabel = "The best play", worseLabel = "Your play" } = {}) {
  const A = features(applyNotation(start, better.move));
  const B = features(applyNotation(start, worse.move));
  const before = features(start);
  const reasons = [];
  const tradeoffs = [];
  const add = (list, key, weight, text) => list.push({ key, weight, text });

  // Safety: exact shot counts on blots outside GNU's home board.
  const shotDiff = B.shots.exposed - A.shots.exposed;
  if (shotDiff >= 4 && B.contact) {
    const blots = B.exposedBlots;
    const where = blots.length === 1 ? `a blot on ${pointName(blots[0])}` : blots.length === 2 ? `blots on ${pointName(blots[0])} and ${pointName(blots[1]).replace(/^your /, pointName(blots[0]).startsWith("your") ? "" : "your ")}` : `${blots.length} blots in the open`;
    add(reasons, "safety", (shotDiff / 36) * 0.5,
      `${worseLabel} leaves ${where}, hit by ${B.shots.exposed} of 36 rolls; ${lower(betterLabel)} ${A.shots.exposed === 0 ? "leaves no such shot" : `cuts that to ${A.shots.exposed}`}.`);
  } else if (-shotDiff >= 4 && A.contact) {
    add(tradeoffs, "safety", 0,
      `${worseLabel} is safer (${B.shots.exposed} shots against ${A.shots.exposed}), but the risk pays for itself.`);
  }

  // Attack: hitting.
  const hitsA = A.oppBar - before.oppBar, hitsB = B.oppBar - before.oppBar;
  if (hitsA > hitsB) {
    const strong = A.homePoints >= 3;
    add(reasons, "attack", 0.07 * (hitsA - hitsB) + (strong ? 0.04 : 0),
      `${betterLabel} ${hitsA - hitsB > 1 ? "puts two black checkers on the bar" : "hits"}${hitsB ? " more" : ""}${strong ? `, and with ${plural(A.homePoints, "home point")} made GNU may struggle to come in` : ", costing GNU pips and a tempo"}.`);
  } else if (hitsB > hitsA) {
    add(tradeoffs, "attack", 0, `${worseLabel} hits, but here that gain is smaller than what it gives up.`);
  }

  // Structure: valuable points made by one play and not the other.
  const newPoints = (F) => F.made.map((m, i) => m && !before.made[i] ? i : 0).filter(Boolean);
  const onlyA = newPoints(A).filter((i) => !B.made[i]);
  const onlyB = newPoints(B).filter((i) => !A.made[i]);
  for (const i of onlyA) {
    const v = POINT_VALUE[i] ?? 0.015;
    add(reasons, "structure", v, `${betterLabel} makes ${pointName(i)}${POINT_NOTE[i] ? `, ${POINT_NOTE[i]}` : ""}.`);
  }
  for (const i of onlyB) {
    if ((POINT_VALUE[i] ?? 0) >= 0.04) add(tradeoffs, "structure", 0, `${worseLabel} makes ${pointName(i)}, which is nice, but it isn't enough here.`);
  }

  // Priming.
  if (A.prime >= 4 && A.prime > B.prime && A.trapped > 0) {
    add(reasons, "prime", 0.03 * (A.prime - B.prime) + 0.02, `${betterLabel} builds a ${A.prime}-point prime with ${plural(A.trapped, "black checker")} trapped behind it.`);
  }

  // Home board while GNU is on the bar.
  if (A.oppBar > 0 && A.homePoints > B.homePoints && !reasons.some((r) => r.key === "structure")) {
    add(reasons, "structure", 0.03 * (A.homePoints - B.homePoints),
      `With GNU on the bar, ${A.homePoints} closed home points instead of ${B.homePoints} make it much harder to come in.`);
  }

  // Back checkers and anchors.
  if (B.contact && B.back - A.back >= 1 && A.lead > -20) {
    add(reasons, "mobility", 0.025 * (B.back - A.back), `${betterLabel} gets ${B.back - A.back > 1 ? "back checkers" : "a back checker"} moving out of GNU's home board before they get trapped.`);
  }
  if (A.anchors.length > B.anchors.length && A.contact) {
    add(reasons, "structure", 0.03, `${betterLabel} keeps an anchor on ${pointName(A.anchors[A.anchors.length - 1])}, a safe landing spot if you get hit.`);
  }

  // Back blots GNU can attack (hit and make points on them).
  if (B.contact && B.backBlots > A.backBlots && B.oppAttackers >= 6) {
    add(reasons, "safety", 0.02 * (B.backBlots - A.backBlots) + 0.01,
      `${worseLabel} leaves ${B.backBlots > 1 ? `${B.backBlots} loose checkers` : "a loose checker"} in GNU's home board, inviting GNU to attack by hitting and making points on top of ${B.backBlots > 1 ? "them" : "it"}.`);
  }

  // Flexibility.
  if (A.builders > B.builders && A.contact) {
    const n = A.builders - B.builders;
    add(reasons, "structure", 0.012 * n, `${betterLabel} brings ${n > 1 ? "more builders" : "an extra builder"} into range for making new points next turn.`);
  }
  if (B.maxStack >= 6 && B.maxStack - A.maxStack >= 2) {
    add(reasons, "structure", 0.015, `${worseLabel} stacks ${B.maxStack} checkers on one point, where they do little work.`);
  }

  // Race and bear-off.
  if (!A.contact && B.contact && A.lead > 0) {
    add(reasons, "race", 0.05, `${betterLabel} breaks contact while you lead the race by ${plural(A.lead, "pip")}, so there is nothing left to get hit.`);
  }
  if (!A.contact && !B.contact) {
    if (A.off > B.off) add(reasons, "race", 0.04 * (A.off - B.off), `${betterLabel} bears off ${plural(A.off - B.off, "more checker")}.`);
    if (B.gaps > A.gaps) add(reasons, "race", 0.015 * (B.gaps - A.gaps), `${worseLabel} leaves gaps on your low points, so more future rolls get wasted.`);
  }

  // Gammons, from the engine's own probabilities.
  const [pa, pb] = [better.probs, worse.probs];
  if (pa && pb) {
    const dLoseG = pb[4] - pa[4], dWinG = pa[1] - pb[1];
    if (dLoseG >= 0.025) add(reasons, "gammon", dLoseG, `${worseLabel} gets gammoned ${pct(dLoseG)} more often.`);
    if (dWinG >= 0.025) add(reasons, "gammon", dWinG, `${betterLabel} wins a gammon ${pct(dWinG)} more often.`);
  }

  reasons.sort((a, b) => b.weight - a.weight);
  const top = reasons.slice(0, 3);
  return {
    summary: oddsSummary(better, worse, betterLabel, worseLabel),
    reasons: top.map((r) => r.text),
    tradeoff: tradeoffs[0]?.text || null,
    category: CATEGORY[top[0]?.key] || null,
    shots: { better: A.shots, worse: B.shots },
  };
}

const CATEGORY = {
  safety: "Safety error",
  attack: "Missed attack",
  structure: "Structural miss",
  prime: "Structural miss",
  mobility: "Stuck back checkers",
  race: "Racing inefficiency",
  gammon: "Gammon management",
};

function lower(label) {
  return label.charAt(0).toLowerCase() + label.slice(1);
}

function oddsSummary(better, worse, betterLabel, worseLabel) {
  const [pa, pb] = [better.probs, worse.probs];
  if (!pa || !pb) return null;
  const dWin = pa[0] - pb[0];
  if (dWin >= 0.003) return `${betterLabel} wins ${pct(dWin)} more games.`;
  if (dWin <= -0.003) return `${worseLabel} actually wins ${pct(dWin)} more games, but ${lower(betterLabel)} more than makes up for it on gammons.`;
  return "Both plays win about as often; the difference is in gammons and position.";
}

// ---------- cube ----------

// kind: "double" (user on roll) or "take" (GNU doubled). cube: parsed cube hint (doubler's side).
export function explainCube(kind, cube) {
  const { nd, dt, dp, probs } = cube;
  const reasons = [];
  if (!probs) return { reasons };
  const [win, wg, , lose, lg] = probs;
  const doublerWin = pct(win);
  if (kind === "take") {
    const takerWin = pct(lose);
    if (dt <= dp) {
      reasons.push(`You still win ${takerWin} of the games (${pct(lg)} as gammons), enough to accept playing for 2.`);
      reasons.push(`Taking costs ${(dt).toFixed(3)} per game; passing gives up a full 1.000, so taking loses less.`);
      if (lose < 0.25) reasons.push("Owning the cube helps: you can redouble if things turn, which lowers the winning chances you need.");
    } else {
      reasons.push(`You only win ${takerWin} of the games and get gammoned ${pct(wg)} of the time.`);
      reasons.push(`After a take you'd expect to lose ${dt.toFixed(3)} per game at the old stake, worse than the 1.000 you give up by passing.`);
    }
    return { reasons };
  }
  const gain = Math.min(dt, dp) - nd;
  if (nd > dp) {
    reasons.push(`You are too good to double: you win ${doublerWin} with ${pct(wg)} gammons.`);
    reasons.push(`Playing on is worth ${nd.toFixed(3)}, more than the 1.000 GNU would concede by passing.`);
  } else if (gain > 0) {
    reasons.push(`You win ${doublerWin} of the games, strong enough that doubling gains ${gain.toFixed(3)} per game.`);
    reasons.push(dp < dt ? "GNU should pass, so doubling cashes the game now before your position can slip." : "GNU should still take, so you double for twice the stake while keeping your edge.");
  } else {
    reasons.push(`You win ${doublerWin} of the games; not quite enough yet.`);
    reasons.push(`Doubling now would give GNU the cube and cost you ${Math.abs(gain).toFixed(3)} per game. Waiting keeps the option for when your threats land.`);
  }
  return { reasons };
}
