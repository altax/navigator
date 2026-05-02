// Service Worker — Карта курьера СПб
// Стратегии кеширования:
//   /api/tiles/spb-lo/* — cache-first, LRU лимит 5000 тайлов
//   /api/tiles/font/*   — cache-first, бессрочно (контент не меняется)

const CACHE_VER = "v3";
const TILE_CACHE = `courier-tiles-${CACHE_VER}`;
const FONT_CACHE = `courier-fonts-${CACHE_VER}`;
const MAX_TILES = 5000;

// Центр Питера z14: tile(9568, 4786), z13: tile(4784, 2393), z12: tile(2392, 1196)
// Прогреваем 5×5 тайлов в центре города на z13 и z14 — самые часто нужные
const WARMUP_TILES = [
  // z13 — обзорный уровень, весь центр СПб
  [13,4782,2391],[13,4783,2391],[13,4784,2391],[13,4785,2391],[13,4786,2391],
  [13,4782,2392],[13,4783,2392],[13,4784,2392],[13,4785,2392],[13,4786,2392],
  [13,4782,2393],[13,4783,2393],[13,4784,2393],[13,4785,2393],[13,4786,2393],
  [13,4782,2394],[13,4783,2394],[13,4784,2394],[13,4785,2394],[13,4786,2394],
  // z14 — навигационный уровень, здания и адреса
  [14,9564,4783],[14,9565,4783],[14,9566,4783],[14,9567,4783],[14,9568,4783],
  [14,9564,4784],[14,9565,4784],[14,9566,4784],[14,9567,4784],[14,9568,4784],
  [14,9564,4785],[14,9565,4785],[14,9566,4785],[14,9567,4785],[14,9568,4785],
  [14,9564,4786],[14,9565,4786],[14,9566,4786],[14,9567,4786],[14,9568,4786],
  [14,9564,4787],[14,9565,4787],[14,9566,4787],[14,9567,4787],[14,9568,4787],
].map(([z, x, y]) => `/api/tiles/spb-lo/${z}/${x}/${y}`);

// Шрифты для прогрева — ASCII + Latin + Кириллица
const WARMUP_FONTS = ["Noto Sans Regular", "Noto Sans Bold"].flatMap((f) =>
  ["0-255", "256-511", "1024-1279"].map(
    (r) => `/api/tiles/font/${encodeURIComponent(f)}/${r}.pbf`
  )
);

// ─── Install ───────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  self.skipWaiting();

  event.waitUntil(
    Promise.all([
      caches
        .open(TILE_CACHE)
        .then((cache) =>
          Promise.allSettled(
            WARMUP_TILES.map((url) =>
              fetch(url)
                .then((r) => { if (r.ok) cache.put(url, r); })
                .catch(() => {})
            )
          )
        ),
      caches
        .open(FONT_CACHE)
        .then((cache) =>
          Promise.allSettled(
            WARMUP_FONTS.map((url) =>
              fetch(url)
                .then((r) => { if (r.ok) cache.put(url, r); })
                .catch(() => {})
            )
          )
        ),
    ])
  );
});

// ─── Activate ──────────────────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (k) =>
                (k.startsWith("courier-tiles-") && k !== TILE_CACHE) ||
                (k.startsWith("courier-fonts-") && k !== FONT_CACHE)
            )
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ─── LRU-style eviction ────────────────────────────────────────────────────
async function evictOldTiles() {
  const cache = await caches.open(TILE_CACHE);
  const keys = await cache.keys();
  if (keys.length > MAX_TILES) {
    const toDelete = keys.slice(0, keys.length - MAX_TILES);
    await Promise.all(toDelete.map((k) => cache.delete(k)));
  }
}

// ─── Fetch ─────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;

  // ── Векторные тайлы: cache-first ──────────────────────────────────────
  if (url.pathname.startsWith("/api/tiles/spb-lo/")) {
    event.respondWith(
      caches.open(TILE_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;

        try {
          const response = await fetch(request);
          if (response.ok) {
            cache.put(request, response.clone());
            evictOldTiles().catch(() => {});
          }
          return response;
        } catch {
          return new Response(null, { status: 204 });
        }
      })
    );
    return;
  }

  // ── Шрифты карты: cache-first, бессрочно ──────────────────────────────
  if (url.pathname.startsWith("/api/tiles/font/")) {
    event.respondWith(
      caches.open(FONT_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;

        try {
          const response = await fetch(request);
          if (response.ok) cache.put(request, response.clone());
          return response;
        } catch {
          return new Response(null, { status: 503 });
        }
      })
    );
    return;
  }
});
