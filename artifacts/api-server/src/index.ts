import app from "./app";
import { logger } from "./lib/logger";
import { MARTIN_URL } from "./lib/services";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Прогрев кеша Martin: Centre SPB z14 тайлы 3×3 и z13 тайлы вокруг.
// Martin хранит тайлы в LRU-кеше (128MB). Первый запрос от браузера к
// уже прогретым тайлам отвечает за 3–10ms вместо 300–600ms.
async function warmupTiles(): Promise<void> {
  // SPB centre: z14 x=9572 y=4763 ± 1; z13 x=4786 y=2381 ± 1
  const tiles14 = [
    [14, 9571, 4762], [14, 9572, 4762], [14, 9573, 4762],
    [14, 9571, 4763], [14, 9572, 4763], [14, 9573, 4763],
    [14, 9571, 4764], [14, 9572, 4764], [14, 9573, 4764],
  ];
  const tiles13 = [
    [13, 4785, 2381], [13, 4786, 2381], [13, 4787, 2381],
    [13, 4785, 2382], [13, 4786, 2382], [13, 4787, 2382],
  ];
  const all = [...tiles14, ...tiles13];
  let ok = 0;
  await Promise.allSettled(
    all.map(([z, x, y]) =>
      fetch(`${MARTIN_URL}/spb-lo/${z}/${x}/${y}`, { signal: AbortSignal.timeout(5000) })
        .then((r) => { if (r.ok) ok++; })
        .catch(() => {}),
    ),
  );
  logger.info({ warmed: ok, total: all.length }, "Tile warmup complete");
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Прогреваем тайлы в фоне — не блокируем старт сервера
  setTimeout(() => warmupTiles().catch(() => {}), 1000);
});
