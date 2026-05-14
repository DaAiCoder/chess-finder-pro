/* Self-destructing service worker.
 *
 * The previous SW we shipped did stale-while-revalidate of Vite's dev
 * modules and trapped users on a blank loading screen. This replacement
 * does nothing on `fetch` (so the network is always used), unregisters
 * itself on activate, and clears every cache it can find. Browsers
 * check /sw.js for updates on navigation, so installing this once is
 * enough to free a stuck client.
 *
 * A real PWA SW can come back later — but only when registered from a
 * production build, never from `npm run dev`.
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch {
        /* ignore */
      }
      try {
        await self.registration.unregister();
      } catch {
        /* ignore */
      }
      try {
        const clients = await self.clients.matchAll({ type: "window" });
        for (const client of clients) {
          // Force a reload so the page comes back without our intercept.
          client.navigate(client.url).catch(() => {
            /* ignore */
          });
        }
      } catch {
        /* ignore */
      }
    })(),
  );
});

self.addEventListener("fetch", () => {
  /* no-op: let the browser go to the network */
});
