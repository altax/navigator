import { useEffect, useRef } from "react";
import type { Map as MlMap, GeoJSONSource } from "maplibre-gl";
import { DISTRICTS } from "../data/districts";
import { circleRing, RADIUS_KM } from "./useWarehouseRadius";
import type { TileBounds } from "../utils/tileUtils";

function bboxRing(b: TileBounds): [number, number][] {
  return [
    [b.west,  b.south],
    [b.east,  b.south],
    [b.east,  b.north],
    [b.west,  b.north],
    [b.west,  b.south],
  ];
}

function districtFeatures(hoveredId: string | null) {
  return DISTRICTS.map(d => ({
    type: "Feature" as const,
    properties: { id: d.id, hovered: d.id === hoveredId },
    geometry:   { type: "Polygon" as const, coordinates: [bboxRing(d.bounds)] },
  }));
}

const OB_LAYERS  = ["ob-all-dist-fill", "ob-all-dist-line", "ob-circle-fill", "ob-circle-border", "ob-warehouse-halo", "ob-warehouse-dot"];
const OB_SOURCES = ["ob-all-districts", "ob-circle", "ob-warehouse"];

export function useOnboardingOverlay(
  mapRef:          React.RefObject<MlMap | null>,
  warehouseCoords: [number, number] | null,
  hoveredId:       string | null,
) {
  const coordsKey  = warehouseCoords ? warehouseCoords.join(",") : "null";
  const hoveredRef = useRef<string | null>(null);
  hoveredRef.current = hoveredId;

  // ── Install / remove layers when warehouseCoords changes ──────────────────
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

      const ring = circleRing(warehouseCoords, RADIUS_KM);

      map.addSource("ob-all-districts", {
        type: "geojson",
        data: { type: "FeatureCollection", features: districtFeatures(hoveredRef.current) },
      });
      map.addSource("ob-circle", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [{
            type: "Feature", properties: {},
            geometry: { type: "Polygon", coordinates: [ring] },
          }],
        },
      });
      map.addSource("ob-warehouse", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [{
            type: "Feature", properties: {},
            geometry: { type: "Point", coordinates: warehouseCoords },
          }],
        },
      });

      // Все районы — очень слабые заливки + линия
      map.addLayer({
        id: "ob-all-dist-fill", type: "fill", source: "ob-all-districts",
        paint: {
          "fill-color": ["case", ["==", ["get", "hovered"], true], "#3b82f6", "#1e3a5f"],
          "fill-opacity": ["case", ["==", ["get", "hovered"], true], 0.18, 0.04],
        },
      });
      map.addLayer({
        id: "ob-all-dist-line", type: "line", source: "ob-all-districts",
        paint: {
          "line-color": ["case", ["==", ["get", "hovered"], true], "#60a5fa", "#1e3a5f"],
          "line-width": ["case", ["==", ["get", "hovered"], true], 2, 1],
          "line-opacity": ["case", ["==", ["get", "hovered"], true], 0.9, 0.35],
        },
      });

      // Круг 6 км
      map.addLayer({
        id: "ob-circle-fill", type: "fill", source: "ob-circle",
        paint: { "fill-color": "#3b82f6", "fill-opacity": 0.07 },
      });
      map.addLayer({
        id: "ob-circle-border", type: "line", source: "ob-circle",
        paint: { "line-color": "#3b82f6", "line-width": 2, "line-dasharray": [4, 3], "line-opacity": 0.75 },
      });

      // Маркер цеха
      map.addLayer({
        id: "ob-warehouse-halo", type: "circle", source: "ob-warehouse",
        paint: { "circle-radius": 14, "circle-color": "#f59e0b", "circle-opacity": 0.18 },
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
      // eslint-disable-next-line react-hooks/exhaustive-deps
      OB_LAYERS .forEach(id => { try { if (mapRef.current?.getLayer(id))   mapRef.current.removeLayer(id);   } catch {} });
      OB_SOURCES.forEach(id => { try { if (mapRef.current?.getSource(id)) mapRef.current.removeSource(id); } catch {} });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coordsKey]);

  // ── Update hover highlight without reinstalling layers ─────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource("ob-all-districts") as GeoJSONSource | undefined;
    if (!src) return;
    src.setData({ type: "FeatureCollection", features: districtFeatures(hoveredId) });
  }, [hoveredId, mapRef]);
}
