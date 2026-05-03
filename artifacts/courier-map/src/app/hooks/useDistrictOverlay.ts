import { useState, useEffect, useRef } from "react";
import type { Map as MlMap, GeoJSONSource, MapMouseEvent } from "maplibre-gl";
import { districtById } from "../data/districts";
import type { MapSetup } from "./useMapSetup";
import type { TileBounds } from "../utils/tileUtils";

function bboxRing(b: TileBounds): number[][] {
  return [
    [b.west, b.south],
    [b.east, b.south],
    [b.east, b.north],
    [b.west, b.north],
    [b.west, b.south],
  ];
}

function maskFeature(selectedIds: string[]) {
  // Большой прямоугольник с «дырами» для каждого выбранного района.
  // Заливка покрывает всё кроме выбранных зон.
  const world = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];
  const holes = selectedIds
    .map(id => districtById(id)?.bounds)
    .filter(Boolean)
    .map(b => bboxRing(b!));
  return {
    type: "Feature" as const,
    properties: {},
    geometry: { type: "Polygon" as const, coordinates: [world, ...holes] },
  };
}

function zoneFeatures(selectedIds: string[], activeId: string | null) {
  return selectedIds.flatMap(id => {
    const d = districtById(id);
    if (!d) return [];
    return [{
      type: "Feature" as const,
      properties: { id, name: d.name, active: id === activeId },
      geometry: { type: "Polygon" as const, coordinates: [bboxRing(d.bounds)] },
    }];
  });
}

const LAYERS  = ["district-mask-fill", "district-zones-dim", "district-zones-raise", "district-zones-border", "district-zones-label"];
const SOURCES = ["district-mask", "district-zones"];

export function useDistrictOverlay(
  mapRef: React.RefObject<MlMap | null>,
  setup: MapSetup,
) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = setup.done && setup.mode === "districts" && setup.selectedIds.length > 0;
  const idsKey = setup.selectedIds.join(",");

  // ── Установка слоёв ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!active) return;
    const map = mapRef.current;
    if (!map) return;

    const install = () => {
      LAYERS .forEach(id => { try { if (map.getLayer(id))   map.removeLayer(id);   } catch {} });
      SOURCES.forEach(id => { try { if (map.getSource(id)) map.removeSource(id); } catch {} });

      map.addSource("district-mask", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [maskFeature(setup.selectedIds)] },
      });
      map.addSource("district-zones", {
        type: "geojson",
        data: { type: "FeatureCollection", features: zoneFeatures(setup.selectedIds, null) },
      });

      // Тёмная маска — везде кроме выбранных районов
      map.addLayer({
        id: "district-mask-fill", type: "fill", source: "district-mask",
        paint: { "fill-color": "#050d1a", "fill-opacity": 0.68 },
      });

      // Лёгкое затемнение неактивных выбранных районов
      map.addLayer({
        id: "district-zones-dim", type: "fill", source: "district-zones",
        filter: ["==", ["get", "active"], false],
        paint: { "fill-color": "#0a1628", "fill-opacity": 0.28 },
      });

      // 3D-подъём активного района
      map.addLayer({
        id: "district-zones-raise", type: "fill-extrusion", source: "district-zones",
        filter: ["==", ["get", "active"], true],
        paint: {
          "fill-extrusion-color": "#3b82f6",
          "fill-extrusion-height": 900,
          "fill-extrusion-base": 0,
          "fill-extrusion-opacity": 0.22,
          "fill-extrusion-vertical-gradient": false,
        },
      });

      // Граница районов
      map.addLayer({
        id: "district-zones-border", type: "line", source: "district-zones",
        paint: {
          "line-color": ["case", ["==", ["get", "active"], true], "#60a5fa", "#1e3a5f"],
          "line-width": ["case", ["==", ["get", "active"], true], 2.5, 1.2],
          "line-opacity": ["case", ["==", ["get", "active"], true], 1, 0.55],
        },
      });

      // Название района по центру полигона
      map.addLayer({
        id: "district-zones-label", type: "symbol", source: "district-zones",
        layout: {
          "text-field": ["get", "name"],
          "text-size": 13,
          "text-anchor": "center",
          "text-justify": "center",
          "symbol-placement": "point",
          "text-allow-overlap": false,
          "text-ignore-placement": false,
        },
        paint: {
          "text-color": ["case", ["==", ["get", "active"], true], "#93c5fd", "#2e4d6a"],
          "text-halo-color": "#020913",
          "text-halo-width": 2,
        },
      });
    };

    if (map.isStyleLoaded()) install();
    else map.once("style.load", install);

    return () => {
      LAYERS .forEach(id => { try { if (mapRef.current?.getLayer(id))   mapRef.current.removeLayer(id);   } catch {} });
      SOURCES.forEach(id => { try { if (mapRef.current?.getSource(id)) mapRef.current.removeSource(id); } catch {} });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, idsKey]);

  // ── Обновляем данные при смене активного района ────────────────────────────
  useEffect(() => {
    if (!active) return;
    const map = mapRef.current;
    if (!map?.getSource("district-zones")) return;
    (map.getSource("district-zones") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: zoneFeatures(setup.selectedIds, activeId),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, active, idsKey]);

  // ── Клик по карте → выбрать/снять район ───────────────────────────────────
  useEffect(() => {
    if (!active) return;
    const map = mapRef.current;
    if (!map) return;

    const handler = (e: MapMouseEvent) => {
      // Не перехватываем клики по POI / зданиям — уже обработаны
      const hits = map.queryRenderedFeatures(e.point, {
        layers: ["pois-icons", "pois-clusters", "buildings"],
      });
      if (hits.length > 0) return;

      const { lng, lat } = e.lngLat;
      const hit = setup.selectedIds.find(id => {
        const d = districtById(id);
        if (!d) return false;
        return lng >= d.bounds.west && lng <= d.bounds.east &&
               lat >= d.bounds.south && lat <= d.bounds.north;
      }) ?? null;

      setActiveId(prev => prev === hit ? null : hit);
    };

    map.on("click", handler);
    return () => { map.off("click", handler); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, idsKey]);

  return { activeDistrictId: activeId, setActiveDistrictId: setActiveId };
}
