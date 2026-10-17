/*
 * MaterialSelect AI service worker (D-142).
 *
 * It does exactly one thing: when a page navigation fails because the device is
 * offline, it answers with /offline.html. It never caches the catalogue, a
 * study, a result or any API response, and it never answers any request other
 * than a navigation: showing material data from a cache, without its source and
 * date, would break the rule that a property is never shown without them.
 * Bump CACHE when /offline.html changes.
 */
const CACHE = "msai-offline-v1";
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
