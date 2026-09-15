const CACHE_NAME = "chengyu-storybook-shell-v8";
const CACHE_PREFIX = "chengyu-storybook-";
const SCOPE_PREFIX = new URL("./", self.registration.scope).pathname.replace(/\/$/, "");
const STATIC_ROOTS = [
  "/manifest.webmanifest",
  "/favicon.svg",
  "/apple-touch-icon-180.png",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/og.svg",
  "/ui/bookshelf-paper.svg",
];
const STATIC_PATHS = STATIC_ROOTS.map((path) => `${SCOPE_PREFIX}${path}`);

function scopedPath(path) {
  return `${SCOPE_PREFIX}${path}`;
}

async function cacheShell() {
  const cache = await caches.open(CACHE_NAME);

  // Reuse the browser HTTP cache when possible. `no-store` here forced the
  // service-worker install path to redownload resources the first page had
  // often just fetched.
  const shell = await fetch(scopedPath("/") || "/");
  if (!shell.ok) throw new Error(`Unable to cache app shell: ${shell.status}`);

  const html = await shell.clone().text();
  await cache.put(scopedPath("/") || "/", shell.clone());
  await cache.put(scopedPath("/index.html"), shell.clone());

  const assetPaths = [...html.matchAll(/(?:src|href)=["']([^"']*\/assets\/[^"']+)["']/g)].map((match) => match[1]);
  const paths = [...new Set([...STATIC_PATHS, ...assetPaths])];

  await Promise.all(
    paths.map(async (path) => {
      const response = await fetch(path);
      if (!response.ok) throw new Error(`Unable to cache shell asset ${path}: ${response.status}`);
      await cache.put(path, response);
    }),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      ),
      self.clients.claim(),
    ]),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Narration can be large and browsers may use Range requests. Keep audio
  // network-only until an explicit offline-download product flow exists.
  if (request.headers.has("range") || url.pathname.startsWith(`${SCOPE_PREFIX}/audio/`)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(scopedPath("/index.html"), response.clone());
          }
          return response;
        } catch {
          const cachedShell = (await caches.match(scopedPath("/index.html"))) || (await caches.match(scopedPath("/") || "/"));
          return (
            cachedShell ||
            new Response("Offline shell unavailable", {
              status: 503,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            })
          );
        }
      })(),
    );
    return;
  }

  const cacheable =
    url.pathname.startsWith(`${SCOPE_PREFIX}/assets/`) ||
    url.pathname.startsWith(`${SCOPE_PREFIX}/stories/`) ||
    url.pathname.startsWith(`${SCOPE_PREFIX}/classic-stories/`) ||
    url.pathname.startsWith(`${SCOPE_PREFIX}/child-stories/`) ||
    url.pathname.startsWith(`${SCOPE_PREFIX}/fonts/`) ||
    url.pathname.startsWith(`${SCOPE_PREFIX}/ui/`) ||
    STATIC_PATHS.includes(url.pathname);

  if (!cacheable) return;

  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) return cached;

      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    })(),
  );
});
