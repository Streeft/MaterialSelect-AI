/*
 * MaterialSelect AI service worker (D-142, D-152, D-199).
 *
 * It does exactly one thing: when a page navigation fails because the device is
 * offline (navigator.onLine === false), it answers with /offline.html. A failure
 * while the device reports itself online (server down, DNS, blocked host) is
 * passed on as a network error so the browser shows the real reason (D-199). It
 * never caches the catalogue, a study, a result or any API response, and it
 * never answers any request other than a navigation. The sheets /offline.html can show are not in this cache:
 * the app writes the ones the reader opened, as text with their read date, into
 * localStorage (apps/web/lib/offlineSheets.ts), and the page only prints them.
 * Bump CACHE when /offline.html changes.
 */
const CACHE = "msai-offline-v3";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  // A failed precache must not fail the install: the worker still activates and
  // a later offline navigation simply gets the browser's own error (D-199).
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(OFFLINE_URL))
      .catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(() => {
      if (self.navigator.onLine !== false) return Response.error();
      return caches
        .open(CACHE)
        .then((cache) => cache.match(OFFLINE_URL))
        .then((page) => page || Response.error())
        .catch(() => Response.error());
    }),
  );
});
