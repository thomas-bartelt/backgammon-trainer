// gnubg holds one game at a time. Full games and drills take turns on the engine:
// the live game is saved as SGF before a drill uses the engine and restored afterwards.
// Every engine operation runs under one lock so async flows never interleave commands.
import { Engine } from "./engine.js";

const GAME_KEY = "bgt.v2.game";

let chain = Promise.resolve();
let current = null; // "game" | "scratch"
let savedGame = localStorage.getItem(GAME_KEY);

function lock(fn) {
  const result = chain.then(fn);
  chain = result.catch(() => {});
  return result;
}

// Runs fn with the live game loaded in the engine.
export function inGame(fn) {
  return lock(async () => {
    if (current !== "game") {
      if (savedGame) await Engine.loadMatch(savedGame);
      current = "game";
    }
    return fn();
  });
}

// Runs fn on a scratch engine state (drills, challenges), parking the live game first.
export function inScratch(fn) {
  return lock(async () => {
    if (current === "game") {
      savedGame = await Engine.saveMatch();
      localStorage.setItem(GAME_KEY, savedGame);
    }
    current = "scratch";
    return fn();
  });
}

// Call at the end of a game action (inside inGame) so a reload can resume.
export async function checkpoint() {
  savedGame = await Engine.saveMatch();
  localStorage.setItem(GAME_KEY, savedGame);
}

export function hasSavedGame() {
  return Boolean(savedGame);
}

export function clearGame() {
  savedGame = null;
  localStorage.removeItem(GAME_KEY);
}
