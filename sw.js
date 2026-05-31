// AIM service worker.
//
// Purpose: make the site a *real* installable PWA. Samsung Internet (and some other
// Android browsers) only create an installed app from "Add to Home Screen" when a
// service worker with a fetch handler controls the start_url scope — otherwise they
// fall back to a plain bookmark shortcut. It also caches the app shell so the
// installed app launches reliably (and offline) instead of showing a blank screen.
//
// Must be served from the site ROOT (/sw.js) so its default scope is "/". The deploy
// copies this file to the bundle root (see /deploy-release); the dx asset pipeline
// only emits under /assets/, which would scope the worker too narrowly.

const CACHE = "aim-cache-v3";

self.addEventListener("install", () => {
  // Activate this worker as soon as it finishes installing.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Drop caches from previous versions, then take control of open pages.
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Page navigations (incl. every SPA route): network-first so a fresh deploy lands
  // immediately, falling back to the cached app shell ("/") when offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("/", copy));
          return res;
        })
        .catch(() =>
          caches.match("/").then((cached) => cached || caches.match(req))
        )
    );
    return;
  }

  // The app stylesheet lives at a stable, *mutable* path (not content-hashed), so
  // cache-first would pin stale styles after a deploy. Use network-first with a cache
  // fallback for offline, mirroring the navigation strategy above.
  if (url.pathname === "/assets/main.css") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Other static assets are content-hashed (immutable), so cache-first is safe and
  // fast; unknown ones fall through to the network and are cached on first use.
  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
    )
  );
});
