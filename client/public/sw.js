/* Self-destructing service worker (v2).
 *
 * The previous SW we shipped did stale-while-revalidate of Vite's dev
 * modules and trapped users on a blank loading screen. This replacement
 * unregisters itself on activate and clears every cache it can find.
 * No `fetch` handler — intercepting navigation adds overhead and triggers
 * browser warnings when the handler is a no-op.
 *
 * Browsers check /sw.js for updates on navigation, so installing this once
 * is enough to free a stuck client.
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
