import { Router, type IRouter } from "express";
import { Readable } from "stream";
import { MARTIN_URL } from "../lib/services";

const router: IRouter = Router();

// ── Время жизни кеша ────────────────────────────────────────────────────────
// Шрифты: никогда не меняются → 1 год, immutable
const FONT_TTL = 365 * 24 * 3600;
// Векторные тайлы PMTiles/PostGIS: меняются только при обновлении данных → 7 дней
// + stale-while-revalidate: 1 день (браузер/SW обновляет в фоне)
const TILE_TTL = 7 * 24 * 3600;
const TILE_SWR = 86400;
// JSON-метаданные (catalog, tilejson): пересчитываются редко → 5 минут
const META_TTL = 300;

router.get(/^\/tiles(?:\/(.*))?$/, async (req, res) => {
  let subPath = req.path.replace(/^\/tiles\/?/, "");

  const isFont = subPath.startsWith("font/") && subPath.endsWith(".pbf");
  if (isFont) {
    subPath = subPath.slice(0, -4); // Martin не ожидает .pbf в URL шрифтов
  }

  const isVectorTile =
    /^spb-lo\/\d+\/\d+\/\d+$/.test(subPath) ||
    /^pois_layer\/\d+\/\d+\/\d+$/.test(subPath);
  const isMeta =
    subPath === "" ||
    subPath === "catalog" ||
    subPath.endsWith(".json") ||
    subPath.endsWith("tilejson");

  const target = `${MARTIN_URL}/${subPath}`;

  // Пробрасываем conditional-request заголовки, чтобы Martin мог вернуть 304
  const upstreamHeaders: Record<string, string> = {
    accept: (req.headers.accept as string) ?? "*/*",
  };
  const ifNoneMatch = req.headers["if-none-match"];
  if (ifNoneMatch) upstreamHeaders["if-none-match"] = ifNoneMatch as string;
  const ifModSince = req.headers["if-modified-since"];
  if (ifModSince) upstreamHeaders["if-modified-since"] = ifModSince as string;

  try {
    const upstream = await fetch(target, { headers: upstreamHeaders });

    // ── Content-Type ───────────────────────────────────────────────────────
    const ct = upstream.headers.get("content-type") ?? "";
    if (ct) res.setHeader("content-type", ct);

    // ── Пробрасываем ETag из Martin ────────────────────────────────────────
    const etag = upstream.headers.get("etag");
    if (etag) res.setHeader("etag", etag);

    // NOTE: content-encoding НЕ пробрасываем.
    // Node.js fetch (undici) автоматически декомпрессирует gzip/br тело —
    // тело в upstream.body уже разжато. Если переслать заголовок gzip,
    // браузер попытается разжать уже разжатые байты → ERR_CONTENT_DECODING_FAILED.

    // ── 304 Not Modified — тело не нужно ──────────────────────────────────
    if (upstream.status === 304) {
      res.status(304).end();
      return;
    }

    res.status(upstream.status);

    // ── Cache-Control ──────────────────────────────────────────────────────
    if (upstream.ok) {
      if (isFont) {
        res.setHeader("cache-control", `public, max-age=${FONT_TTL}, immutable`);
      } else if (isVectorTile) {
        res.setHeader(
          "cache-control",
          `public, max-age=${TILE_TTL}, stale-while-revalidate=${TILE_SWR}`,
        );
      } else if (isMeta) {
        res.setHeader("cache-control", `public, max-age=${META_TTL}`);
      } else {
        res.setHeader("cache-control", "public, max-age=3600");
      }
    } else {
      res.setHeader("cache-control", "no-store");
    }

    // ── JSON: перезаписываем URL Martin → /api/tiles ───────────────────────
    if (ct.includes("application/json")) {
      const text = await upstream.text();
      const rewritten = text
        .replaceAll(MARTIN_URL, "/api/tiles")
        .replace(/https?:\/\/localhost:\d+/g, "/api/tiles")
        .replace(/https?:\/\/127\.0\.0\.1:\d+/g, "/api/tiles");
      res.send(rewritten);
      return;
    }

    // ── Бинарные данные: стримим без буферизации ───────────────────────────
    // Buffer.from(arrayBuffer()) копирует весь тайл в память перед отправкой —
    // это добавляет лишний TTFB. Pipe напрямую в response.
    if (upstream.body) {
      Readable.fromWeb(
        upstream.body as import("stream/web").ReadableStream,
      ).pipe(res);
    } else {
      res.end();
    }
  } catch (e) {
    req.log.error({ err: e, target }, "tile proxy failed");
    res.status(502).json({ error: "tile_upstream_unreachable" });
  }
});

export default router;
