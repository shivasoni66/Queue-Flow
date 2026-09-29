// QueueFlow Customer Web — service worker CLEANUP (self-destructing)
//
// ─────────────────────────────────────────────────────────────────────────────
// THIS IS NOT AN APPLICATION CACHE. IT SERVES NOTHING AND INTERCEPTS NOTHING.
//
// Customer Web previously shipped a hand-rolled app-shell service worker. It
// proved fragile: its navigation handler could call respondWith(undefined),
// which makes the browser report
//
//   "The FetchEvent for <url> resulted in a network error response"
//   "sw.js: TypeError: Failed to fetch"
//
// breaking /login and every other SPA route. The app-shell worker is gone.
//
// This file exists for exactly one reason: to EVICT that legacy worker from
// browsers that already installed it.
//
// Why a file at all, instead of just deleting it? Cloudflare Pages (like Vite's
// preview server) falls back to index.html for unmatched paths, so a missing
// /sw.js is answered with 200 text/html rather than 404. The service worker
// update algorithm requires a 200 response with a JavaScript MIME type, so a
// deleted sw.js would make the browser ABORT the update — leaving the broken
// worker installed and controlling. Shipping a real .js file lets the update
// actually land.
//
// Because this file replaces the old worker's script, the browser's normal
// update check (run on navigation) installs it, which retires the broken
// worker. Fresh visitors never register a worker at all — src/main.jsx does not
// call serviceWorker.register.
//
// Safety properties:
//   * There is deliberately NO 'fetch' listener. Without one the worker can
//     never call respondWith(), so every request — SPA navigations, API calls,
//     Socket.IO, fonts — passes straight through to the network untouched.
//   * No hostname is referenced anywhere, so the same build works unchanged on
//     the custom domain and on the deployment hostname.
//   * Caches are deleted by enumeration, clearing the retired
//     'queueflow-customer-shell-v1' bucket along with any renamed variants.
//
// Once this worker runs, the registration is gone and /sw.js is never
// requested again.
// ─────────────────────────────────────────────────────────────────────────────

self.addEventListener('install', () => {
  // Take over immediately so the broken worker stops controlling this client.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // 1. Delete every Cache Storage bucket, including the retired app shell.
      try {
        if (typeof caches !== 'undefined') {
          const names = await caches.keys();
          await Promise.all(names.map((name) => caches.delete(name)));
        }
      } catch (err) {
        // Cache Storage may be unavailable (private mode); never block on it.
      }

      // 2. Unregister this worker, ending the registration for this scope.
      try {
        await self.registration.unregister();
      } catch (err) {
        // Nothing else to do — the worker is inert regardless.
      }

      // NOTE: clients.claim() is intentionally NOT called. This worker must not
      // take control of any page; the goal is for no worker to be in control.
    })()
  );
});
