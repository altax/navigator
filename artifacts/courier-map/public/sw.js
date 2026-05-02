// Service Worker — Карта курьера СПб
// Стратегии кеширования:
//   /api/tiles/spb-lo/*   — cache-first + фоновая ревалидация (> 7 дней)
//   /api/tiles/pois_layer/* — cache-first + фоновая ревалидация (> 1 дня)
//   /api/tiles/font/*     — cache-first, бессрочно (шрифты не меняются)

const CACHE_VER = "v4";
const TILE_CACHE = `courier-tiles-${CACHE_VER}`;
const POI_CACHE  = `courier-pois-${CACHE_VER}`;
const FONT_CACHE = `courier-fonts-${CACHE_VER}`;
const MAX_TILES  = 6000;
const MAX_POI_TILES = 1000;

// Через сколько миллисекунд тайл считается устаревшим и требует фонового обновления
const TILE_STALE_MS     = 7 * 24 * 3600 * 1000; // 7 дней
const POI_TILE_STALE_MS = 1 * 24 * 3600 * 1000; // 1 день

// ── Тайлы для прогрева при установке SW ────────────────────────────────────
// Центр Питера: z12(2392,1196), z13(4784,2393), z14(9568,4786), z15(19136,9572)
// Прогреваем сетку вокруг центра — самые часто запрашиваемые тайлы
const WARMUP_TILES = [
  // z12 — весь город одним взглядом
  ...[
    [2390,1195],[2391,1195],[2392,1195],[2393,1195],
    [2390,1196],[2391,1196],[2392,1196],[2393,1196],
    [2390,1197],[2391,1197],[2392,1197],[2393,1197],
  ].map(([x,y]) => [12, x, y]),

  // z13 — обзорный уровень, весь центр СПб (5×5)
  ...[
    [4782,2391],[4783,2391],[4784,2391],[4785,2391],[4786,2391],
    [4782,2392],[4783,2392],[4784,2392],[4785,2392],[4786,2392],
    [4782,2393],[4783,2393],[4784,2393],[4785,2393],[4786,2393],
    [4782,2394],[4783,2394],[4784,2394],[4785,2394],[4786,2394],
    [4782,2395],[4783,2395],[4784,2395],[4785,2395],[4786,2395],
  ].map(([x,y]) => [13, x, y]),

  // z14 — навигационный уровень, здания и адреса (5×5)
  ...[
    [9564,4783],[9565,4783],[9566,4783],[9567,4783],[9568,4783],
    [9564,4784],[9565,4784],[9566,4784],[9567,4784],[9568,4784],
    [9564,4785],[9565,4785],[9566,4785],[9567,4785],[9568,4785],
    [9564,4786],[9565,4786],[9566,4786],[9567,4786],[9568,4786],
    [9564,4787],[9565,4787],[9566,4787],[9567,4787],[9568,4787],
  ].map(([x,y]) => [14, x, y]),

  // z15 — пешеходный уровень, подъезды и дворы (5×5)
  // Курьер работает на z15-z17, эти тайлы самые важные
  ...[
    [19128,9570],[19129,9570],[19130,9570],[19131,9570],[19132,9570],
    [19128,9571],[19129,9571],[19130,9571],[19131,9571],[19132,9571],
    [19128,9572],[19129,9572],[19130,9572],[19131,9572],[19132,9572],
    [19128,9573],[19129,9573],[19130,9573],[19131,9573],[19132,9573],
    [19128,9574],[19129,9574],[19130,9574],[19131,9574],[19132,9574],
  ].map(([x,y]) => [15, x, y]),
].map(([z, x, y]) => `/api/tiles/spb-lo/${z}/${x}/${y}`);

// Шрифты: ASCII + Latin + Кириллица (3 диапазона × 2 начертания)
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
      caches.open(TILE_CACHE).then((cache) =>
        Promise.allSettled(
          WARMUP_TILES.map((url) =>
            cache.match(url).then((hit) => {
              if (hit) return; // уже в кеше
              return fetch(url)
                .then((r) => { if (r.ok) cache.put(url, r); })
                .catch(() => {});
            })
          )
        )
      ),
      caches.open(FONT_CACHE).then((cache) =>
        Promise.allSettled(
          WARMUP_FONTS.map((url) =>
            cache.match(url).then((hit) => {
              if (hit) return;
              return fetch(url)
                .then((r) => { if (r.ok) cache.put(url, r); })
                .catch(() => {});
            })
          )
        )
      ),
    ])
  );
});

// ─── Activate ──────────────────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  const keepers = new Set([TILE_CACHE, POI_CACHE, FONT_CACHE]);
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) =>
              (k.startsWith("courier-tiles-") ||
               k.startsWith("courier-pois-") ||
               k.startsWith("courier-fonts-")) && !keepers.has(k)
            )
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ─── FIFO eviction (удаляем самые старые при превышении лимита) ─────────────
async function evict(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxEntries) {
    const toDelete = keys.slice(0, keys.length - maxEntries);
    await Promise.all(toDelete.map((k) => cache.delete(k)));
  }
}

// ─── Стратегия: cache-first + фоновая ревалидация устаревших ───────────────
async function cacheFirstWithRevalidate(cacheName, request, maxEntries, staleMs) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  if (cached) {
    // Проверяем возраст: если стале — обновляем в фоне
    const dateHeader = cached.headers.get("date");
    const age = dateHeader ? Date.now() - new Date(dateHeader).getTime() : 0;
    if (age > staleMs) {
      fetch(request)
        .then((r) => { if (r.ok) cache.put(request, r.clone()); })
        .catch(() => {});
    }
    return cached;
  }

  // Нет в кеше — загружаем и сохраняем
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
      evict(cacheName, maxEntries).catch(() => {});
    }
    return response;
  } catch {
    return new Response(null, { status: 204 });
  }
}

// ─── Fetch ─────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const path = url.pathname;

  // ── Векторные тайлы базовой карты: cache-first + ревалидация 7 дней ────
  if (path.startsWith("/api/tiles/spb-lo/")) {
    event.respondWith(
      cacheFirstWithRevalidate(TILE_CACHE, request, MAX_TILES, TILE_STALE_MS)
    );
    return;
  }

  // ── Тайлы POI слоя (PostGIS): cache-first + ревалидация 1 день ─────────
  if (path.startsWith("/api/tiles/pois_layer/")) {
    event.respondWith(
      cacheFirstWithRevalidate(POI_CACHE, request, MAX_POI_TILES, POI_TILE_STALE_MS)
    );
    return;
  }

  // ── Шрифты карты: cache-first, бессрочно (шрифты не меняются) ──────────
  if (path.startsWith("/api/tiles/font/")) {
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
