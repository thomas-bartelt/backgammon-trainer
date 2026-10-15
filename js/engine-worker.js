// Runs the GNU Backgammon WASM build off the main thread.
// Messages: { id, type: "run", cmds } | { id, type: "save" } | { id, type: "load", sgf }
// Our helpers live in a closure: gnubg.js is a classic script that defines globals such as run().

(() => {
  let lines = [];
  let cmdPtr = 0;
  const SGF = "/match.sgf";

  self.Module = {
    locateFile: (path) => `../engine/${path}`,
    print: (s) => lines.push(s),
    printErr: (s) => lines.push(s),
    preRun: [() => FS.init(() => null)],
    onRuntimeInitialized() {
      Module._start();
      self.postMessage({ type: "ready" });
    },
  };

  function writeCString(str) {
    if (!cmdPtr) cmdPtr = Module._malloc(2048);
    const bytes = new TextEncoder().encode(str);
    Module.HEAPU8.set(bytes.subarray(0, 2047), cmdPtr);
    Module.HEAPU8[cmdPtr + Math.min(bytes.length, 2047)] = 0;
  }

  function runCommand(command) {
    lines = [];
    writeCString(command);
    Module._run_command(cmdPtr);
    Module._doNextTurn();
    return lines.join("\n");
  }

  self.onmessage = ({ data }) => {
    const { id, type } = data;
    try {
      if (type === "run") {
        self.postMessage({ id, result: data.cmds.map(runCommand) });
      } else if (type === "save") {
        runCommand(`save match ${SGF}`);
        self.postMessage({ id, result: FS.readFile(SGF, { encoding: "utf8" }) });
      } else if (type === "load") {
        FS.writeFile(SGF, data.sgf);
        self.postMessage({ id, result: runCommand(`load match ${SGF}`) });
      }
    } catch (err) {
      self.postMessage({ id, error: String(err) });
    }
  };
})();

importScripts("../engine/gnubg.js");
