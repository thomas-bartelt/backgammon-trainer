// Async proxy to the engine worker. The engine is the regular gnubg CLI:
// we send text commands and get back what it printed.

let worker = null;
let seq = 0;
const pending = new Map();
let readyPromise = null;

// Commands wait for the engine to finish loading, in the order they were sent.
async function request(message) {
  await Engine.load();
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, ...message });
  });
}

export const Engine = {
  // setup: commands run once the WASM build is up, before any other command is accepted.
  load(setup = []) {
    if (readyPromise) return readyPromise;
    worker = new Worker(new URL("./engine-worker.js", import.meta.url));
    readyPromise = new Promise((resolveReady, rejectReady) => {
      worker.onmessage = ({ data }) => {
        if (data.type === "ready") {
          if (!setup.length) return resolveReady();
          pending.set(0, { resolve: () => resolveReady(), reject: rejectReady });
          return worker.postMessage({ id: 0, type: "run", cmds: setup });
        }
        const p = pending.get(data.id);
        if (!p) return;
        pending.delete(data.id);
        if (data.error) p.reject(new Error(data.error));
        else p.resolve(data.result);
      };
      worker.onerror = (e) => rejectReady(e);
    });
    return readyPromise;
  },

  async run(cmd) {
    const [out] = await request({ type: "run", cmds: [cmd] });
    return out;
  },

  // Several commands in one round trip; returns one output per command.
  runAll(cmds) {
    return request({ type: "run", cmds });
  },

  saveMatch() {
    return request({ type: "save" });
  },

  loadMatch(sgf) {
    return request({ type: "load", sgf });
  },
};
