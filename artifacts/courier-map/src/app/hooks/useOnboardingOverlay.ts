import { useEffect, useRef } from "react";
import type { Map as MlMap, GeoJSONSource } from "maplibre-gl";
import { DISTRICTS } from "../data/districts";
import { circleRing, RADIUS_KM } from "./useWarehouseRadius";
import type { TileBounds } from "../utils/tileUtils";

function bboxRing(b: TileBounds): [number, number][] {
  return [
    [b.west, b.south], [b.east, b.south],
    [b.east, b.north], [b.west, b.north],
    [b.west, b.south],
  ];
}

// Внешнее кольцо "мира" — CCW (right-hand rule для outer polygon)
const WORLD_RING: [number, number][] = [
  [-180, -90], [-180, 90], [180, 90], [180, -90], [-180, -90],
];

function districtFeatures(hoveredId: string | null, inRadiusIds: string[]) {
  const list = inRadiusIds.length > 0
    ? DISTRICTS.filter(d => inRadiusIds.includes(d.id))
    : DISTRICTS;
  return list.map(d => ({
    type: "Feature" as const,
    properties: { id: d.id, hovered: d.id === hoveredId },
    geometry: { type: "Polygon" as const, coordinates: [bboxRing(d.bounds)] },
  }));
}

const OB_LAYERS  = ["ob-fog-fill", "ob-all-dist-fill", "ob-all-dist-line", "ob-circle-fill", "ob-circle-border", "ob-warehouse-halo", "ob-warehouse-dot"];
const OB_SOURCES = ["ob-fog", "ob-all-districts", "ob-circle", "ob-warehouse"];

export function useOnboardingOverlay(
  mapRef:          React.RefObject<MlMap | null>,
  warehouseCoords: [number, number] | null,
  hoveredId:       string | null,
  inRadiusIds:     string[],
) {
  const coordsKey   = warehouseCoords ? warehouseCoords.join(",") : "null";
  const inRadiusKey = inRadiusIds.join(",");

  const hoveredRef   = useRef<string | null>(null);
  const inRadiusRef  = useRef<string[]>([]);
  hoveredRef.current  = hoveredId;
  inRadiusRef.current = inRadiusIds;

  // ── Устанавливаем/убираем слои при изменении адреса или набора районов ──────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const cleanup = () => {
      OB_LAYERS .forEach(id => { try { if (map.getLayer(id))   map.removeLayer(id);   } catch {} });
      OB_SOURCES.forEach(id => { try { if (map.getSource(id)) map.removeSource(id); } catch {} });
    };

    const install = () => {
      cleanup();
      if (!warehouseCoords) return;

      const ring     = circleRing(warehouseCoords, RADIUS_KM);
      // Дырка в тумане: обратный порядок кольца (CW для inner ring в GeoJSON)
      const holeRing = [...ring].reverse() as [number, number][];

      // Туман: весь мир минус круг 6 км
      map.addSource("ob-fog", {
        type: "geojson",
        data: {
          type: "Feature", properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [WORLD_RING, holeRing],
          },
        },
      });

      map.addSource("ob-all-districts", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: districtFeatures(hoveredRef.current, inRadiusRef.current),
        },
      });
      map.addSource("ob-circle", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } }],
        },
      });
      map.addSource("ob-warehouse", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: warehouseCoords } }],
        },
      });

      // Туман затемняет всё снаружи
      map.addLayer({
        id: "ob-fog-fill", type: "fill", source: "ob-fog",
        paint: { "fill-color": "#000b18", "fill-opacity": 0.75 },
      });

      // Районы внутри зоны: слабый цвет + при наведении — яркий
      map.addLayer({
        id: "ob-all-dist-fill", type: "fill", source: "ob-all-districts",
        paint: {
          "fill-color": ["case", ["==", ["get", "hovered"], true], "#3b82f6", "#1e3a5f"],
          "fill-opacity": ["case", ["==", ["get", "hovered"], true], 0.30, 0.08],
        },
      });
      map.addLayer({
        id: "ob-all-dist-line", type: "line", source: "ob-all-districts",
        paint: {
          "line-color": ["case", ["==", ["get", "hovered"], true], "#60a5fa", "#2563eb"],
          "line-width":  ["case", ["==", ["get", "hovered"], true], 2.5, 1.5],
          "line-opacity": ["case", ["==", ["get", "hovered"], true], 1.0, 0.6],
        },
      });

      // Пунктирная граница круга 6 км
      map.addLayer({
        id: "ob-circle-fill", type: "fill", source: "ob-circle",
        paint: { "fill-color": "#3b82f6", "fill-opacity": 0.04 },
      });
      map.addLayer({
        id: "ob-circle-border", type: "line", source: "ob-circle",
        paint: { "line-color": "#3b82f6", "line-width": 2, "line-dasharray": [4, 3], "line-opacity": 0.85 },
      });

      // Маркер цеха
      map.addLayer({
        id: "ob-warehouse-halo", type: "circle", source: "ob-warehouse",
        paint: { "circle-radius": 16, "circle-color": "#f59e0b", "circle-opacity": 0.20 },
      });
      map.addLayer({
        id: "ob-warehouse-dot", type: "circle", source: "ob-warehouse",
        paint: {
          "circle-radius": 7,
          "circle-color": "#f59e0b",
          "circle-stroke-color": "#fef3c7",
          "circle-stroke-width": 2.5,
        },
      });
    };

    if (map.isStyleLoaded()) install();
    else map.once("style.load", install);

    return () => {
      OB_LAYERS .forEach(id => { try { if (mapRef.current?.getLayer(id))   mapRef.current.removeLayer(id);   } catch {} });
      OB_SOURCES.forEach(id => { try { if (mapRef.current?.getSource(id)) mapRef.current.removeSource(id); } catch {} });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coordsKey, inRadiusKey]);

  // ── Обновляем hover-подсветку без переустановки слоёв ─────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource("ob-all-districts") as GeoJSONSource | undefined;
    if (!src) return;
    src.setData({ type: "FeatureCollection", features: districtFeatures(hoveredId, inRadiusRef.current) });
  }, [hoveredId, mapRef]);
}
