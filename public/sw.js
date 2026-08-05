/*
 * DeHub service worker — offline app shell + immutable asset/media cache.
 * =====================================================================
 * Hand-written (no Workbox) to keep the build dependency-free.
 *
 * Strategy summary:
 *   1. Navigations (HTML)      → NetworkFirst. Online users ALWAYS get a fresh
 *                                index.html (correct hashed-chunk refs); the
 *                                cached shell is served only when the network
 *                                fails/stalls. This is the guard against the
 *                                classic "stale shell references dead chunk" bug.
 *   2. /assets/* build chunks  → CacheFirst. Filenames are content-hashed and
 *                                served `immutable`, so cached === correct. This
 *                                is what makes the ~1.5MB wallet chunk + app JS
 *                                instant on repeat/slow visits instead of a slow
 *                                HTTP revalidation.
 *   3. Immutable CDN media     → CacheFirst with an entry cap. images / avatars /
 *      (NOT videos)             covers / feed-images only. Videos are excluded —
 *                                they're ~50MB progressive MP4s and would blow the
 *                                cache quota; the browser HTTP range cache handles
 *                                those.
 *   4. Everything else         → pass through (auth'd /api/feed JSON, RPCs, etc.).
 *
 * Bump VERSION to invalidate every cache on the next activate.
 */

// v3 flushes asset entries poisoned by the bug fixed below: a chunk from a
// superseded deploy was answered by the SPA catch-all with index.html at 200,
// and CacheFirst stored that HTML under the chunk's URL permanently.
const VERSION = 'dehub-sw-v3';
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const MEDIA_CACHE = `${VERSION}-media`;
const CONTENT_CACHE = `${VERSION}-content`;
const MEDIA_MAX_ENTRIES = 250;
const CONTENT_MAX_ENTRIES = 60;

const CDN_HOST = 'dehubcdn.ams3.cdn.digitaloceanspaces.com';
// Immutable image folders only. `videos/` is deliberately absent.
const MEDIA_PATH_RE = /\/(images|feed-images|avatars|covers|nfts)\//;

self.addEventListener('install', (event) => {
  // Activate immediately so the cache is available on this visit, not the next.
  self.skipWaiting();
  event.waitUntil(
    caches.open(SHELL_CACHE).then((c) => c.add('/').catch(() => {}))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// FIFO eviction to keep the media cache bounded (oldest inserted go first).
async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  const overflow = keys.length - max;
  for (let i = 0; i < overflow; i++) {
    await cache.delete(keys[i]);
  }
}

/**
 * `isCacheable` is an extra guard applied on top of the status check, for
 * responses that are "successful" but still wrong to store. See the /assets/
 * branch: a 200 is not proof the thing we asked for exists.
 */
async function cacheFirst(req, cacheName, maxEntries, isCacheable) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    // Cache both CORS-ok and opaque (no-cors <img>) responses. Opaque is fine to
    // store & replay for image/poster paints.
    if (res && (res.ok || res.type === 'opaque') && (!isCacheable || isCacheable(res))) {
      cache.put(req, res.clone());
      if (maxEntries) trimCache(cacheName, maxEntries);
    }
    return res;
  } catch (err) {
    return hit || Response.error();
  }
}

/**
 * Nothing under /assets/ is ever an HTML document — it holds content-hashed JS,
 * CSS, fonts and images. An HTML body there means the request missed and the
 * SPA catch-all answered in its place, which the origin serves as 200 with
 * `immutable, max-age=31536000`. Storing that is how a single stale-deploy miss
 * became permanent: CacheFirst never revalidates, so if a later build re-emits
 * the same content hash (a revert does exactly that) the shell would be served
 * for a chunk that exists, and no amount of refreshing would fix it.
 */
function isRealAsset(res) {
  return !(res.headers.get('Content-Type') || '').toLowerCase().startsWith('text/html');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }

  // 1. Navigations → NetworkFirst (keep the shell fresh online).
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put('/', copy)).catch(() => {});
          return res;
        })
        .catch(() =>
          caches.match('/', { cacheName: SHELL_CACHE }).then((r) => r || fetch('/'))
        )
    );
    return;
  }

  // 2. Hashed build assets → CacheFirst, never storing an SPA-fallback shell.
  if (url.origin === self.location.origin && url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(req, ASSET_CACHE, 0, isRealAsset));
    return;
  }

  // 3. Immutable CDN images (never videos) → CacheFirst, capped.
  if (url.hostname === CDN_HOST && MEDIA_PATH_RE.test(url.pathname)) {
    event.respondWith(cacheFirst(req, MEDIA_CACHE, MEDIA_MAX_ENTRIES));
    return;
  }

  // 4. Blog article bodies (/blog-content/<slug>.json) → StaleWhileRevalidate.
  //    Fetched on demand by the SPA since the bodies left the JS bundle;
  //    articles change only on deploys, so serve cached instantly and refresh
  //    in the background.
  if (url.origin === self.location.origin && url.pathname.startsWith('/blog-content/')) {
    event.respondWith(
      caches.open(CONTENT_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        const network = fetch(req)
          .then((res) => {
            if (res && res.ok) {
              cache.put(req, res.clone());
              trimCache(CONTENT_CACHE, CONTENT_MAX_ENTRIES);
            }
            return res;
          })
          .catch(() => null);
        return hit || network.then((res) => res || Response.error());
      })
    );
    return;
  }

  // 5. Everything else falls through to the network untouched.
});

// Allow the page to trigger an immediate activation after an update.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
