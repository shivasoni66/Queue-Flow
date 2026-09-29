/**
 * Service worker cleanup — QueueFlow Customer Web
 *
 * Customer Web is a server-rendered-once React SPA that requires NO offline
 * support. Its offline affordances (OfflineBanner, cached token envelopes,
 * ConnectionIndicator) are implemented entirely in app code via
 * `navigator.onLine` + localStorage. The QR camera uses
 * `navigator.mediaDevices.getUserMedia`, which depends only on a secure
 * (HTTPS) context, not on a service worker.
 *
 * A previous build shipped a hand-rolled `public/sw.js` app-shell cache. It
 * proved fragile: its navigation handler could call `respondWith(undefined)`,
 * which makes the browser report
 *
 *   "The FetchEvent for <url> resulted in a network error response"
 *   "sw.js: TypeError: Failed to fetch"
 *
 * taking down `/login` and every other SPA route. The worker has been deleted.
 *
 * Browsers keep an installed worker (and its Cache Storage buckets) alive
 * until it is explicitly unregistered, so simply deleting the file is not
 * enough to un-stick users who already have the broken worker. This module is
 * the one-shot migration that actively evicts it on the first load of the new
 * build. It is deliberately dependency-free and never throws: on a browser
 * without service worker support it is a no-op.
 *
 * No hostname is referenced anywhere here, so the same build works on both
 * https://customer.shivasoni.me and https://queueflow-customer.pages.dev.
 */

/**
 * Guards the optional self-reload so a client can only ever be reloaded once
 * per tab session, preventing any chance of a reload loop.
 */
const RELOAD_GUARD_KEY = 'queueflow_sw_cleanup_reloaded';

function supportsServiceWorker() {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
}

/**
 * Delete every Cache Storage bucket and unregister every service worker bound
 * to this origin and scope.
 *
 * Caches are removed by enumeration rather than by name so that stale buckets
 * from older, renamed or forked builds (`queueflow-customer-shell-v1` and
 * friends) are all cleared, not just the one we happen to know about.
 *
 * @returns {Promise<{unregistered: number, cachesDeleted: number, wasControlled: boolean}>}
 */
export async function purgeStaleServiceWorkers() {
  const wasControlled =
    supportsServiceWorker() && Boolean(navigator.serviceWorker.controller);

  if (!supportsServiceWorker()) {
    return { unregistered: 0, cachesDeleted: 0, wasControlled: false };
  }

  // 1. Evict the retired app-shell cache. Guarded because Cache Storage is
  //    absent in some privacy modes and would otherwise throw.
  let cachesDeleted = 0;
  if (typeof caches !== 'undefined') {
    try {
      const names = await caches.keys();
      const results = await Promise.all(
        names.map((name) => caches.delete(name).catch(() => false))
      );
      cachesDeleted = results.filter(Boolean).length;
    } catch {
      /* Cache Storage unavailable — nothing to clean. */
    }
  }

  // 2. Unregister the worker. getRegistrations() covers every registration
  //    for this scope, including ones registered before the deletion.
  let unregistered = 0;
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    const results = await Promise.all(
      registrations.map((registration) =>
        registration.unregister().catch(() => false)
      )
    );
    unregistered = results.filter(Boolean).length;
  } catch {
    /* Unregistration unsupported — the next navigation recovers. */
  }

  return { unregistered, cachesDeleted, wasControlled };
}

/**
 * Run the purge on page load, after the window `load` event so it never
 * competes with the app's own first paint for bandwidth.
 *
 * If the retired worker was actively controlling this page, unregistering it
 * does not detach it until the next navigation. We therefore reload exactly
 * once to hand the user a genuinely uncontrolled document, guarded by
 * sessionStorage so no loop is possible.
 */
export function startServiceWorkerCleanup() {
  if (!supportsServiceWorker()) {
    return;
  }

  const run = () => {
    purgeStaleServiceWorkers().then(
      ({ wasControlled, unregistered }) => {
        // Only reload when a stale worker really was in control, so ordinary
        // visits to the site never pay for a reload.
        if (!wasControlled || unregistered === 0) {
          return;
        }
        try {
          if (window.sessionStorage.getItem(RELOAD_GUARD_KEY)) {
            return;
          }
          window.sessionStorage.setItem(RELOAD_GUARD_KEY, '1');
        } catch {
          return; // Storage blocked: skip the reload rather than risk a loop.
        }
        window.location.reload();
      },
      () => {
        /* Never let cleanup break the app. */
      }
    );
  };

  if (document.readyState === 'complete') {
    run();
  } else {
    window.addEventListener('load', run, { once: true });
  }
}
