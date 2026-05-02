"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import maplibregl, { Map as MlMap, type MapLayerMouseEvent, type StyleSpecification } from "maplibre-gl";
import type { Poi, PoiType, StackStatus, GeocodeResult } from "./types";
import { BootstrapPanel } from "./BootstrapPanel";
import { POI_TYPE_META } from "./types";
import { api } from "./api";

const SPB_CENTER: [number, number] = [30.3351, 59.9343];

const POI_TYPES = Object.keys(POI_TYPE_META) as PoiType[];

// Dash sequence for animated "ant march" route line
const DASH_SEQUENCE = [
  [0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5],
  [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0],
  [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5],
  [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5],
];

// Draw a map-pin icon (circle top + teardrop point bottom) for each POI type.
// Rendered via canvas, registered with map.addImage().
function drawPoiPin(type: PoiType): { width: number; height: number; data: Uint8Array } {
  const W = 24, H = 32, PR = 2;
  const canvas = document.createElement("canvas");
  canvas.width = W * PR;
  canvas.height = H * PR;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { width: W * PR, height: H * PR, data: new Uint8Array(W * H * PR * PR * 4) };
  ctx.scale(PR, PR);

  const color = POI_TYPE_META[type].color;
  const cx = W / 2;
  const cy = 11;   // circle centre
  const r = 9.5;   // circle radius

  // Drop shadow
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 2;

  // Pin shape: 270° arc from lower-left → top → lower-right, then V to tip
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 0.25, false); // clockwise through top
  ctx.lineTo(cx, H - 1);   // tip at very bottom of canvas
  ctx.closePath();          // straight line back to arc start (lower-left)

  ctx.fillStyle = color;
  ctx.fill();

  // Remove shadow before stroke so it doesn't double-shadow
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.8;
  ctx.stroke();

  // White letter centred in the circle
  const letters: Record<PoiType, string> = {
    entrance: "П",
    gate: "К",
    passage: ">",
    note: "N",
    parking: "P",
    stairs: "S",
  };
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${Math.round(r * 0.85)}px -apple-system, system-ui, sans-serif`;
  ctx.fillText(letters[type], cx, cy);

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { width: imgData.width, height: imgData.height, data: new Uint8Array(imgData.data.buffer) };
}

// Draw a metro station icon: red circle with Cyrillic "М" (for Метро).
// Registered via map.addImage("metro-icon", ...) in the basemap useEffect.
function drawMetroIcon(): { width: number; height: number; data: Uint8Array } {
  const W = 28, H = 28, PR = 2;
  const canvas = document.createElement("canvas");
  canvas.width = W * PR;
  canvas.height = H * PR;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { width: W * PR, height: H * PR, data: new Uint8Array(W * H * PR * PR * 4) };
  ctx.scale(PR, PR);

  const cx = W / 2, cy = H / 2, r = 11;

  // Drop shadow
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 2;

  // Red circle fill
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "#cc2222";
  ctx.fill();

  ctx.shadowColor = "transparent";
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.stroke();

  // "М" letter centred
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${Math.round(r * 1.1)}px -apple-system, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("М", cx, cy + 0.5);

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { width: imgData.width, height: imgData.height, data: new Uint8Array(imgData.data.buffer) };
}

// Draw a small metro entrance icon: dark circle with tiny "М" — for individual entrances.
function drawMetroEntranceIcon(): { width: number; height: number; data: Uint8Array } {
  const W = 18, H = 18, PR = 2;
  const canvas = document.createElement("canvas");
  canvas.width = W * PR;
  canvas.height = H * PR;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { width: W * PR, height: H * PR, data: new Uint8Array(W * H * PR * PR * 4) };
  ctx.scale(PR, PR);

  const cx = W / 2, cy = H / 2, r = 7;

  ctx.shadowColor = "rgba(0,0,0,0.4)";
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 1;

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "#7a1010";
  ctx.fill();

  ctx.shadowColor = "transparent";
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${Math.round(r * 1.05)}px -apple-system, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("М", cx, cy + 0.5);

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { width: imgData.width, height: imgData.height, data: new Uint8Array(imgData.data.buffer) };
}

// Базовый URL тайлов — всегда /api/tiles/spb-lo.
// Martin почти всегда запущен, поэтому карта стартует с векторным стилем сразу,
// без промежуточного рестарта через raster-fallback.
const DEFAULT_TILE_URL = "/api/tiles/spb-lo";

function buildStyle(stack: StackStatus | null): StyleSpecification {
  // Оптимистично считаем Martin запущенным пока stack не вернулся.
  // Если Martin реально недоступен, тайлы вернут 502 и карта покажет пустой фон.
  // Это лучше, чем показывать raster → потом делать полный setStyle() заново.
  const isVector = stack === null || stack?.basemap.source === "pmtiles_martin";
  if (isVector) {
    const rawUrl = stack?.basemap.url ?? DEFAULT_TILE_URL;
    const tileBase = typeof window !== "undefined"
      ? `${window.location.origin}${rawUrl}`
      : rawUrl;
    return {
      version: 8 as const,
      glyphs: "/api/tiles/font/{fontstack}/{range}.pbf?v=2",
      sources: {
        basemap: {
          type: "vector" as const,
          tiles: [`${tileBase}/{z}/{x}/{y}`],
          minzoom: 5,
          maxzoom: 17,
        },
        "selected-building": {
          type: "geojson" as const,
          data: { type: "FeatureCollection", features: [] },
        },
      },
      layers: [
        { id: "background", type: "background" as const, paint: { "background-color": "#0e1116" } },
        // Landuse: parks/forests green, industrial dark, generic grey-blue
        {
          id: "landuse",
          type: "fill" as const,
          source: "basemap",
          "source-layer": "osm",
          filter: ["has", "landuse"],
          paint: {
            "fill-color": [
              "match", ["get", "landuse"],
              ["park", "forest", "recreation_ground", "grass", "meadow", "village_green", "allotments"], "#0d2218",
              ["industrial", "commercial", "retail", "construction"], "#15181f",
              ["residential", "farmyard"], "#12161e",
              "#1a2030",
            ],
            "fill-opacity": 0.75,
          },
        },
        // Парки — отдельная зелёная заливка поверх landuse
        {
          id: "parks-fill",
          type: "fill" as const,
          source: "basemap",
          "source-layer": "osm",
          filter: [
            "in", ["get", "landuse"],
            ["literal", ["park", "forest", "recreation_ground", "grass", "meadow", "village_green", "allotments"]],
          ],
          paint: { "fill-color": "#0d2318", "fill-opacity": 0.85 },
        },
        // Вода: Нева, Фонтанка, Мойка — важнейший ориентир Питера.
        // natural=water + waterway=riverbank
        {
          id: "water-fill",
          type: "fill" as const,
          source: "basemap",
          "source-layer": "osm",
          filter: [
            "any",
            ["==", ["get", "natural"], "water"],
            ["==", ["get", "landuse"], "reservoir"],
            ["==", ["get", "waterway"], "riverbank"],
            ["==", ["get", "water"], "river"],
          ],
          paint: { "fill-color": "#0a1f3a", "fill-opacity": 1 },
        },
        // Реки и каналы — линии водотоков
        {
          id: "waterway",
          type: "line" as const,
          source: "basemap",
          "source-layer": "osm",
          filter: ["in", ["get", "waterway"], ["literal", ["river", "canal", "stream"]]],
          layout: { "line-cap": "round" as const },
          paint: {
            "line-color": "#0a1f3a",
            "line-width": ["interpolate", ["linear"], ["zoom"], 8, 1.5, 12, 4, 16, 9],
          },
        },
        {
          id: "buildings",
          type: "fill" as const,
          source: "basemap",
          "source-layer": "osm",
          minzoom: 13,
          filter: ["has", "building"],
          paint: {
            // Цвет по этажности: низкие → тёмно-серые, высотки → почти лиловые
            // Это позволяет отличить «Пятёрочку» от 9-этажки на ходу
            "fill-color": [
              "interpolate",
              ["linear"],
              ["coalesce", ["to-number", ["get", "building:levels"]], 1],
              1, "#252a36",
              3, "#2f3548",
              6, "#3d4360",
              10, "#525984",
              16, "#6b6fa3",
              25, "#8a8bc4",
            ],
            "fill-outline-color": "#1a1f2c",
            "fill-opacity": ["interpolate", ["linear"], ["zoom"], 13, 0.7, 16, 1],
          },
        },
        // Тонкая обводка зданий — нужна на низком зуме (когда 3D ещё не включено)
        {
          id: "buildings-outline",
          type: "line" as const,
          source: "basemap",
          "source-layer": "osm",
          minzoom: 14,
          maxzoom: 16,
          filter: ["has", "building"],
          paint: {
            "line-color": "#0e1116",
            "line-width": ["interpolate", ["linear"], ["zoom"], 14, 0.4, 16, 1],
            "line-opacity": ["interpolate", ["linear"], ["zoom"], 14, 0.6, 15.5, 1, 16, 0],
          },
        },
        // 3D-объёмные здания. Высота = этажность × 3 м. Включаются с z15,
        // когда курьер уже в режиме навигации и хочет видеть силуэт района.
        {
          id: "buildings-3d",
          type: "fill-extrusion" as const,
          source: "basemap",
          "source-layer": "osm",
          minzoom: 15,
          filter: [
            "all",
            ["has", "building"],
            ["==", ["geometry-type"], "Polygon"],
          ],
          paint: {
            // Тот же градиент по этажам, что и у плоской заливки —
            // курьер привыкает к одной палитре, не путается
            "fill-extrusion-color": [
              "interpolate",
              ["linear"],
              ["coalesce", ["to-number", ["get", "building:levels"]], 1],
              1, "#2a2f3d",
              3, "#353b50",
              6, "#444b6c",
              10, "#5a6193",
              16, "#7478b5",
              25, "#9495cf",
            ],
            // 3 метра на этаж. min_height учитываем, если задан.
            "fill-extrusion-height": [
              "*",
              ["coalesce", ["to-number", ["get", "building:levels"]], 1],
              3,
            ],
            "fill-extrusion-base": [
              "coalesce",
              ["to-number", ["get", "min_height"]],
              0,
            ],
            "fill-extrusion-opacity": 0.92,
            // Плавное появление высоты при приближении — здания «вырастают»
            "fill-extrusion-vertical-gradient": true,
          },
        },
        // Пешеходные дорожки — курьеру нужно знать, куда можно пройти пешком
        // Контраст поднят: #4a6080 вместо #2a3245 — вдвое лучше читается на тёмном фоне
        {
          id: "footways",
          type: "line" as const,
          source: "basemap",
          "source-layer": "osm",
          minzoom: 15,
          filter: [
            "in", ["get", "highway"],
            ["literal", ["footway", "path", "pedestrian", "steps"]],
          ],
          paint: {
            "line-color": "#4a6080",
            "line-width": ["interpolate", ["linear"], ["zoom"], 15, 1.0, 18, 2.5],
            "line-dasharray": [3, 1.5],
          },
        },
        // Велодорожки: свечение — широкая полупрозрачная подложка создаёт glow-эффект
        {
          id: "cycleways-glow",
          type: "line" as const,
          source: "basemap",
          "source-layer": "osm",
          minzoom: 14,
          filter: [
            "any",
            ["==", ["get", "highway"], "cycleway"],
            ["==", ["get", "bicycle"], "designated"],
            ["==", ["get", "cycleway"], "lane"],
          ],
          layout: { "line-cap": "round" as const },
          paint: {
            "line-color": "#22c55e",
            "line-width": ["interpolate", ["linear"], ["zoom"], 14, 6, 16, 10, 18, 14],
            "line-opacity": 0.12,
            "line-blur": 3,
          },
        },
        // Велодорожки — lime-green #22c55e: курьер на e-bike видит их мгновенно
        {
          id: "cycleways",
          type: "line" as const,
          source: "basemap",
          "source-layer": "osm",
          minzoom: 13,
          filter: [
            "any",
            ["==", ["get", "highway"], "cycleway"],
            ["==", ["get", "bicycle"], "designated"],
            ["==", ["get", "cycleway"], "lane"],
          ],
          layout: { "line-cap": "round" as const },
          paint: {
            "line-color": "#22c55e",
            "line-width": ["interpolate", ["linear"], ["zoom"], 13, 1.2, 16, 3.5, 18, 5],
          },
        },
        // Обводка второстепенных дорог (casing) — рисуем чуть шире и темнее
        // чтобы дорога выглядела как настоящая полоса, а не просто линия
        {
          id: "roads-minor-casing",
          type: "line" as const,
          source: "basemap",
          "source-layer": "osm",
          filter: [
            "in", ["get", "highway"],
            ["literal", ["residential", "service", "unclassified", "tertiary", "tertiary_link", "living_street"]],
          ],
          layout: { "line-cap": "round" as const, "line-join": "round" as const },
          paint: {
            "line-color": "#0c0f16",
            "line-width": ["interpolate", ["linear"], ["zoom"], 11, 1.5, 15, 5, 17, 9],
          },
        },
        // Обводка главных дорог
        {
          id: "roads-major-casing",
          type: "line" as const,
          source: "basemap",
          "source-layer": "osm",
          filter: [
            "in", ["get", "highway"],
            ["literal", ["primary", "primary_link", "secondary", "secondary_link", "trunk", "trunk_link", "motorway", "motorway_link"]],
          ],
          layout: { "line-cap": "round" as const, "line-join": "round" as const },
          paint: {
            "line-color": "#080c12",
            "line-width": ["interpolate", ["linear"], ["zoom"], 9, 2, 13, 7, 16, 14],
          },
        },
        // Второстепенные дороги — разные оттенки по типу:
        // residential/tertiary: #4a5e7a (светлее, чётче читается)
        // service (дворовые проезды): #2e4060 (темнее — не магистраль, не улица)
        // living_street (жилая зона): #3a4a5c (тёплый акцент — медленное движение)
        {
          id: "roads-minor",
          type: "line" as const,
          source: "basemap",
          "source-layer": "osm",
          filter: [
            "in",
            ["get", "highway"],
            ["literal", ["residential", "service", "unclassified", "tertiary", "tertiary_link", "living_street"]],
          ],
          layout: { "line-cap": "round" as const, "line-join": "round" as const },
          paint: {
            "line-color": [
              "match", ["get", "highway"],
              ["service"], "#2e4060",
              ["living_street"], "#3a4a5c",
              "#4a5e7a",
            ],
            "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.8, 15, 3.5, 17, 7],
          },
        },
        // Главные дороги — ярче, толще, выделяются как магистрали
        {
          id: "roads-major",
          type: "line" as const,
          source: "basemap",
          "source-layer": "osm",
          filter: [
            "in",
            ["get", "highway"],
            ["literal", ["primary", "primary_link", "secondary", "secondary_link", "trunk", "trunk_link", "motorway", "motorway_link"]],
          ],
          layout: { "line-cap": "round" as const, "line-join": "round" as const },
          paint: {
            "line-color": [
              "match", ["get", "highway"],
              ["motorway", "motorway_link", "trunk", "trunk_link"], "#7090c0",
              "#6090c0",
            ],
            "line-width": ["interpolate", ["linear"], ["zoom"], 9, 1.2, 13, 5.5, 16, 13],
          },
        },
        // Мосты: сначала чёрная обводка, потом светлая заливка —
        // мост выглядит как реальное сооружение поверх воды
        {
          id: "bridges-casing",
          type: "line" as const,
          source: "basemap",
          "source-layer": "osm",
          minzoom: 12,
          filter: ["all", ["has", "highway"], ["==", ["get", "bridge"], "yes"]],
          layout: { "line-cap": "butt" as const },
          paint: {
            "line-color": "#050810",
            "line-width": ["interpolate", ["linear"], ["zoom"], 12, 4, 16, 13],
          },
        },
        {
          id: "bridges",
          type: "line" as const,
          source: "basemap",
          "source-layer": "osm",
          minzoom: 12,
          filter: ["all", ["has", "highway"], ["==", ["get", "bridge"], "yes"]],
          layout: { "line-cap": "butt" as const },
          paint: {
            "line-color": "#7a90b2",
            "line-width": ["interpolate", ["linear"], ["zoom"], 12, 2, 16, 10],
          },
        },
        // Сквозные арки и проходы через здания — фишка Питера
        // На z17+ переходим на сплошную линию — курьер точно видит арку
        {
          id: "passages",
          type: "line" as const,
          source: "basemap",
          "source-layer": "osm",
          minzoom: 14,
          filter: [
            "any",
            ["==", ["get", "tunnel"], "building_passage"],
            ["all", ["==", ["get", "highway"], "footway"], ["==", ["get", "tunnel"], "yes"]],
            ["==", ["get", "covered"], "arcade"],
          ],
          paint: {
            "line-color": "#ffd166",
            "line-width": ["interpolate", ["linear"], ["zoom"], 14, 2, 17, 4, 18, 6],
            "line-dasharray": [2.5, 1],
          },
        },
        // Подписи мостов
        {
          id: "bridge-labels",
          type: "symbol" as const,
          source: "basemap",
          "source-layer": "osm",
          minzoom: 13,
          filter: ["all", ["has", "name"], ["==", ["get", "bridge"], "yes"]],
          layout: {
            "symbol-placement": "line" as const,
            "text-field": ["coalesce", ["get", "name:ru"], ["get", "name"]] as never,
            "text-font": ["Noto Sans Bold"],
            "text-size": ["interpolate", ["linear"], ["zoom"], 13, 11, 17, 15],
            "text-letter-spacing": 0.04,
            "symbol-spacing": 400,
          },
          paint: {
            "text-color": "#e8edf3",
            "text-halo-color": "#0e1116",
            "text-halo-width": 2,
          },
        },
        // Подписи рек и каналов — Нева, Фонтанка, Мойка, Канал Грибоедова.
        // Синий цвет, вдоль водотока, крупно.
        {
          id: "water-labels",
          type: "symbol" as const,
          source: "basemap",
          "source-layer": "osm",
          minzoom: 10,
          filter: [
            "all",
            ["has", "name"],
            [
              "any",
              ["==", ["get", "natural"], "water"],
              ["in", ["get", "waterway"], ["literal", ["river", "canal", "stream"]]],
              ["==", ["get", "waterway"], "riverbank"],
            ],
          ],
          layout: {
            "symbol-placement": "line" as const,
            "text-field": ["coalesce", ["get", "name:ru"], ["get", "name"]] as never,
            "text-font": ["Noto Sans Regular"],
            "text-size": ["interpolate", ["linear"], ["zoom"], 10, 11, 14, 15, 17, 18],
            "text-letter-spacing": 0.05,
            "symbol-spacing": 350,
          },
          paint: {
            "text-color": "#3a7ab5",
            "text-halo-color": "#060b14",
            "text-halo-width": 2,
          },
        },
        // Названия крупных дорог — рано, ещё на обзорном масштабе
        {
          id: "road-labels-major",
          type: "symbol" as const,
          source: "basemap",
          "source-layer": "osm",
          minzoom: 12,
          filter: [
            "all",
            ["has", "name"],
            ["in", ["get", "highway"], ["literal", ["primary", "primary_link", "secondary", "secondary_link", "trunk", "trunk_link", "motorway", "motorway_link"]]],
          ],
          layout: {
            "symbol-placement": "line" as const,
            "text-field": ["coalesce", ["get", "name:ru"], ["get", "name"]] as never,
            "text-font": ["Noto Sans Bold"],
            "text-size": ["interpolate", ["linear"], ["zoom"], 12, 11, 17, 15],
            "text-letter-spacing": 0.05,
            "symbol-spacing": 280,
          },
          paint: {
            "text-color": "#e8edf3",
            "text-halo-color": "#0e1116",
            "text-halo-width": 2,
          },
        },
        // Названия второстепенных улиц — с z13: курьер уже видит квартал и хочет знать улицу
        {
          id: "road-labels-minor",
          type: "symbol" as const,
          source: "basemap",
          "source-layer": "osm",
          minzoom: 13,
          filter: [
            "all",
            ["has", "name"],
            ["in", ["get", "highway"], ["literal", ["residential", "service", "unclassified", "tertiary", "tertiary_link", "living_street"]]],
          ],
          layout: {
            "symbol-placement": "line" as const,
            "text-field": ["coalesce", ["get", "name:ru"], ["get", "name"]] as never,
            "text-font": ["Noto Sans Regular"],
            "text-size": ["interpolate", ["linear"], ["zoom"], 14, 11, 18, 14],
            "text-letter-spacing": 0.05,
            "symbol-spacing": 250,
          },
          paint: {
            "text-color": "#cfd6dc",
            "text-halo-color": "#0e1116",
            "text-halo-width": 1.6,
          },
        },
        // Названия районов / посёлков — для общей ориентации на низких zoom
        {
          id: "place-labels",
          type: "symbol" as const,
          source: "basemap",
          "source-layer": "osm",
          minzoom: 9,
          maxzoom: 15,
          filter: [
            "all",
            ["has", "name"],
            ["in", ["get", "place"], ["literal", ["city", "town", "village", "suburb", "neighbourhood", "quarter"]]],
          ],
          layout: {
            "text-field": ["coalesce", ["get", "name:ru"], ["get", "name"]] as never,
            "text-font": ["Noto Sans Bold"],
            "text-size": [
              "interpolate", ["linear"], ["zoom"],
              9, ["match", ["get", "place"], "city", 14, "town", 12, "village", 10, "suburb", 11, 9],
              14, ["match", ["get", "place"], "city", 22, "town", 18, "village", 14, "suburb", 16, 13],
            ],
            "text-letter-spacing": 0.08,
            "text-transform": "uppercase",
          },
          paint: {
            "text-color": "#a8b2c0",
            "text-halo-color": "#0e1116",
            "text-halo-width": 2,
            "text-opacity": ["interpolate", ["linear"], ["zoom"], 9, 1, 14, 0.8, 15, 0],
          },
        },
        // Станции метро — красные кружки с "М", самый важный ориентир в Питере.
        // Фильтр охватывает оба популярных способа тегирования в OSM:
        //   station=subway (основной) + railway=station+subway=yes (устаревший).
        // Видны с z10 — с обзорного масштаба города.
        {
          id: "metro-stations",
          type: "symbol" as const,
          source: "basemap",
          "source-layer": "osm",
          minzoom: 10,
          filter: [
            "any",
            ["==", ["get", "station"], "subway"],
            ["all", ["==", ["get", "railway"], "station"], ["==", ["get", "subway"], "yes"]],
            ["all", ["==", ["get", "railway"], "station"], ["==", ["get", "network"], "Петербургский метрополитен"]],
          ],
          layout: {
            "icon-image": "metro-icon",
            "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 0.55, 13, 0.75, 16, 1.0],
            "icon-anchor": "center" as const,
            "icon-allow-overlap": true,
            "icon-ignore-placement": false,
            "text-field": ["coalesce", ["get", "name:ru"], ["get", "name"]] as never,
            "text-font": ["Noto Sans Bold"],
            "text-anchor": "top" as const,
            "text-offset": [0, 0.95],
            "text-size": ["interpolate", ["linear"], ["zoom"], 10, 10, 13, 12, 16, 14],
            "text-optional": true,
            "text-max-width": 10,
          },
          paint: {
            "text-color": "#e05050",
            "text-halo-color": "#0a0d12",
            "text-halo-width": 2,
          },
        },
        // Вестибюли (входы в метро) — тёмно-красные, поменьше, видны с z14.
        // Помогают курьеру найти точку входа под землю.
        {
          id: "metro-entrances",
          type: "symbol" as const,
          source: "basemap",
          "source-layer": "osm",
          minzoom: 14,
          filter: ["==", ["get", "railway"], "subway_entrance"],
          layout: {
            "icon-image": "metro-entrance-icon",
            "icon-size": ["interpolate", ["linear"], ["zoom"], 14, 0.6, 17, 0.9],
            "icon-anchor": "center" as const,
            "icon-allow-overlap": true,
            "text-field": ["get", "ref"] as never,
            "text-font": ["Noto Sans Bold"],
            "text-anchor": "top" as const,
            "text-offset": [0, 0.75],
            "text-size": 10,
            "text-optional": true,
          },
          paint: {
            "text-color": "#e05050",
            "text-halo-color": "#0a0d12",
            "text-halo-width": 1.5,
          },
        },
        // Номера домов — главный ориентир курьера.
        // Дедуп: только полигоны зданий (не отдельные точки парадных),
        // не building:part (чтобы не дублировать с основным полигоном),
        // без гаражей/сараев — в них курьеру нечего делать.
        // minzoom поднят до 15: на низком зуме номера мешают обзору и нечитаемы.
        // При z15 мягко появляются, при z17+ разрешаем перекрытие — курьер уже у цели.
        {
          id: "housenumbers",
          type: "symbol" as const,
          source: "basemap",
          "source-layer": "osm",
          minzoom: 15,
          filter: [
            "all",
            ["has", "addr:housenumber"],
            ["==", ["geometry-type"], "Polygon"],
            ["!", ["has", "building:part"]],
            ["!=", ["get", "building"], "garage"],
            ["!=", ["get", "building"], "garages"],
            ["!=", ["get", "building"], "shed"],
            ["!=", ["get", "building"], "roof"],
            ["!=", ["get", "building"], "carport"],
          ],
          layout: {
            "text-field": ["get", "addr:housenumber"],
            "text-font": ["Noto Sans Bold"],
            // z15 маленький, z17 читаем, z19 крупный — плавное нарастание
            "text-size": ["interpolate", ["linear"], ["zoom"], 15, 10, 17, 15, 19, 20],
            "text-padding": 4,
            // Перекрытие только когда курьер уже у подъезда (z17+)
            "text-allow-overlap": ["step", ["zoom"], false, 17, true],
            "text-ignore-placement": false,
            "symbol-placement": "point",
          },
          paint: {
            "text-color": "#ffd166",
            "text-halo-color": "#0e1116",
            "text-halo-width": ["interpolate", ["linear"], ["zoom"], 15, 2, 17, 3],
            "text-halo-blur": 0.4,
            // Плавное появление: z15 = 80%, z16 = 100%
            "text-opacity": ["interpolate", ["linear"], ["zoom"], 15, 0.8, 16, 1],
          },
        },
        // Подсветка выбранного дома — плоская заливка для низкого зума.
        // Полная непрозрачность: иначе сине-серая «подложка» зданий просвечивает
        // и оранжевый получается грязным.
        {
          id: "selected-building-fill",
          type: "fill" as const,
          source: "selected-building",
          maxzoom: 15,
          paint: {
            "fill-color": "#fb923c",
            "fill-opacity": 1,
          },
        },
        // 3D-подсветка выбранного дома: оранжевая «коробочка».
        // Полная непрозрачность по той же причине — чистый цвет без наложения.
        {
          id: "selected-building-3d",
          type: "fill-extrusion" as const,
          source: "selected-building",
          minzoom: 15,
          paint: {
            "fill-extrusion-color": "#fb923c",
            "fill-extrusion-height": [
              "*",
              ["coalesce", ["to-number", ["get", "building:levels"]], 1],
              3,
            ],
            "fill-extrusion-base": [
              "coalesce",
              ["to-number", ["get", "min_height"]],
              0,
            ],
            "fill-extrusion-opacity": 1,
          },
        },
        // Яркая жёлтая обводка по периметру выбранного дома
        {
          id: "selected-building-outline",
          type: "line" as const,
          source: "selected-building",
          paint: {
            "line-color": "#fde047",
            "line-width": 3.5,
            "line-blur": 0.3,
          },
        },
        // Пешеходные переходы (зебры) — рисуем как маленькие полосатые иконки,
        // как настоящие зебры на дороге сверху. Иконка генерируется на лету и
        // регистрируется в карте через map.addImage("zebra-icon", ...).
        {
          id: "crossings",
          type: "symbol" as const,
          source: "basemap",
          "source-layer": "osm",
          minzoom: 16,
          filter: [
            "any",
            ["==", ["get", "highway"], "crossing"],
            ["==", ["get", "footway"], "crossing"],
            ["has", "crossing"],
          ],
          layout: {
            "icon-image": "zebra-icon",
            "icon-size": ["interpolate", ["linear"], ["zoom"], 16, 0.55, 18, 0.85, 20, 1.15],
            // Выравнивание по экрану — полоски всегда читаемы вне зависимости от поворота карты
            "icon-rotation-alignment": "viewport",
            "icon-pitch-alignment": "viewport",
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
          },
        },
        // Подписи значимых зданий по name — школы, больницы, ТЦ и т.д.
        {
          id: "building-labels",
          type: "symbol" as const,
          source: "basemap",
          "source-layer": "osm",
          minzoom: 16,
          filter: ["all", ["has", "name"], ["has", "building"]],
          layout: {
            "text-field": ["coalesce", ["get", "name:ru"], ["get", "name"]] as never,
            "text-font": ["Noto Sans Regular"],
            "text-size": ["interpolate", ["linear"], ["zoom"], 16, 10, 19, 13],
            "text-max-width": 8,
            "text-padding": 4,
          },
          paint: {
            "text-color": "#9aa7c2",
            "text-halo-color": "#0e1116",
            "text-halo-width": 1.4,
          },
        },
      ],
    };
  }
  // Raster fallback: CartoDB Dark Matter — dark background matches our UI perfectly,
  // good road hierarchy contrast, free & reliable CDN.
  return {
    version: 8 as const,
    glyphs: "/api/tiles/font/{fontstack}/{range}.pbf?v=2",
    sources: {
      "raster-dark": {
        type: "raster" as const,
        tiles: ["https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"],
        tileSize: 256,
        attribution: "© OpenStreetMap contributors © CARTO",
        maxzoom: 19,
      },
    },
    layers: [
      { id: "background", type: "background" as const, paint: { "background-color": "#0d0e12" } },
      { id: "raster", type: "raster" as const, source: "raster-dark", paint: { "raster-opacity": 0.97 } },
    ],
  };
}

export default function App() {
  const mapRef = useRef<MlMap | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [stack, setStack] = useState<StackStatus | null>(null);
  const [pois, setPois] = useState<Poi[]>([]);
  const [filterTypes, setFilterTypes] = useState<Set<PoiType>>(new Set(POI_TYPES));
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<GeocodeResult[]>([]);
  const [parsedQuery, setParsedQuery] = useState<{ display: string; full: string } | null>(null);
  const [myLocation, setMyLocation] = useState<{ lng: number; lat: number; accuracy: number; heading: number | null } | null>(null);
  const [tracking, setTracking] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const [route, setRoute] = useState<{
    coordinates: [number, number][];
    distanceM: number;
    durationS: number;
    source: string;
    toLabel: string;
    steps?: Array<{ text: string; distanceM: number; durationS: number }>;
  } | null>(null);
  const [routing, setRouting] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [stepsOpen, setStepsOpen] = useState(false);
  const [searchSource, setSearchSource] = useState<string>("");
  const [coord, setCoord] = useState<{ lng: number; lat: number } | null>(null);
  const [addMode, setAddMode] = useState(false);
  // Режим «указать моё местоположение вручную»: следующий клик по карте поставит синюю точку «я»
  // в указанное место. Полезно, когда GPS промахнулся, а курьер точно знает, где он стоит.
  const [setMeMode, setSetMeMode] = useState(false);
  const [draftPoint, setDraftPoint] = useState<{ lng: number; lat: number } | null>(null);
  const [webglError, setWebglError] = useState(false);
  const [draftType, setDraftType] = useState<PoiType>("entrance");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDesc, setDraftDesc] = useState("");
  const [draftAddr, setDraftAddr] = useState("");
  const [saving, setSaving] = useState(false);
  // Новый UI: выдвижная панель и какая вкладка в ней открыта
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<"points" | "filter" | "stack">("points");
  const [searchFocused, setSearchFocused] = useState(false);
  // Флаг: только что выбрали результат — не запускать новый поиск по setSearch(primary)
  const suppressSearchRef = useRef(false);
  // Информация о выделенном здании (для подписи на плашке «снять выделение»)
  const [selectedBuildingInfo, setSelectedBuildingInfo] = useState<{
    label: string;
  } | null>(null);

  const loadStack = useCallback(async () => {
    try {
      const s = await api.stackStatus();
      setStack(s);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const reloadPois = useCallback(async () => {
    try {
      const list = await api.listPois();
      setPois(list);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    // Регистрируем Service Worker для офлайн-кеширования тайлов и шрифтов
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .catch(() => {});
    }

    loadStack();
    reloadPois();
    const id = window.setInterval(loadStack, 15000);
    return () => window.clearInterval(id);
  }, [loadStack, reloadPois]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let map: MlMap;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: buildStyle(stack),
        center: SPB_CENTER,
        zoom: 14,
        // Лёгкий наклон + макс наклон — здания становятся объёмными,
        // курьер видит силуэт района как «коробочки», а не плоский план
        pitch: 35,
        maxPitch: 65,
        bearing: 0,
        attributionControl: { compact: true },
      });
    } catch (e) {
      console.error("MapLibre init failed:", e);
      setWebglError(true);
      return;
    }
    // Только масштабная линейка снизу-справа.
    // Кнопки зума, компаса и геолокации — наши собственные плавающие справа,
    // дефолтные дублировали бы и наезжали на поисковую строку.
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");
    map.on("mousemove", (e) => setCoord({ lng: e.lngLat.lng, lat: e.lngLat.lat }));
    map.on("error", (e) => {
      const err = (e as { error?: Error })?.error;
      if (err?.message?.toLowerCase().includes("webgl")) {
        setWebglError(true);
      }
    });
    mapRef.current = map;
    return () => {
      try { map.remove(); } catch {}
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switch map style when basemap source changes (skip initial mount).
  // Когда stack ещё null мы уже показываем vector-стиль (оптимистично),
  // поэтому basemapKey = pmtiles_martin — чтобы при получении реального stack
  // не было лишнего setStyle() если Martin действительно запущен.
  const basemapKey = stack?.basemap.source ?? "pmtiles_martin";
  const stackRef = useRef(stack);
  stackRef.current = stack;
  const prevBasemapKeyRef = useRef<string>("");
  useEffect(() => {
    const prev = prevBasemapKeyRef.current;
    prevBasemapKeyRef.current = basemapKey;
    if (!prev || prev === basemapKey) return;  // skip initial & no-op
    if (!mapRef.current) return;
    mapRef.current.setStyle(buildStyle(stackRef.current));
    // POIs will be re-added in the style.load handler below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basemapKey]);

  // Add POI source/layers and click handlers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const setupLayers = () => {
      if (map.getSource("pois")) return;

      // Clustered GeoJSON source — MapLibre handles grouping automatically
      map.addSource("pois", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        cluster: true,
        clusterMaxZoom: 15,
        clusterRadius: 45,
      });

      // --- Cluster layers (rendered below individual icons) ---
      map.addLayer({
        id: "pois-clusters",
        type: "circle",
        source: "pois",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": [
            "step", ["get", "point_count"],
            "#1d4ed8", 5, "#1e40af", 20, "#1e3a8a",
          ],
          "circle-radius": ["step", ["get", "point_count"], 16, 5, 22, 20, 28],
          "circle-stroke-width": 2.5,
          "circle-stroke-color": "#ffffff",
          "circle-opacity": 0.92,
        },
      });
      map.addLayer({
        id: "pois-cluster-count",
        type: "symbol",
        source: "pois",
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": ["Noto Sans Bold"],
          "text-size": 13,
        },
        paint: { "text-color": "#ffffff" },
      });

      // --- Individual POI pin icons ---
      map.addLayer({
        id: "pois-icons",
        type: "symbol",
        source: "pois",
        filter: ["!", ["has", "point_count"]],
        layout: {
          "icon-image": ["concat", "poi-pin-", ["get", "type"]],
          "icon-size": 1,
          "icon-allow-overlap": true,
          "icon-anchor": "bottom" as const,
        },
      });
      map.addLayer({
        id: "pois-labels",
        type: "symbol",
        source: "pois",
        filter: ["!", ["has", "point_count"]],
        minzoom: 14,
        layout: {
          "text-field": ["get", "title"],
          "text-font": ["Noto Sans Bold"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 14, 10, 18, 14],
          "text-offset": [0, 0.3],
          "text-anchor": "top",
          "text-padding": 3,
          "text-max-width": 9,
          "text-allow-overlap": false,
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "#0e1116",
          "text-halo-width": 1.6,
        },
      });

      // Route polyline — drawn below POI so pins stay on top
      map.addSource("route", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer(
        {
          id: "route-casing",
          type: "line",
          source: "route",
          paint: {
            "line-color": "#0b1620",
            "line-width": ["interpolate", ["linear"], ["zoom"], 10, 6, 16, 10],
            "line-opacity": 0.9,
          },
          layout: { "line-cap": "round", "line-join": "round" },
        },
        "pois-clusters",
      );
      map.addLayer(
        {
          id: "route-line",
          type: "line",
          source: "route",
          paint: {
            "line-color": "#3b82f6",
            "line-width": ["interpolate", ["linear"], ["zoom"], 10, 3, 16, 6],
            "line-opacity": 0.85,
          },
          layout: { "line-cap": "round", "line-join": "round" },
        },
        "pois-clusters",
      );
      // Animated "ant march" dash layer on top of the solid route line
      map.addLayer(
        {
          id: "route-line-dash",
          type: "line",
          source: "route",
          paint: {
            "line-color": "#93c5fd",
            "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2, 16, 4],
            "line-dasharray": [0, 4, 3],
          },
          layout: { "line-cap": "butt", "line-join": "round" },
        },
        "pois-clusters",
      );

      // "Я здесь" — пульсирующий маркер
      map.addSource("me", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "me-accuracy",
        type: "circle",
        source: "me",
        paint: {
          "circle-radius": ["get", "accuracyPx"],
          "circle-color": "#3b82f6",
          "circle-opacity": 0.12,
          "circle-stroke-color": "#3b82f6",
          "circle-stroke-opacity": 0.4,
          "circle-stroke-width": 1,
        },
      });
      map.addLayer({
        id: "me-dot",
        type: "circle",
        source: "me",
        paint: {
          "circle-radius": 7,
          "circle-color": "#3b82f6",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2.5,
        },
      });
    };
    if (map.isStyleLoaded()) {
      setupLayers();
    } else {
      map.once("style.load", setupLayers);
    }
  }, [basemapKey]);

  // Регистрируем иконку «зебра» (полоски пешеходного перехода) в карте.
  // Слой crossings ссылается на icon-image: "zebra-icon", и без addImage MapLibre
  // не сможет её нарисовать. Перерегистрируется при смене стиля basemapKey.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const installZebra = () => {
      if (map.hasImage("zebra-icon")) return;
      // Размер иконки в логических пикселях; pixelRatio: 2 даст резкость на retina
      const w = 22;
      const h = 14;
      const canvas = document.createElement("canvas");
      canvas.width = w * 2;
      canvas.height = h * 2;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(2, 2);
      // 5 белых полосок с тёмной обводкой — узнаваемая «зебра» сверху
      const stripes = 5;
      const gap = 2;
      const stripeW = 2.4;
      const totalW = stripes * stripeW + (stripes - 1) * gap;
      const startX = (w - totalW) / 2;
      for (let i = 0; i < stripes; i++) {
        const x = startX + i * (stripeW + gap);
        // Тёмная окантовка под полоской — полоски остаются читаемыми и на светлой дороге
        ctx.fillStyle = "rgba(10, 13, 18, 0.85)";
        ctx.fillRect(x - 0.6, 0.6, stripeW + 1.2, h - 1.2);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(x, 1.2, stripeW, h - 2.4);
      }
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      try {
        map.addImage(
          "zebra-icon",
          { width: imgData.width, height: imgData.height, data: new Uint8Array(imgData.data.buffer) },
          { pixelRatio: 2 },
        );
      } catch (e) {
        console.warn("Не смогли добавить иконку зебры:", e);
      }
    };
    if (map.isStyleLoaded()) installZebra();
    else map.once("style.load", installZebra);
  }, [basemapKey]);

  // Register canvas-drawn pin icons for each POI type. Re-registered on style change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const installPins = () => {
      for (const t of POI_TYPES) {
        const imgName = `poi-pin-${t}`;
        if (map.hasImage(imgName)) continue;
        try {
          const img = drawPoiPin(t);
          map.addImage(imgName, img, { pixelRatio: 2 });
        } catch (e) {
          console.warn(`Не удалось добавить иконку ${t}:`, e);
        }
      }
    };
    if (map.isStyleLoaded()) installPins();
    else map.once("style.load", installPins);
  }, [basemapKey]);

  // Register metro station and entrance icons. Re-registered on style change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const installMetro = () => {
      if (!map.hasImage("metro-icon")) {
        try { map.addImage("metro-icon", drawMetroIcon(), { pixelRatio: 2 }); }
        catch (e) { console.warn("metro-icon:", e); }
      }
      if (!map.hasImage("metro-entrance-icon")) {
        try { map.addImage("metro-entrance-icon", drawMetroEntranceIcon(), { pixelRatio: 2 }); }
        catch (e) { console.warn("metro-entrance-icon:", e); }
      }
    };
    if (map.isStyleLoaded()) installMetro();
    else map.once("style.load", installMetro);
  }, [basemapKey]);

  // Update POI features when pois or filter changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const src = map.getSource("pois") as maplibregl.GeoJSONSource | undefined;
      if (!src) return;
      const filtered = pois.filter((p) => filterTypes.has(p.type));
      src.setData({
        type: "FeatureCollection",
        features: filtered.map((p) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [p.lng, p.lat] },
          properties: { id: p.id, type: p.type, title: p.title },
        })),
      });
    };
    if (map.isStyleLoaded() && map.getSource("pois")) apply();
    else map.once("idle", apply);
  }, [pois, filterTypes, basemapKey]);

  // Обновляем GeoJSON маршрута
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const src = map.getSource("route") as maplibregl.GeoJSONSource | undefined;
      if (!src) return;
      if (!route) {
        src.setData({ type: "FeatureCollection", features: [] });
        return;
      }
      src.setData({
        type: "FeatureCollection",
        features: [{
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: route.coordinates },
        }],
      });
    };
    if (map.isStyleLoaded() && map.getSource("route")) apply();
    else map.once("idle", apply);
  }, [route, basemapKey]);

  // Animated "ant march" dashes — show direction of travel along the route.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (animFrameRef.current != null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (!route) return;
    let step = 0;
    const animate = (ts: number) => {
      const newStep = Math.floor(ts / 55) % DASH_SEQUENCE.length;
      if (newStep !== step) {
        step = newStep;
        if (map.getLayer("route-line-dash")) {
          map.setPaintProperty("route-line-dash", "line-dasharray", DASH_SEQUENCE[step]);
        }
      }
      animFrameRef.current = requestAnimationFrame(animate);
    };
    animFrameRef.current = requestAnimationFrame(animate);
    return () => {
      if (animFrameRef.current != null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [route, basemapKey]);

  // Обновляем маркер "Я здесь"
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const src = map.getSource("me") as maplibregl.GeoJSONSource | undefined;
      if (!src) return;
      if (!myLocation) {
        src.setData({ type: "FeatureCollection", features: [] });
        return;
      }
      // accuracy в метрах -> в пикселях для текущего зума (грубая оценка через mercatorScale)
      const z = map.getZoom();
      const metersPerPixel = (40075016.686 * Math.cos((myLocation.lat * Math.PI) / 180)) / Math.pow(2, z + 8);
      const accuracyPx = Math.min(80, Math.max(8, myLocation.accuracy / Math.max(0.5, metersPerPixel)));
      src.setData({
        type: "FeatureCollection",
        features: [{
          type: "Feature",
          properties: {
            accuracyPx,
            heading: myLocation.heading ?? -1,
            hasHeading: myLocation.heading != null ? 1 : 0,
          },
          geometry: { type: "Point", coordinates: [myLocation.lng, myLocation.lat] },
        }],
      });
    };
    if (map.isStyleLoaded() && map.getSource("me")) apply();
    else map.once("idle", apply);
  }, [myLocation, basemapKey]);

  // Когда выбран активный маршрут — приглушаем номера домов и сами здания,
  // чтобы целевой дом (ярко-оранжевый) и линия маршрута читались без шума.
  // Здания тускнеют слабее, чем номера — нужно сохранять контекст района.
  // Когда маршрут сброшен — возвращаем всё к исходному виду.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const dimmed = !!route;
      // Номера домов — глубокое приглушение; при сбросе восстанавливаем зум-fade
      if (map.getLayer("housenumbers")) {
        map.setPaintProperty(
          "housenumbers",
          "text-opacity",
          dimmed ? 0.22 : ["interpolate", ["linear"], ["zoom"], 12, 0.5, 13, 1],
        );
        map.setPaintProperty("housenumbers", "text-halo-width", dimmed ? 0.6 : ["interpolate", ["linear"], ["zoom"], 12, 1.5, 17, 3]);
      }
      // Плоские здания — лёгкое приглушение, исходная зум-интерполяция масштабируется
      if (map.getLayer("buildings")) {
        map.setPaintProperty(
          "buildings",
          "fill-opacity",
          dimmed
            ? ["interpolate", ["linear"], ["zoom"], 13, 0.42, 16, 0.6]
            : ["interpolate", ["linear"], ["zoom"], 13, 0.7, 16, 1],
        );
      }
      // 3D-здания — те же 60% от исходных 0.92
      if (map.getLayer("buildings-3d")) {
        map.setPaintProperty("buildings-3d", "fill-extrusion-opacity", dimmed ? 0.55 : 0.92);
      }
    };
    if (map.isStyleLoaded()) apply();
    else map.once("idle", apply);
  }, [route, basemapKey]);

  // Получить позицию пользователя (с кешем по requestPosition)
  const getMyPosition = useCallback((): Promise<{ lng: number; lat: number; accuracy: number }> => {
    return new Promise((resolve, reject) => {
      if (!("geolocation" in navigator)) {
        reject(new Error("Геолокация недоступна в этом браузере"));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = {
            lng: pos.coords.longitude,
            lat: pos.coords.latitude,
            accuracy: pos.coords.accuracy ?? 30,
            heading: typeof pos.coords.heading === "number" && !Number.isNaN(pos.coords.heading) ? pos.coords.heading : null,
          };
          setMyLocation(loc);
          resolve(loc);
        },
        (err) => {
          const msgs: Record<number, string> = {
            1: "Доступ к геолокации запрещён в браузере",
            2: "Не удалось определить позицию",
            3: "Геолокация: таймаут",
          };
          reject(new Error(msgs[err.code] ?? err.message));
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
      );
    });
  }, []);

  // Live-трекинг: следим за положением через watchPosition и держим карту по центру.
  // Кнопка геолокации становится тумблером: первый клик — включить, второй — выключить.
  const stopTracking = useCallback(() => {
    if (watchIdRef.current != null && "geolocation" in navigator) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    watchIdRef.current = null;
    setTracking(false);
  }, []);

  const startTracking = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setRouteError("Геолокация недоступна в этом браузере");
      return;
    }
    if (watchIdRef.current != null) return; // уже включено
    setTracking(true);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const loc = {
          lng: pos.coords.longitude,
          lat: pos.coords.latitude,
          accuracy: pos.coords.accuracy ?? 30,
          heading:
            typeof pos.coords.heading === "number" && !Number.isNaN(pos.coords.heading)
              ? pos.coords.heading
              : null,
        };
        setMyLocation(loc);
        // Плавно двигаем карту за курьером. Не дёргаем, если сейчас активен маршрут
        // и пользователь уже разглядывает картинку маршрута — иначе будет кидать.
        const map = mapRef.current;
        if (map) {
          const z = map.getZoom();
          map.easeTo({
            center: [loc.lng, loc.lat],
            zoom: z < 15 ? 16 : z, // если был отдалён обзор — приблизим, иначе сохраним зум
            duration: 600,
          });
        }
      },
      (err) => {
        const msgs: Record<number, string> = {
          1: "Доступ к геолокации запрещён в браузере",
          2: "Не удалось определить позицию",
          3: "Геолокация: таймаут",
        };
        setRouteError(msgs[err.code] ?? err.message);
        stopTracking();
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 2000 },
    );
  }, [stopTracking]);

  // Подчищаем watcher при размонтировании компонента
  useEffect(() => {
    return () => {
      if (watchIdRef.current != null && "geolocation" in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, []);

  // Маршрут "от меня сюда"
  const routeFromMe = useCallback(
    async (to: { lng: number; lat: number }, label: string) => {
      setRouteError(null);
      setRouting(true);
      try {
        const me = myLocation ?? (await getMyPosition());
        const r = await api.route({ lat: me.lat, lng: me.lng }, to, "ebike");
        setRoute({
          coordinates: r.coordinates as [number, number][],
          distanceM: r.distanceM,
          durationS: r.durationS,
          source: r.source,
          toLabel: label,
          steps: r.steps,
        });
        setStepsOpen(false);
        // Подгоним карту под маршрут
        const map = mapRef.current;
        if (map && r.coordinates.length > 0) {
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const [x, y] of r.coordinates) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
          map.fitBounds([[minX, minY], [maxX, maxY]], { padding: 60, duration: 700, maxZoom: 17 });
        }
      } catch (e) {
        setRouteError((e as Error).message);
      } finally {
        setRouting(false);
      }
    },
    [myLocation, getMyPosition],
  );

  const clearRoute = () => {
    setRoute(null);
    setRouteError(null);
    setStepsOpen(false);
  };

  // Установить выделение здания по конкретной фиче (из click или поиска).
  // Сохраняем подсветку до явной отмены через кнопку «снять выделение».
  const setSelectedBuilding = useCallback(
    (feature: GeoJSON.Feature | null, label: string | null) => {
      const src = mapRef.current?.getSource("selected-building") as
        | maplibregl.GeoJSONSource
        | undefined;
      if (!src) return;
      if (feature) {
        src.setData({ type: "FeatureCollection", features: [feature] });
        setSelectedBuildingInfo({ label: label || "Здание" });
      } else {
        src.setData({ type: "FeatureCollection", features: [] });
        setSelectedBuildingInfo(null);
      }
    },
    [],
  );

  const buildBuildingLabel = (
    props: Record<string, string | number | undefined>,
  ): string => {
    const housenumber = props["addr:housenumber"];
    const street = props["addr:street"];
    const name = props["name"];
    if (street && housenumber) return `${street}, ${housenumber}`;
    if (housenumber) return `№ ${housenumber}`;
    if (name) return String(name);
    return "Здание";
  };

  // Найти здание под точкой (после flyTo) и подсветить.
  // Тайлы могут не успеть подгрузиться — пробуем дважды.
  const highlightBuildingAt = (lng: number, lat: number) => {
    const map = mapRef.current;
    if (!map) return;
    const tryHighlight = () => {
      const pt = map.project([lng, lat]);
      const feats = map.queryRenderedFeatures(
        [
          [pt.x - 8, pt.y - 8],
          [pt.x + 8, pt.y + 8],
        ],
        { layers: ["buildings"] },
      );
      if (feats.length > 0) {
        const f = feats[0];
        const props = (f.properties || {}) as Record<string, string | number | undefined>;
        setSelectedBuilding(f as any, buildBuildingLabel(props));
      }
    };
    setTimeout(tryHighlight, 850);
    setTimeout(tryHighlight, 1400);
  };

  // Click handlers — popups & add mode
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onClick = (e: MapLayerMouseEvent) => {
      // Ручная корректировка позиции «я»: ставим синюю точку точно туда, куда курьер кликнул.
      // Точность принудительно занижаем (3 м) — пользователь сам подтвердил место, кружок-ореол
      // рисуется маленьким и не вводит в заблуждение.
      if (setMeMode) {
        // Если шёл live-трекинг — выключаем, иначе watchPosition мгновенно перепишет нашу точку
        if (tracking) stopTracking();
        setMyLocation({ lng: e.lngLat.lng, lat: e.lngLat.lat, accuracy: 3, heading: null });
        setSetMeMode(false);
        return;
      }
      if (addMode) {
        setDraftPoint({ lng: e.lngLat.lng, lat: e.lngLat.lat });
        setAddMode(false);
        return;
      }
      // 1) Сначала проверяем — клик попал в кластер?
      const clusterFeats = map.queryRenderedFeatures(e.point, { layers: ["pois-clusters"] });
      if (clusterFeats.length > 0) {
        const f = clusterFeats[0];
        const clusterId = (f.properties as { cluster_id: number }).cluster_id;
        const src = map.getSource("pois") as maplibregl.GeoJSONSource;
        const coords = (f.geometry as GeoJSON.Point).coordinates as [number, number];
        src.getClusterExpansionZoom(clusterId).then((zoom) => {
          map.easeTo({ center: coords, zoom: zoom ?? map.getZoom() + 1, duration: 400 });
        }).catch(() => {
          map.easeTo({ center: coords, zoom: map.getZoom() + 2, duration: 400 });
        });
        return;
      }
      // 2) Клик попал в отдельный POI?
      const poiFeats = map.queryRenderedFeatures(e.point, { layers: ["pois-icons"] });
      if (poiFeats.length > 0) {
        const f = poiFeats[0];
        const id = (f.properties as { id: number }).id;
        const poi = pois.find((p) => p.id === id);
        if (!poi) return;
        const meta = POI_TYPE_META[poi.type];
        const html = `
          <h3>${meta.icon} ${escapeHtml(poi.title)}</h3>
          ${poi.description ? `<p>${escapeHtml(poi.description)}</p>` : ""}
          ${poi.address ? `<p class="small">${escapeHtml(poi.address)}</p>` : ""}
          <p class="small">${meta.label} · ${poi.lat.toFixed(5)}, ${poi.lng.toFixed(5)}</p>
          <div class="btns">
            <button data-action="route" class="primary">→ Маршрут от меня</button>
            <button data-action="delete" data-id="${poi.id}" class="danger">Удалить</button>
          </div>
        `;
        const popup = new maplibregl.Popup({ offset: 12, closeButton: true })
          .setLngLat([poi.lng, poi.lat])
          .setHTML(html)
          .addTo(map);
        const el = popup.getElement();
        el.querySelector('[data-action="route"]')?.addEventListener("click", (ev) => {
          ev.stopPropagation();
          popup.remove();
          routeFromMe({ lng: poi.lng, lat: poi.lat }, `${meta.icon} ${poi.title}`);
        });
        el.querySelector('[data-action="delete"]')?.addEventListener("click", async (ev) => {
          ev.stopPropagation();
          if (!confirm("Удалить эту точку?")) return;
          await api.deletePoi(poi.id);
          popup.remove();
          reloadPois();
        });
        return;
      }

      // 2) Клик по зданию — подсвечиваем устойчиво + мини-попап с адресом.
      // Подсветка остаётся даже после закрытия попапа, до явной отмены.
      const buildingFeats = map.queryRenderedFeatures(e.point, { layers: ["buildings"] });
      if (buildingFeats.length > 0) {
        const f = buildingFeats[0];
        const props = (f.properties || {}) as Record<string, string | number | undefined>;
        const headline = buildBuildingLabel(props);
        setSelectedBuilding(f as any, headline);

        const housenumber = props["addr:housenumber"];
        const street = props["addr:street"];
        const levels = props["building:levels"];
        const buildingType = props["building"];
        const meta: string[] = [];
        if (levels) meta.push(`${levels} эт.`);
        if (buildingType && buildingType !== "yes") meta.push(String(buildingType));
        const html = `
          <h3>${escapeHtml(headline)}</h3>
          ${meta.length ? `<p class="small">${escapeHtml(meta.join(" · "))}</p>` : ""}
          <p class="small">${e.lngLat.lat.toFixed(5)}, ${e.lngLat.lng.toFixed(5)}</p>
          <div class="btns">
            <button data-action="route" class="primary">→ Маршрут сюда</button>
            <button data-action="add-here">+ Точка здесь</button>
          </div>
        `;
        const popup = new maplibregl.Popup({ offset: 8, closeButton: true })
          .setLngLat(e.lngLat)
          .setHTML(html)
          .addTo(map);
        const el = popup.getElement();
        el.querySelector('[data-action="route"]')?.addEventListener("click", (ev) => {
          ev.stopPropagation();
          popup.remove();
          routeFromMe({ lng: e.lngLat.lng, lat: e.lngLat.lat }, headline);
        });
        el.querySelector('[data-action="add-here"]')?.addEventListener("click", (ev) => {
          ev.stopPropagation();
          popup.remove();
          setDraftPoint({ lng: e.lngLat.lng, lat: e.lngLat.lat });
          if (street && housenumber) setDraftAddr(`${street}, ${housenumber}`);
        });
        return;
      }
    };
    map.on("click", onClick);
    map.getCanvas().style.cursor = (addMode || setMeMode) ? "crosshair" : "";

    // Курсор-палец при наведении на здания и POI
    const onMouseMoveBuildings = () => {
      if (!addMode && !setMeMode) map.getCanvas().style.cursor = "pointer";
    };
    const onMouseLeaveBuildings = () => {
      if (!addMode && !setMeMode) map.getCanvas().style.cursor = "";
    };
    map.on("mouseenter", "buildings", onMouseMoveBuildings);
    map.on("mouseleave", "buildings", onMouseLeaveBuildings);
    map.on("mouseenter", "pois-icons", onMouseMoveBuildings);
    map.on("mouseleave", "pois-icons", onMouseLeaveBuildings);
    map.on("mouseenter", "pois-clusters", onMouseMoveBuildings);
    map.on("mouseleave", "pois-clusters", onMouseLeaveBuildings);

    return () => {
      map.off("click", onClick);
      map.off("mouseenter", "buildings", onMouseMoveBuildings);
      map.off("mouseleave", "buildings", onMouseLeaveBuildings);
      map.off("mouseenter", "pois-icons", onMouseMoveBuildings);
      map.off("mouseleave", "pois-icons", onMouseLeaveBuildings);
      map.off("mouseenter", "pois-clusters", onMouseMoveBuildings);
      map.off("mouseleave", "pois-clusters", onMouseLeaveBuildings);
    };
  }, [pois, addMode, setMeMode, tracking, stopTracking, reloadPois, routeFromMe, setSelectedBuilding]);

  // Live address search
  useEffect(() => {
    if (search.trim().length < 3) {
      setSearchResults([]);
      setParsedQuery(null);
      return;
    }
    // Пропускаем поиск если только что выбрали результат из списка
    if (suppressSearchRef.current) {
      suppressSearchRef.current = false;
      return;
    }
    const t = window.setTimeout(async () => {
      try {
        const res = await api.searchAddress(search.trim());
        setSearchResults(res.results.slice(0, 8));
        setSearchSource(res.source);
        setParsedQuery(res.parsed);
      } catch (e) {
        console.error(e);
      }
    }, 300);
    return () => window.clearTimeout(t);
  }, [search]);

  // Сокращаем длинный nominatim-лейбл до самого важного: первые 2-3 части
  // ("22, улица Рубинштейна, Владимирский округ, ..." → "22, улица Рубинштейна, Владимирский округ")
  const shortLabel = (label: string): { primary: string; secondary: string } => {
    const parts = label.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length <= 3) return { primary: parts.join(", "), secondary: "" };
    return {
      primary: parts.slice(0, 3).join(", "),
      secondary: parts.slice(3, -1).filter((p) => !/^\d{6}$/.test(p) && p !== "Россия").slice(0, 2).join(", "),
    };
  };


  const flyTo = (lng: number, lat: number, zoom = 16, highlightBuilding = false) => {
    mapRef.current?.flyTo({ center: [lng, lat], zoom, duration: 800 });
    if (highlightBuilding) {
      highlightBuildingAt(lng, lat);
    }
    // ВАЖНО: при обычном flyTo подсветку НЕ снимаем —
    // она уйдёт только по явной кнопке «снять выделение»
  };

  const resetView = () => {
    mapRef.current?.easeTo({ pitch: 35, bearing: 0, duration: 600 });
  };

  const saveDraft = async () => {
    if (!draftPoint || !draftTitle.trim()) return;
    setSaving(true);
    try {
      await api.createPoi({
        type: draftType,
        title: draftTitle.trim(),
        description: draftDesc.trim() || null,
        address: draftAddr.trim() || null,
        lng: draftPoint.lng,
        lat: draftPoint.lat,
      });
      setDraftPoint(null);
      setDraftTitle("");
      setDraftDesc("");
      setDraftAddr("");
      reloadPois();
    } finally {
      setSaving(false);
    }
  };

  const sortedPois = useMemo(
    () => [...pois].sort((a, b) => b.id - a.id),
    [pois],
  );

  const stackOk =
    !!stack && stack.postgis.up && stack.martin.up && stack.graphhopper.up;
  const totalServices = 4;
  const upServices = stack
    ? [stack.postgis.up, stack.martin.up, stack.graphhopper.up, stack.pelias.up].filter(
        Boolean,
      ).length
    : 0;

  return (
    <div className="app">
      <div id="map" ref={containerRef} />
      {webglError && (
        <div className="webgl-error">
          <h3>WebGL недоступен</h3>
          <p>Этот браузер/окружение не поддерживает WebGL — карта не может отрендериться.</p>
          <p>Откройте приложение в обычном браузере (Chrome, Firefox, Safari).</p>
        </div>
      )}

      {/* Плавающая строка поиска сверху — большая, под палец на планшете */}
      <div className={`search-floating${searchFocused ? " focused" : ""}`}>
        <div className="search-bar">
          <svg
            className="search-icon"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
            placeholder="Адрес, метро, ТЦ…"
            inputMode="search"
            autoComplete="off"
          />
          {search && (
            <button
              className="search-clear"
              title="Очистить"
              onClick={() => {
                setSearch("");
                setSearchResults([]);
              }}
            >
              ×
            </button>
          )}
        </div>
        {searchResults.length > 0 && (
          <div className="search-results">
            {parsedQuery && (
              <div className="parsed-hint" title={parsedQuery.full}>
                Понял как: <b>{parsedQuery.display}</b>
              </div>
            )}
            {searchResults.map((r, i) => {
              const { primary, secondary } = shortLabel(r.label);
              const isStruct = r.match === "structured";
              // Иконка-маркер: точный дом (синяя капля) / прочее (серая точка)
              return (
                <div
                  key={i}
                  className={`item${isStruct ? " item-struct" : ""}`}
                  title={r.label}
                >
                  <div
                    className="item-tap"
                    onClick={() => {
                      suppressSearchRef.current = true;
                      flyTo(r.lng, r.lat, 17, true);
                      setSearchResults([]);
                      setSearchFocused(false);
                      setSearch(primary);
                    }}
                  >
                    <span className={`item-icon${isStruct ? " icon-house" : ""}`}>
                      {isStruct ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 11l9-8 9 8v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                          <polyline points="9 22 9 12 15 12 15 22" />
                        </svg>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                      )}
                    </span>
                    <div className="item-content">
                      <div className="item-primary">{primary}</div>
                      {secondary && <div className="item-secondary">{secondary}</div>}
                    </div>
                  </div>
                  <button
                    className="item-route-btn"
                    title="Маршрут от меня"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      suppressSearchRef.current = true;
                      setSearchResults([]);
                      setSearchFocused(false);
                      setSearch(primary);
                      routeFromMe({ lng: r.lng, lat: r.lat }, primary);
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="12" x2="19" y2="12" />
                      <polyline points="12 5 19 12 12 19" />
                    </svg>
                  </button>
                </div>
              );
            })}
            <div className="search-source-line">источник: {searchSource}</div>
          </div>
        )}
      </div>

      {addMode && <div className="add-mode-banner">Кликните на карте, чтобы поставить точку</div>}
      {setMeMode && <div className="add-mode-banner">Кликните на карте, чтобы поставить себя сюда</div>}

      {/* Плашка «снять выделение» — посередине-сверху, когда есть выбранное здание */}
      {selectedBuildingInfo && (
        <button
          className="selection-pill"
          onClick={() => setSelectedBuilding(null, null)}
          title="Снять выделение здания"
        >
          <span className="selection-dot" />
          <span className="selection-label">{selectedBuildingInfo.label}</span>
          <span className="selection-x">×</span>
        </button>
      )}

      {/* Правая колонка плавающих кнопок */}
      <div className="map-controls">
        <button
          className="map-btn"
          title="Меню"
          onClick={() => setDrawerOpen(true)}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <button
          className={`map-btn${addMode ? " active" : ""}`}
          title={addMode ? "Отменить добавление" : "Добавить точку"}
          onClick={() => {
            if (setMeMode) setSetMeMode(false);
            setAddMode(!addMode);
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        <button
          className={`map-btn${setMeMode ? " active" : ""}`}
          title={setMeMode ? "Отменить ручную установку позиции" : "Указать моё положение вручную (для коррекции GPS)"}
          onClick={() => {
            // Включить ручной режим. Если был включён режим добавления POI — выключим, чтобы не путаться.
            if (addMode) setAddMode(false);
            setSetMeMode(!setMeMode);
          }}
        >
          {/* Пин + перекрестье — «поставить себя сюда» */}
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 21s-6-5.5-6-11a6 6 0 1 1 12 0c0 5.5-6 11-6 11z" />
            <line x1="12" y1="7" x2="12" y2="13" />
            <line x1="9" y1="10" x2="15" y2="10" />
          </svg>
        </button>
        <button
          className={`map-btn${tracking ? " active" : ""}`}
          title={tracking ? "Выключить отслеживание" : "Следить за моим положением"}
          onClick={async () => {
            if (tracking) {
              stopTracking();
              return;
            }
            try {
              // Сразу подлетаем к текущей точке, дальше watchPosition будет двигать карту
              const loc = await getMyPosition();
              flyTo(loc.lng, loc.lat, 16);
              startTracking();
            } catch (e) {
              setRouteError((e as Error).message);
            }
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <line x1="12" y1="2" x2="12" y2="5" />
            <line x1="12" y1="19" x2="12" y2="22" />
            <line x1="2" y1="12" x2="5" y2="12" />
            <line x1="19" y1="12" x2="22" y2="12" />
          </svg>
        </button>
        <button
          className="map-btn"
          title="Сбросить наклон и поворот"
          onClick={resetView}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 15 8 12 6 9 8 12 2" />
            <polygon points="12 22 15 16 12 18 9 16 12 22" />
            <line x1="12" y1="6" x2="12" y2="18" />
          </svg>
        </button>
        {/* Разделитель */}
        <div className="map-btn-divider" />
        {/* Зум + */}
        <button
          className="map-btn"
          title="Приблизить"
          onClick={() => mapRef.current?.zoomIn({ duration: 200 })}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        {/* Зум − */}
        <button
          className="map-btn"
          title="Отдалить"
          onClick={() => mapRef.current?.zoomOut({ duration: 200 })}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      <BootstrapPanel stack={stack} />

      {/* Маленький значок здоровья сервисов внизу слева, разворачивается по клику */}
      <button
        className={`stack-pill${stackOk ? " ok" : " warn"}`}
        onClick={() => {
          setDrawerTab("stack");
          setDrawerOpen(true);
        }}
        title="Состояние сервисов"
      >
        <span className="stack-pill-dot" />
        {upServices}/{totalServices}
      </button>

      {coord && (
        <div className="coord-readout">
          {coord.lat.toFixed(5)}, {coord.lng.toFixed(5)}
        </div>
      )}

      {(routing || route || routeError) && (
        <div className="route-panel">
          {routing && <div className="route-loading">Строю маршрут…</div>}
          {routeError && (
            <div className="route-error">
              {routeError}
              <button className="ghost" onClick={clearRoute}>×</button>
            </div>
          )}
          {route && !routing && (
            <>
              <div className="route-row">
                <div>
                  <div className="route-to" title={route.toLabel}>→ {route.toLabel}</div>
                  <div className="route-meta">
                    <b>{(route.distanceM / 1000).toFixed(2)} км</b>
                    <span>·</span>
                    <b>{Math.round(route.durationS / 60)} мин</b>
                    {route.steps && route.steps.length > 0 && (
                      <button
                        className="steps-toggle"
                        onClick={() => setStepsOpen(v => !v)}
                      >
                        {stepsOpen ? "▲ скрыть" : `▼ ${route.steps.length} шагов`}
                      </button>
                    )}
                    <span className="route-source">({route.source})</span>
                  </div>
                </div>
                <button className="ghost" title="Очистить маршрут" onClick={clearRoute}>×</button>
              </div>
              {stepsOpen && route.steps && route.steps.length > 0 && (
                <div className="route-steps">
                  {route.steps.map((s, i) => (
                    <div key={i} className="route-step">
                      <span className="step-num">{i + 1}</span>
                      <span className="step-text">{s.text}</span>
                      <span className="step-dist">
                        {s.distanceM >= 1000
                          ? `${(s.distanceM / 1000).toFixed(1)} км`
                          : `${Math.round(s.distanceM)} м`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Карточка-форма добавления точки — посередине внизу, поверх карты */}
      {draftPoint && (
        <div className="draft-panel">
          <div className="draft-header">
            <span>Новая точка</span>
            <span className="draft-coord">
              {draftPoint.lat.toFixed(5)}, {draftPoint.lng.toFixed(5)}
            </span>
          </div>
          <div className="draft-grid">
            <select value={draftType} onChange={(e) => setDraftType(e.target.value as PoiType)}>
              {POI_TYPES.map((t) => (
                <option key={t} value={t}>
                  {POI_TYPE_META[t].icon} {POI_TYPE_META[t].label}
                </option>
              ))}
            </select>
            <input
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              placeholder="Название (Подъезд 3, код 1234)"
              autoFocus
            />
          </div>
          <input
            value={draftAddr}
            onChange={(e) => setDraftAddr(e.target.value)}
            placeholder="Адрес (опционально)"
          />
          <textarea
            value={draftDesc}
            onChange={(e) => setDraftDesc(e.target.value)}
            placeholder="Заметки для курьера…"
            rows={2}
          />
          <div className="draft-actions">
            <button className="secondary" onClick={() => setDraftPoint(null)} disabled={saving}>
              Отмена
            </button>
            <button onClick={saveDraft} disabled={saving || !draftTitle.trim()}>
              {saving ? "Сохраняю…" : "Сохранить"}
            </button>
          </div>
        </div>
      )}

      {/* Выдвижная панель справа: точки / фильтр / стек */}
      {drawerOpen && (
        <>
          <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} />
          <aside className="drawer">
            <div className="drawer-header">
              <h2>Меню</h2>
              <button className="drawer-close" onClick={() => setDrawerOpen(false)}>
                ×
              </button>
            </div>
            <div className="drawer-tabs">
              <button
                className={drawerTab === "points" ? "active" : ""}
                onClick={() => setDrawerTab("points")}
              >
                Точки ({sortedPois.length})
              </button>
              <button
                className={drawerTab === "filter" ? "active" : ""}
                onClick={() => setDrawerTab("filter")}
              >
                Фильтр
              </button>
              <button
                className={drawerTab === "stack" ? "active" : ""}
                onClick={() => setDrawerTab("stack")}
              >
                Сервисы
              </button>
            </div>

            <div className="drawer-body">
              {drawerTab === "points" && (
                <div className="poi-list">
                  {sortedPois.length === 0 && <div className="empty-state">Пока нет точек</div>}
                  {sortedPois.map((p) => {
                    const meta = POI_TYPE_META[p.type];
                    return (
                      <div
                        key={p.id}
                        className="poi-card"
                        onClick={() => {
                          flyTo(p.lng, p.lat, 17);
                          setDrawerOpen(false);
                        }}
                      >
                        <div className="top">
                          <span
                            className="badge"
                            style={{ background: meta.color, color: "#0b0e12" }}
                          >
                            {meta.icon} {meta.label}
                          </span>
                          <span className="title">{p.title}</span>
                        </div>
                        {p.description && <div className="desc">{p.description}</div>}
                        {p.address && <div className="addr">{p.address}</div>}
                      </div>
                    );
                  })}
                </div>
              )}

              {drawerTab === "filter" && (
                <div className="drawer-section">
                  <p className="drawer-hint">
                    Скрыть/показать точки определённого типа на карте.
                  </p>
                  <div className="types">
                    {POI_TYPES.map((t) => {
                      const active = filterTypes.has(t);
                      return (
                        <button
                          key={t}
                          className={active ? "active" : ""}
                          onClick={() => {
                            const next = new Set(filterTypes);
                            if (active) next.delete(t);
                            else next.add(t);
                            setFilterTypes(next);
                          }}
                        >
                          {POI_TYPE_META[t].icon} {POI_TYPE_META[t].label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {drawerTab === "stack" && (
                <div className="drawer-section">
                  <p className="drawer-hint">Состояние гео-сервисов проекта.</p>
                  <ServiceRow label="PostGIS + h3" up={stack?.postgis.up} detail={stack?.postgis.detail} />
                  <ServiceRow
                    label="Martin (PMTiles)"
                    up={stack?.martin.up}
                    detail={stack?.martin.detail}
                    restartService="martin"
                  />
                  <ServiceRow
                    label="GraphHopper"
                    up={stack?.graphhopper.up}
                    detail={stack?.graphhopper.detail}
                    restartService="graphhopper"
                  />
                  <ServiceRow label="Pelias" up={stack?.pelias.up} detail={stack?.pelias.detail} />
                  <div className="basemap-source">
                    Базовая карта:{" "}
                    {stack?.basemap.source === "pmtiles_martin"
                      ? "PMTiles (Martin)"
                      : "OSM raster (fallback)"}
                  </div>
                </div>
              )}
            </div>
          </aside>
        </>
      )}
    </div>
  );
}

function ServiceRow({
  label,
  up,
  detail,
  restartService,
}: {
  label: string;
  up?: boolean;
  detail?: string | null;
  restartService?: string;
}) {
  const [restarting, setRestarting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function handleRestart() {
    if (restarting) return;
    setRestarting(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/admin/restart/${restartService}`, { method: "POST" });
      const json = await r.json();
      setMsg(r.ok ? "Перезапускается…" : (json.error ?? "Ошибка"));
    } catch {
      setMsg("Нет связи с API");
    } finally {
      setTimeout(() => {
        setRestarting(false);
        setMsg(null);
      }, 12_000);
    }
  }

  return (
    <div className="row svc-row">
      <span className={`dot ${up ? "up" : ""}`} />
      <span className="label">{label}</span>
      {detail && <span className="detail" title={detail}>●</span>}
      {restartService && (
        <button
          className={`svc-restart-btn${restarting ? " spinning" : ""}${!up ? " warn" : ""}`}
          onClick={handleRestart}
          disabled={restarting}
          title={restarting ? "Перезапускается…" : "Перезапустить сервис"}
        >
          ↺
        </button>
      )}
      {msg && <span className="svc-restart-msg">{msg}</span>}
    </div>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
