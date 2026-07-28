/* ShopBill service worker
   Strategy: NETWORK-FIRST for the app's own files.
   - When online, always fetch the latest code (no more "clear cache to update").
   - When offline, fall back to the last cached copy so the app still works.
   Cross-origin requests (Supabase, CDN) are left untouched. */
const CACHE = "shopbill-v9";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon.svg",
  "./css/styles.css",
  "./js/config.js",
  "./js/utils.js",
  "./js/db.js",
  "./js/auth.js",
  "./js/inventory.js",
  "./js/billing.js",
  "./js/reports.js",
  "./js/app.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (e) => {
  if (e.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Only manage our own origin's files. Let Supabase / CDN go straight to network.
  if (url.origin !== self.location.origin) return;

  // Network-first: always try the network, cache the fresh copy, fall back offline.
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() =>
        caches.match(req).then((cached) => cached || caches.match("./index.html"))
      )
  );
});
