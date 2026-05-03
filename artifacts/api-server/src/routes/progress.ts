import { Router, type IRouter } from "express";
import { statSync } from "node:fs";
import { join } from "node:path";
import { WORKSPACE } from "../lib/workspace";

const DATA = join(WORKSPACE, "data");

function sz(rel: string): number {
  try { return statSync(join(DATA, rel)).size; } catch { return 0; }
}

function isValid(rel: string, minBytes: number): boolean {
  return sz(rel) >= minBytes;
}

function pct(current: number, expected: number): number {
  return Math.min(99, Math.round((current / expected) * 100));
}

function mb(bytes: number): string {
  if (bytes === 0) return "—";
  if (bytes < 1_048_576) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / 1_048_576).toFixed(0)} МБ`;
}

// Silence unused import warning — isValid is available for future step guards.
void isValid;

const router: IRouter = Router();

router.get("/stack/progress", (_req, res) => {
  const osmSize     = sz("spb-lo-filtered.osm.pbf");
  const geojsonSize = sz("spb-lo-filtered.geojsonseq");
  const pmtilesSize = sz("spb-lo.pmtiles");
  const ghJarSize   = sz("graphhopper-web-10.0.jar");
  const ghEdgesSize = sz("graphhopper/spb-lo-ebike-gh/edges");
  const fontRegSize = sz("fonts/NotoSans-Regular.ttf");
  const fontBoldSize = sz("fonts/NotoSans-Bold.ttf");

  const osmDone     = osmSize     >= 10_000_000;
  const geojsonDone = geojsonSize >= 1_000_000;
  const pmtilesDone = pmtilesSize >= 65_536;
  const ghJarDone   = ghJarSize   >= 10_000_000;
  const ghGraphDone = ghEdgesSize >= 1_000_000;
  const fontsDone   = fontRegSize >= 10_000 && fontBoldSize >= 10_000;

  const steps = [
    {
      id: "osm",
      label: "OSM данные (СПб+ЛО)",
      done: osmDone,
      pct: osmDone ? 100 : osmSize > 0 ? pct(osmSize, 220_000_000) : 0,
      detail: osmDone
        ? mb(osmSize)
        : osmSize > 0
          ? `${mb(osmSize)} / ~207 МБ`
          : "скачивание с Geofabrik…",
      active: !osmDone,
    },
    {
      id: "geojson",
      label: "GeoJSON экспорт",
      done: geojsonDone,
      pct: geojsonDone ? 100 : osmDone && geojsonSize > 0 ? pct(geojsonSize, 1_900_000_000) : 0,
      detail: geojsonDone
        ? mb(geojsonSize)
        : osmDone
          ? geojsonSize > 0
            ? `${mb(geojsonSize)} / ~1.8 ГБ`
            : "генерация через osmium…"
          : "ожидание OSM",
      active: osmDone && !geojsonDone,
    },
    {
      id: "pmtiles",
      label: "PMTiles z5-z16 (полное покрытие)",
      done: pmtilesDone,
      pct: pmtilesDone ? 100 : geojsonDone && pmtilesSize > 0 ? pct(pmtilesSize, 300_000_000) : 0,
      detail: pmtilesDone
        ? mb(pmtilesSize)
        : geojsonDone
          ? pmtilesSize > 0
            ? `${mb(pmtilesSize)} / ~300 МБ`
            : "tippecanoe z16: ~15–25 мин…"
          : "ожидание GeoJSON",
      active: geojsonDone && !pmtilesDone,
    },
    {
      id: "gh_jar",
      label: "GraphHopper JAR",
      done: ghJarDone,
      pct: ghJarDone ? 100 : ghJarSize > 0 ? pct(ghJarSize, 48_000_000) : 0,
      detail: ghJarDone
        ? mb(ghJarSize)
        : ghJarSize > 0
          ? `${mb(ghJarSize)} / ~45 МБ`
          : "скачивание с GitHub…",
      active: !ghJarDone,
    },
    {
      id: "gh_graph",
      label: "Граф маршрутов (e-bike)",
      done: ghGraphDone,
      pct: ghGraphDone ? 100 : 0,
      detail: ghGraphDone
        ? "готов"
        : ghJarDone && osmDone
          ? "импорт в GraphHopper (~15 мин)…"
          : "ожидание JAR + OSM",
      active: ghJarDone && osmDone && !ghGraphDone,
    },
    {
      id: "fonts",
      label: "Шрифты карты",
      done: fontsDone,
      pct: fontsDone ? 100 : 0,
      detail: fontsDone ? "OK" : "скачивание…",
      active: !fontsDone,
    },
  ];

  const allDone = osmDone && geojsonDone && pmtilesDone && ghJarDone && ghGraphDone && fontsDone;

  res.json({ steps, allDone });
});

export default router;
