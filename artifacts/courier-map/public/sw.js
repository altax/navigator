// Service Worker — Карта курьера СПб
// Стратегии кеширования:
//   /api/tiles/spb-lo/* — cache-first, LRU лимит 2000 тайлов
//   /api/tiles/font/*   — cache-first, бессрочно (контент не меняется)

const CACHE_VER = "v1";
const TILE_CACHE = `courier-tiles-${CACHE_VER}`;
const FONT_CACHE = `courier-fonts-${CACHE_VER}`;
const MAX_TILES = 2000;

// Центральные тайлы СПб для прогрева при первой установке
const WARMUP_TILES = [
  [14, 9571, 4762], [14, 9572, 4762], [14, 9573, 4762],
  [14, 9571, 4763], [14, 9572, 4763], [14, 9573, 4763],
  [14, 9571, 4764], [14, 9572, 4764], [14, 9573, 4764],
  [13, 4785, 2381], [13, 4786, 2381], [13, 4787, 2381],
  [13, 4785, 2382], [13, 4786, 2382], [13, 4787, 2382],
].map(([z, x, y]) => `/api/tiles/spb-lo/${z}/${x}/${y}`);

// Шрифты для прогрева — ASCII + Latin + Кириллица
const WARMUP_FONTS = ["Noto Sans Regular", "Noto Sans Bold"].flatMap((f) =>
  ["0-255", "1024-1279", "256-511"].map(
    (r) => `/api/tiles/font/${encodeURIComponent(f)}/${r}.pbf`
  )
);

// ─── Install ───────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  // Активируем новый SW немедленно, без ожидания закрытия старых вкладок
  self.skipWaiting();

  event.waitUntil(
    Promise.all([
      caches
        .open(TILE_CACHE)
        .then((cache) =>
          Promise.allSettled(
            WARMUP_TILES.map((url) =>
              fetch(url)
                .then((r) => {
                  if (r.ok) cache.put(url, r);
                })
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
                .then((r) => {
                  if (r.ok) cache.put(url, r);
                })
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
    // Удаляем самые старые записи (первые в порядке вставки)
    const toDelete = keys.slice(0, keys.length - MAX_TILES);
    await Promise.all(toDelete.map((k) => cache.delete(k)));
  }
}

// ─── Fetch ─────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Только GET-запросы
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
            // Сохраняем клон, чтобы не исчерпать тело ответа
            cache.put(request, response.clone());
            // Фоновая очистка старых тайлов
            evictOldTiles().catch(() => {});
          }
          return response;
        } catch {
          // Оффлайн и тайл не закеширован — возвращаем пустой 204
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
          if (response.ok) {
            cache.put(request, response.clone());
          }
          return response;
        } catch {
          return new Response(null, { status: 503 });
        }
      })
    );
    return;
  }
});
