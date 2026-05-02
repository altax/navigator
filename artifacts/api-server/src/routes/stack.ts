import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { checkMartin, checkGraphHopper, checkPelias, MARTIN_URL } from "../lib/services";

const router: IRouter = Router();

// Кеш результата с TTL 10 секунд.
// Первый запрос делает реальные проверки; все последующие в течение 10s
// получают кешированный ответ мгновенно. Фоновое обновление происходит параллельно.
type CachedStatus = {
  data: Record<string, unknown>;
  expiresAt: number;
  refreshing: boolean;
};
let cache: CachedStatus | null = null;

async function fetchStatus(): Promise<Record<string, unknown>> {
  const [martin, graphhopper, pelias] = await Promise.all([
    checkMartin(),
    checkGraphHopper(),
    checkPelias(),
  ]);
  let postgisUp = false;
  let postgisDetail: string | null = null;
  try {
    const r = await pool.query<{ v: string }>("SELECT PostGIS_Version() AS v");
    postgisUp = true;
    postgisDetail = `PostGIS ${r.rows[0]?.v ?? ""}`;
  } catch (e) {
    postgisDetail = (e as Error).message;
  }
  return {
    martin: { up: martin.up, label: "Martin tile server", detail: martin.detail },
    graphhopper: { up: graphhopper.up, label: "GraphHopper e-bike", detail: graphhopper.detail },
    pelias: { up: pelias.up, label: "Pelias geocoder", detail: pelias.detail },
    postgis: { up: postgisUp, label: "PostGIS + h3", detail: postgisDetail },
    basemap: martin.up
      ? { source: "pmtiles_martin", url: "/api/tiles/spb-lo" }
      : { source: "raster_osm_fallback", url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png" },
  };
}

// Прогреть кеш сразу при старте сервера — первый клиент получит кешированный ответ
fetchStatus()
  .then((data) => {
    cache = { data, expiresAt: Date.now() + 10_000, refreshing: false };
  })
  .catch(() => {});

router.get("/stack/status", async (_req, res) => {
  const now = Date.now();

  if (cache && now < cache.expiresAt) {
    // Кеш свежий — отвечаем мгновенно
    res.json(cache.data);
    return;
  }

  if (cache && !cache.refreshing) {
    // Кеш устарел, но есть данные — отдаём их сразу, обновляем в фоне
    cache.refreshing = true;
    fetchStatus()
      .then((data) => {
        cache = { data, expiresAt: now + 10_000, refreshing: false };
      })
      .catch(() => {
        if (cache) cache.refreshing = false;
      });
    res.json(cache.data);
    return;
  }

  if (cache && cache.refreshing) {
    // Уже обновляется — отдаём старый кеш
    res.json(cache.data);
    return;
  }

  // Первый запрос — кеша нет, ждём
  try {
    const data = await fetchStatus();
    cache = { data, expiresAt: now + 10_000, refreshing: false };
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: "stack_check_failed" });
  }
});

export default router;
