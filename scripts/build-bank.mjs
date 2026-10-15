// Generates data/bank.json (lesson positions) by driving tools/bank.html in headless Chrome.
// Usage: node scripts/build-bank.mjs [--per-tier 24] [--minutes 8] [--seed 7]
// Needs the dev server running (python3 scripts/serve.py 5173) and Google Chrome installed.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const perTier = Number(arg("--per-tier", 24));
const minutes = Number(arg("--minutes", 8));
const seed = Number(arg("--seed", 7));
const base = arg("--url", "http://127.0.0.1:5173");
const chrome = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const port = 9400 + Math.floor(Math.random() * 400);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "bank-chrome-"));

const proc = spawn(chrome, ["--headless=new", `--remote-debugging-port=${port}`, "--remote-debugging-address=127.0.0.1", `--user-data-dir=${profile}`, "--no-first-run", "about:blank"], { stdio: "ignore" });
let cleaned = false;
const cleanup = () => {
  if (cleaned) return;
  cleaned = true;
  proc.kill();
  try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* temp dir, ignore */ }
};
process.on("exit", cleanup);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let tabs = null;
for (let i = 0; i < 40 && !tabs; i++) {
  try { tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch { await sleep(250); }
}
const ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.onmessage = ({ data }) => {
  const msg = JSON.parse(data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  if (msg.method === "Runtime.consoleAPICalled") console.log(msg.params.args.map((a) => a.value ?? a.description).join(" "));
};
await new Promise((r) => (ws.onopen = r));
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });

await send("Runtime.enable");
await send("Page.enable");
await send("Page.navigate", { url: `${base}/tools/bank.html` });
const evaluate = async (expression) => {
  const res = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (res.result.exceptionDetails) throw new Error(JSON.stringify(res.result.exceptionDetails.exception?.description));
  return res.result.result.value;
};
for (let i = 0; i < 80 && !(await evaluate("Boolean(window.engineReady)")); i++) await sleep(250);

console.log(`Building bank: ${perTier} per tier, up to ${minutes} min, seed ${seed}`);
const json = await evaluate(`(async () => {
  const { buildBank } = await import("../js/tools/bank-builder.js");
  const bank = await buildBank({ perTier: ${perTier}, seed: ${seed}, budgetMs: ${minutes * 60_000},
    onProgress: (p) => p.games % 5 === 0 && console.log("games", p.games, "t", p.seconds + "s", JSON.stringify(p.counts)) });
  return JSON.stringify(bank);
})()`);

const out = new URL("../data/bank.json", import.meta.url);
fs.writeFileSync(out, json);
const bank = JSON.parse(json);
console.log(`Wrote ${out.pathname} after ${bank.games} games`);
for (const [c, tiers] of Object.entries(bank.chapters)) console.log(c.padEnd(9), Object.values(tiers).map((l) => l.length).join(" / "));
ws.close();
cleanup();
process.exit(0);
