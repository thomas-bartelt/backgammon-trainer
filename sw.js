// Service worker: makes the trainer work offline.
// App code is network-first (always fresh when online, cached copy when offline);
// the engine, fonts and icons never change between releases, so they are cache-first.
const VERSION = "gammon-v3-2";

const PRECACHE = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/styles.css",
  "js/app.js", "js/badges.js", "js/board.js", "js/daily.js", "js/engine-worker.js", "js/engine.js",
  "js/explain.js", "js/game.js", "js/gamify.js", "js/moveinput.js", "js/play.js", "js/progress.js",
  "js/rng.js", "js/session.js", "js/store.js", "js/themes.js", "js/trainer.js", "js/ui.js",
  "js/screens/daily.js", "js/screens/drill.js", "js/screens/home.js", "js/screens/learn.js", "js/screens/play.js",
  "js/screens/profile.js", "js/screens/train.js",
  "data/curriculum.json", "data/bank.json",
  "engine/gnubg.js", "engine/gnubg.wasm", "engine/gnubg.data",
  "vendor/fonts/fonts.css", "vendor/fonts/bricolage-grotesque.woff2", "vendor/fonts/jetbrains-mono.woff2",
  "vendor/phosphor/regular.css", "vendor/phosphor/fill.css",
  "vendor/phosphor/Phosphor.woff2", "vendor/phosphor/Phosphor-Fill.woff2",
  "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png",
];

const IMMUTABLE = /\/(engine|vendor|icons)\//;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.includes("/tools/")) return;
  event.respondWith(IMMUTABLE.test(url.pathname) ? cacheFirst(req) : networkFirst(req));
});

async function cacheFirst(req) {
  const hit = await caches.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) (await caches.open(VERSION)).put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  try {
    const res = await fetch(req, { cache: "no-cache" });
    if (res.ok) (await caches.open(VERSION)).put(req, res.clone());
    return res;
  } catch {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === "navigate") return caches.match("index.html");
    throw new Error("offline and not cached");
  }
}
