/*
 * MaterialSelect AI service worker (D-142, D-152).
 *
 * It does exactly one thing: when a page navigation fails because the device is
 * offline, it answers with /offline.html. It never caches the catalogue, a
 * study, a result or any API response, and it never answers any request other
 * than a navigation. The sheets /offline.html can show are not in this cache:
 * the app writes the ones the reader opened, as text with their read date, into
 * localStorage (apps/web/lib/offlineSheets.ts), and the page only prints them.
 * Bump CACHE when /offline.html changes.
 */
const CACHE = "msai-offline-v2";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(OFFLINE_URL)));
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
    fetch(event.request).catch(() =>
      caches.open(CACHE).then((cache) => cache.match(OFFLINE_URL)).then((page) => page || Response.error()),
    ),
  );
});
