import { useEffect, useRef, useState, useCallback } from "react";
import maplibregl, { Map as MlMap, type MapLayerMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { POI_TYPE_META } from "./types";
import type { PoiType } from "./types";
import { api } from "./api";
import { BootstrapPanel } from "./BootstrapPanel";
import { buildStyle, SPB_CENTER, DASH_SEQUENCE } from "./mapStyle";
import { drawPoiPin, drawMetroIcon, drawMetroEntranceIcon, drawZebraIcon } from "./mapIcons";
import { useStack } from "./hooks/useStack";
import { usePois } from "./hooks/usePois";
import { useSearch } from "./hooks/useSearch";
import { useTracking } from "./hooks/useTracking";
import { useRoute } from "./hooks/useRoute";
import { useDraft } from "./hooks/useDraft";
import { useDownloadQueue } from "./hooks/useDownloadQueue";
import { useDownloadedZones } from "./hooks/useDownloadedZones";
import { useMapSetup } from "./hooks/useMapSetup";
import { useDistrictOverlay } from "./hooks/useDistrictOverlay";
import { useOnboardingOverlay } from "./hooks/useOnboardingOverlay";
import { OnboardingScreen } from "./components/OnboardingScreen";
import { SearchBar } from "./components/SearchBar";
import { RoutePanel } from "./components/RoutePanel";
import { DraftPanel } from "./components/DraftPanel";
import { MapControls } from "./components/MapControls";
import { DrawerPanel } from "./components/DrawerPanel";

const POI_TYPES = Object.keys(POI_TYPE_META) as PoiType[];

export default function App() {
  const mapRef = useRef<MlMap | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const { stack } = useStack();
  const { pois, sortedPois, filterTypes, setFilterTypes, reloadPois } = usePois();
  const { search, setSearch, searchResults, setSearchResults, parsedQuery, searchSource, searchFocused, setSearchFocused, suppressNextSearch, shortLabel } = useSearch();
  const { myLocation, setMyLocation, tracking, startTracking, stopTracking, getMyPosition } = useTracking();
  const { route, routing, routeError, setRouteError, stepsOpen, setStepsOpen, routeFromMe, clearRoute } = useRoute(mapRef, myLocation, getMyPosition);
  const { draftPoint, setDraftPoint, draftType, setDraftType, draftTitle, setDraftTitle, draftDesc, setDraftDesc, draftAddr, setDraftAddr, saving, saveError, saveDraft, cancelDraft, addMode, setAddMode } = useDraft(reloadPois);
  const { zones, addZone, removeZone, clearAll: clearZones } = useDownloadedZones();
  const { enqueue: enqueueDownload, dequeue: dequeueDownload, cancelAll: cancelAllDownloads, status: downloadStatus, pendingQueue } = useDownloadQueue(mapRef, addZone);
  const { setup, completeSetup, resetSetup } = useMapSetup();
  useDistrictOverlay(mapRef, setup);

  const [obWarehouse, setObWarehouse] = useState<[number, number] | null>(null);
  const [obHovered,   setObHovered]   = useState<string | null>(null);
  const [obInRadius,  setObInRadius]  = useState<string[]>([]);
  useOnboardingOverlay(mapRef, setup.done ? null : obWarehouse, obHovered, setup.done ? [] : obInRadius);

  const [coord, setCoord] = useState<{ lng: number; lat: number } | null>(null);
  const [webglError, setWebglError] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<"points" | "filter" | "zones" | "stack">("points");
  const [selectedBuildingInfo, setSelectedBuildingInfo] = useState<{ label: string } | null>(null);
  const [setMeMode, setSetMeMode] = useState(false);

  const basemapKey = stack?.basemap.source ?? "pmtiles_martin";
  const stackRef = useRef(stack);
  stackRef.current = stack;
  const prevBasemapKeyRef = useRef<string>("");

  // ── Map init ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    // setWorkerCount / prewarm / setMaxParallelImageRequests вызваны в main.tsx
    // до рендера React — здесь повторять не нужно.
    let map: MlMap;
    try {
      // Определяем «слабое» железо: ≤ 2 ядра или ≤ 2 ГБ RAM.
      const weakDevice =
        (navigator.hardwareConcurrency ?? 4) <= 2 ||
        ((navigator as { deviceMemory?: number }).deviceMemory ?? 4) <= 2;

      map = new maplibregl.Map({
        container: containerRef.current,
        style: buildStyle(stack),
        center: SPB_CENTER,
        zoom: 14,
        pitch: weakDevice ? 0 : 35,
        maxPitch: 65,
        bearing: 0,
        maxBounds: [27.0, 58.0, 34.0, 61.8],
        attributionControl: { compact: true },
        touchPitch: true,
        cooperativeGestures: false,
        fadeDuration: 0,
        // antialias: false — значительно снижает нагрузку на GPU при шейдерном
        // рендере. Для карты курьера визуальная разница незаметна.
        antialias: false,
        maxTileCacheSize: weakDevice ? 400 : 800,
        crossSourceCollisions: false,
        refreshExpiredTiles: false,
        localIdeographFontFamily: "",
        // На слабом железе ограничиваем pixelRatio = 1: рендерим в нативных
        // пикселях браузера, без апскейлинга. На сильном — до 2× для чёткости.
        pixelRatio: weakDevice ? 1 : Math.min(window.devicePixelRatio || 1, 2),
      });

    } catch (e) {
      console.error("MapLibre init failed:", e);
      setWebglError(true);
      return;
    }
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");
    map.on("mousemove", (e) => setCoord({ lng: e.lngLat.lng, lat: e.lngLat.lat }));
    map.on("error", (e) => {
      const err = (e as { error?: Error })?.error;
      if (err?.message?.toLowerCase().includes("webgl")) setWebglError(true);
    });
    mapRef.current = map;

    // ── Predictive tile prefetch ─────────────────────────────────────────────
    // Вычисляем тайлы за краем экрана (буфер 2 ряда) и подгружаем их фоном.
    // Service Worker кеширует их; когда курьер туда скроллит — тайлы уже готовы.
    const tileCoord = (lng: number, lat: number, z: number) => {
      const n = 1 << z;
      const x = Math.floor(((lng + 180) / 360) * n);
      const latR = (lat * Math.PI) / 180;
      const y = Math.floor(
        ((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n,
      );
      return { x: Math.max(0, Math.min(n - 1, x)), y: Math.max(0, Math.min(n - 1, y)) };
    };

    let prefetchRaf: ReturnType<typeof setTimeout> | null = null;
    const schedulePrefetch = () => {
      if (prefetchRaf) clearTimeout(prefetchRaf);
      prefetchRaf = setTimeout(() => {
        const m = mapRef.current;
        if (!m) return;
        const b = m.getBounds();
        const rawZ = m.getZoom();
        const buf = 2; // тайлов за краем
        const urls: string[] = [];

        for (const z of [Math.floor(rawZ), Math.max(10, Math.floor(rawZ) - 1)]) {
          const nw = tileCoord(b.getWest(), b.getNorth(), z);
          const se = tileCoord(b.getEast(), b.getSouth(), z);
          for (let tx = nw.x - buf; tx <= se.x + buf; tx++) {
            for (let ty = nw.y - buf; ty <= se.y + buf; ty++) {
              // пропускаем тайлы внутри viewport — их MapLibre уже запрашивает сам
              if (tx >= nw.x && tx <= se.x && ty >= nw.y && ty <= se.y) continue;
              const n = 1 << z;
              if (tx < 0 || ty < 0 || tx >= n || ty >= n) continue;
              urls.push(`/api/tiles/spb-lo/${z}/${tx}/${ty}`);
            }
          }
        }

        // Подгружаем с низким приоритетом, не мешая основным запросам карты
        urls.forEach((url) =>
          fetch(url, { priority: "low" } as RequestInit).catch(() => {}),
        );
      }, 300);
    };

    map.on("moveend", schedulePrefetch);
    map.on("zoomend", schedulePrefetch);
    schedulePrefetch(); // прогрев при старте

    return () => {
      if (prefetchRaf) clearTimeout(prefetchRaf);
      try { map.remove(); } catch {}
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Basemap style switch ───────────────────────────────────────────────────
  useEffect(() => {
    const prev = prevBasemapKeyRef.current;
    prevBasemapKeyRef.current = basemapKey;
    if (!prev || prev === basemapKey) return;
    if (!mapRef.current) return;
    mapRef.current.setStyle(buildStyle(stackRef.current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basemapKey]);

  // ── POI source + route + me-marker layers ─────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const setupLayers = () => {
      if (map.getSource("pois")) return;
      map.addSource("pois", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        cluster: true,
        clusterMaxZoom: 15,
        clusterRadius: 45,
      });
      map.addLayer({ id: "pois-clusters", type: "circle", source: "pois", filter: ["has", "point_count"],
        paint: {
          "circle-color": ["step", ["get", "point_count"], "#1d4ed8", 5, "#1e40af", 20, "#1e3a8a"],
          "circle-radius": ["step", ["get", "point_count"], 16, 5, 22, 20, 28],
          "circle-stroke-width": 2.5, "circle-stroke-color": "#ffffff", "circle-opacity": 0.92,
        },
      });
      map.addLayer({ id: "pois-cluster-count", type: "symbol", source: "pois", filter: ["has", "point_count"],
        layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": ["Noto Sans Bold"], "text-size": 13 },
        paint: { "text-color": "#ffffff" },
      });
      map.addLayer({ id: "pois-icons", type: "symbol", source: "pois", filter: ["!", ["has", "point_count"]],
        layout: { "icon-image": ["concat", "poi-pin-", ["get", "type"]], "icon-size": 1, "icon-allow-overlap": true, "icon-anchor": "bottom" as const },
      });
      map.addLayer({ id: "pois-labels", type: "symbol", source: "pois", filter: ["!", ["has", "point_count"]], minzoom: 14,
        layout: {
          "text-field": ["get", "title"], "text-font": ["Noto Sans Bold"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 14, 10, 18, 14],
          "text-offset": [0, 0.3], "text-anchor": "top", "text-padding": 3,
          "text-max-width": 9, "text-allow-overlap": false,
        },
        paint: { "text-color": "#ffffff", "text-halo-color": "#0e1116", "text-halo-width": 1.6 },
      });
      map.addSource("route", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "route-casing", type: "line", source: "route",
        paint: { "line-color": "#0b1620", "line-width": ["interpolate", ["linear"], ["zoom"], 10, 6, 16, 10], "line-opacity": 0.9 },
        layout: { "line-cap": "round", "line-join": "round" },
      }, "pois-clusters");
      map.addLayer({ id: "route-line", type: "line", source: "route",
        paint: { "line-color": "#3b82f6", "line-width": ["interpolate", ["linear"], ["zoom"], 10, 3, 16, 6], "line-opacity": 0.85 },
        layout: { "line-cap": "round", "line-join": "round" },
      }, "pois-clusters");
      map.addLayer({ id: "route-line-dash", type: "line", source: "route",
        paint: { "line-color": "#93c5fd", "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2, 16, 4], "line-dasharray": [0, 4, 3] },
        layout: { "line-cap": "butt", "line-join": "round" },
      }, "pois-clusters");
      map.addSource("me", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "me-accuracy", type: "circle", source: "me",
        paint: { "circle-radius": ["get", "accuracyPx"], "circle-color": "#3b82f6", "circle-opacity": 0.12, "circle-stroke-color": "#3b82f6", "circle-stroke-opacity": 0.4, "circle-stroke-width": 1 },
      });
      map.addLayer({ id: "me-dot", type: "circle", source: "me",
        paint: { "circle-radius": 7, "circle-color": "#3b82f6", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2.5 },
      });
    };
    if (map.isStyleLoaded()) setupLayers();
    else map.once("style.load", setupLayers);
  }, [basemapKey]);

  // ── Zebra crossing icon ────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const install = () => {
      if (map.hasImage("zebra-icon")) return;
      try { map.addImage("zebra-icon", drawZebraIcon(), { pixelRatio: 2 }); }
      catch (e) { console.warn("zebra-icon:", e); }
    };
    if (map.isStyleLoaded()) install(); else map.once("style.load", install);
  }, [basemapKey]);

  // ── POI pin icons ──────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const install = () => {
      for (const t of POI_TYPES) {
        const name = `poi-pin-${t}`;
        if (map.hasImage(name)) continue;
        try { map.addImage(name, drawPoiPin(t), { pixelRatio: 2 }); }
        catch (e) { console.warn(`poi-pin-${t}:`, e); }
      }
    };
    if (map.isStyleLoaded()) install(); else map.once("style.load", install);
  }, [basemapKey]);

  // ── Metro icons ────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const install = () => {
      if (!map.hasImage("metro-icon")) {
        try { map.addImage("metro-icon", drawMetroIcon(), { pixelRatio: 2 }); }
        catch (e) { console.warn("metro-icon:", e); }
      }
      if (!map.hasImage("metro-entrance-icon")) {
        try { map.addImage("metro-entrance-icon", drawMetroEntranceIcon(), { pixelRatio: 2 }); }
        catch (e) { console.warn("metro-entrance-icon:", e); }
      }
    };
    if (map.isStyleLoaded()) install(); else map.once("style.load", install);
  }, [basemapKey]);

  // ── POI data update ────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const src = map.getSource("pois") as maplibregl.GeoJSONSource | undefined;
      if (!src) return;
      src.setData({
        type: "FeatureCollection",
        features: pois.filter((p) => filterTypes.has(p.type)).map((p) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [p.lng, p.lat] },
          properties: { id: p.id, type: p.type, title: p.title },
        })),
      });
    };
    if (map.isStyleLoaded() && map.getSource("pois")) apply();
    else map.once("idle", apply);
  }, [pois, filterTypes, basemapKey]);

  // ── Route GeoJSON ──────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const src = map.getSource("route") as maplibregl.GeoJSONSource | undefined;
      if (!src) return;
      if (!route) { src.setData({ type: "FeatureCollection", features: [] }); return; }
      src.setData({ type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: route.coordinates } }] });
    };
    if (map.isStyleLoaded() && map.getSource("route")) apply();
    else map.once("idle", apply);
  }, [route, basemapKey]);

  // ── Ant-march animation ────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (animFrameRef.current != null) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null; }
    if (!route) return;
    let step = 0;
    const animate = (ts: number) => {
      const newStep = Math.floor(ts / 55) % DASH_SEQUENCE.length;
      if (newStep !== step) {
        step = newStep;
        if (map.getLayer("route-line-dash")) map.setPaintProperty("route-line-dash", "line-dasharray", DASH_SEQUENCE[step]);
      }
      animFrameRef.current = requestAnimationFrame(animate);
    };
    animFrameRef.current = requestAnimationFrame(animate);
    return () => { if (animFrameRef.current != null) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null; } };
  }, [route, basemapKey]);

  // ── "Me" marker ───────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const src = map.getSource("me") as maplibregl.GeoJSONSource | undefined;
      if (!src) return;
      if (!myLocation) { src.setData({ type: "FeatureCollection", features: [] }); return; }
      const z = map.getZoom();
      const metersPerPixel = (40075016.686 * Math.cos((myLocation.lat * Math.PI) / 180)) / Math.pow(2, z + 8);
      const accuracyPx = Math.min(80, Math.max(8, myLocation.accuracy / Math.max(0.5, metersPerPixel)));
      src.setData({
        type: "FeatureCollection",
        features: [{ type: "Feature", properties: { accuracyPx, heading: myLocation.heading ?? -1, hasHeading: myLocation.heading != null ? 1 : 0 }, geometry: { type: "Point", coordinates: [myLocation.lng, myLocation.lat] } }],
      });
    };
    if (map.isStyleLoaded() && map.getSource("me")) apply();
    else map.once("idle", apply);
  }, [myLocation, basemapKey]);

  // ── Building dim when route is active ─────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const dimmed = !!route;
      if (map.getLayer("housenumbers")) {
        map.setPaintProperty("housenumbers", "text-opacity", dimmed ? 0.22 : ["interpolate", ["linear"], ["zoom"], 12, 0.5, 13, 1]);
        map.setPaintProperty("housenumbers", "text-halo-width", dimmed ? 0.6 : ["interpolate", ["linear"], ["zoom"], 12, 1.5, 17, 3]);
      }
      if (map.getLayer("buildings")) {
        map.setPaintProperty("buildings", "fill-opacity", dimmed
          ? ["interpolate", ["linear"], ["zoom"], 13, 0.42, 16, 0.6]
          : ["interpolate", ["linear"], ["zoom"], 13, 0.7, 16, 1]);
      }
      if (map.getLayer("buildings-3d")) map.setPaintProperty("buildings-3d", "fill-extrusion-opacity", dimmed ? 0.55 : 0.92);
    };
    if (map.isStyleLoaded()) apply(); else map.once("idle", apply);
  }, [route, basemapKey]);

  // ── Selected-building helper ───────────────────────────────────────────────
  const setSelectedBuilding = useCallback((feature: GeoJSON.Feature | null, label: string | null) => {
    const src = mapRef.current?.getSource("selected-building") as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    if (feature) {
      src.setData({ type: "FeatureCollection", features: [feature] });
      setSelectedBuildingInfo({ label: label || "Здание" });
    } else {
      src.setData({ type: "FeatureCollection", features: [] });
      setSelectedBuildingInfo(null);
    }
  }, []);

  const buildBuildingLabel = (props: Record<string, string | number | undefined>): string => {
    const housenumber = props["addr:housenumber"];
    const street = props["addr:street"];
    const name = props["name"];
    if (street && housenumber) return `${street}, ${housenumber}`;
    if (housenumber) return `№ ${housenumber}`;
    if (name) return String(name);
    return "Здание";
  };

  const highlightBuildingAt = (lng: number, lat: number) => {
    const map = mapRef.current;
    if (!map) return;
    const tryHighlight = () => {
      const pt = map.project([lng, lat]);
      const feats = map.queryRenderedFeatures([[pt.x - 8, pt.y - 8], [pt.x + 8, pt.y + 8]], { layers: ["buildings"] });
      if (feats.length > 0) {
        const f = feats[0];
        setSelectedBuilding(f as unknown as GeoJSON.Feature, buildBuildingLabel((f.properties || {}) as Record<string, string | number | undefined>));
      }
    };
    setTimeout(tryHighlight, 850);
    setTimeout(tryHighlight, 1400);
  };

  const flyTo = (lng: number, lat: number, zoom = 16, highlightBuilding = false) => {
    mapRef.current?.flyTo({ center: [lng, lat], zoom, duration: 800 });
    if (highlightBuilding) highlightBuildingAt(lng, lat);
  };

  const resetView = () => mapRef.current?.easeTo({ pitch: 35, bearing: 0, duration: 600 });

  // ── Click handlers ─────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onClick = (e: MapLayerMouseEvent) => {
      if (setMeMode) {
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
        const popup = new maplibregl.Popup({ offset: 12, closeButton: true }).setLngLat([poi.lng, poi.lat]).setHTML(html).addTo(map);
        const el = popup.getElement();
        el.querySelector('[data-action="route"]')?.addEventListener("click", (ev) => {
          ev.stopPropagation();
          popup.remove();
          routeFromMe({ lng: poi.lng, lat: poi.lat }, `${meta.icon} ${poi.title}`);
        });
        el.querySelector('[data-action="delete"]')?.addEventListener("click", async (ev) => {
          ev.stopPropagation();
          if (!confirm("Удалить эту точку?")) return;
          try {
            await api.deletePoi(poi.id);
            popup.remove();
            reloadPois();
          } catch (e) {
            alert(`Не удалось удалить точку: ${(e as Error).message ?? "неизвестная ошибка"}`);
          }
        });
        return;
      }
      const buildingFeats = map.queryRenderedFeatures(e.point, { layers: ["buildings"] });
      if (buildingFeats.length > 0) {
        const f = buildingFeats[0];
        const props = (f.properties || {}) as Record<string, string | number | undefined>;
        const headline = buildBuildingLabel(props);
        setSelectedBuilding(f as unknown as GeoJSON.Feature, headline);
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
        const popup = new maplibregl.Popup({ offset: 8, closeButton: true }).setLngLat(e.lngLat).setHTML(html).addTo(map);
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
    const onEnter = () => { if (!addMode && !setMeMode) map.getCanvas().style.cursor = "pointer"; };
    const onLeave = () => { if (!addMode && !setMeMode) map.getCanvas().style.cursor = ""; };
    map.on("mouseenter", "buildings", onEnter); map.on("mouseleave", "buildings", onLeave);
    map.on("mouseenter", "pois-icons", onEnter); map.on("mouseleave", "pois-icons", onLeave);
    map.on("mouseenter", "pois-clusters", onEnter); map.on("mouseleave", "pois-clusters", onLeave);
    return () => {
      map.off("click", onClick);
      map.off("mouseenter", "buildings", onEnter); map.off("mouseleave", "buildings", onLeave);
      map.off("mouseenter", "pois-icons", onEnter); map.off("mouseleave", "pois-icons", onLeave);
      map.off("mouseenter", "pois-clusters", onEnter); map.off("mouseleave", "pois-clusters", onLeave);
    };
  }, [pois, addMode, setMeMode, tracking, stopTracking, reloadPois, routeFromMe, setSelectedBuilding]);

  // ── Computed ───────────────────────────────────────────────────────────────
  const stackOk = !!stack && stack.postgis.up && stack.martin.up && stack.graphhopper.up;
  const totalServices = 4;
  const upServices = stack ? [stack.postgis.up, stack.martin.up, stack.graphhopper.up, stack.pelias.up].filter(Boolean).length : 0;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="app">
      <div id="map" ref={containerRef} />

      {/* Экран первого визита: онбординг и загрузка районов */}
      {!setup.done && (
        <OnboardingScreen
          downloadStatus={downloadStatus}
          pendingQueue={pendingQueue}
          onEnqueue={enqueueDownload}
          onCancelAll={cancelAllDownloads}
          onComplete={(mode, selectedIds, warehouseAddr, wCoords) => {
            completeSetup(mode, selectedIds, warehouseAddr, wCoords);
            setObWarehouse(null);
            setObHovered(null);
            setObInRadius([]);
          }}
          mapRef={mapRef}
          onWarehouseChange={(coords, inRadius) => { setObWarehouse(coords); setObInRadius(inRadius); }}
          onDistrictHover={setObHovered}
        />
      )}

      {webglError && (
        <div className="webgl-error">
          <h3>WebGL недоступен</h3>
          <p>Этот браузер/окружение не поддерживает WebGL — карта не может отрендериться.</p>
          <p>Откройте приложение в обычном браузере (Chrome, Firefox, Safari).</p>
        </div>
      )}

      <SearchBar
        search={search} setSearch={setSearch}
        searchResults={searchResults} setSearchResults={setSearchResults}
        parsedQuery={parsedQuery} searchSource={searchSource}
        searchFocused={searchFocused} setSearchFocused={setSearchFocused}
        suppressNextSearch={suppressNextSearch} shortLabel={shortLabel}
        onSelectResult={(lng, lat, primary) => { flyTo(lng, lat, 17, true); setSearch(primary); }}
        onRouteToResult={(lng, lat, primary) => { setSearch(primary); routeFromMe({ lng, lat }, primary); }}
      />

      {addMode && <div className="add-mode-banner">Кликните на карте, чтобы поставить точку</div>}
      {setMeMode && <div className="add-mode-banner">Кликните на карте, чтобы поставить себя сюда</div>}

      {selectedBuildingInfo && (
        <button className="selection-pill" onClick={() => setSelectedBuilding(null, null)} title="Снять выделение здания">
          <span className="selection-dot" />
          <span className="selection-label">{selectedBuildingInfo.label}</span>
          <span className="selection-x">×</span>
        </button>
      )}

      {setup.done && downloadStatus.phase !== "idle" && (
        <div className="download-banner">
          {downloadStatus.phase === "downloading" && (
            <>
              <div className="download-banner-row">
                <span className="download-banner-label">
                  {downloadStatus.name ?? "Скачивание зоны"}
                </span>
                <span className="download-banner-count">
                  {downloadStatus.done} / {downloadStatus.total}
                </span>
                <button className="download-banner-cancel" onClick={cancelAllDownloads}>
                  Стоп
                </button>
              </div>
              <div className="download-progress-track">
                <div
                  className="download-progress-fill"
                  style={{ width: `${downloadStatus.total > 0 ? Math.round((downloadStatus.done / downloadStatus.total) * 100) : 0}%` }}
                />
              </div>
              {(() => {
                const visibleQueue = pendingQueue.filter((r) => r.districtId !== "__city_base__");
                return visibleQueue.length > 0 ? (
                  <div className="download-queue-hint">
                    +{visibleQueue.length} в очереди:{" "}
                    {visibleQueue.map((r) => r.name).join(", ")}
                  </div>
                ) : null;
              })()}
            </>
          )}
          {downloadStatus.phase === "done" && (
            <div className="download-banner-done">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              {downloadStatus.name ? `${downloadStatus.name} скачан` : "Готово"} — {downloadStatus.total} тайлов
            </div>
          )}
          {downloadStatus.phase === "cancelled" && (
            <div className="download-banner-cancelled">Скачивание отменено</div>
          )}
        </div>
      )}

      <MapControls
        addMode={addMode} setAddMode={setAddMode}
        setMeMode={setMeMode} setSetMeMode={setSetMeMode}
        tracking={tracking}
        downloadPhase={downloadStatus.phase}
        onDownload={() => {
          if (downloadStatus.phase === "downloading" || downloadStatus.queued > 0) {
            cancelAllDownloads();
          } else {
            enqueueDownload();
          }
        }}
        onGeolocate={async () => {
          if (tracking) { stopTracking(); return; }
          try {
            const loc = await getMyPosition();
            flyTo(loc.lng, loc.lat, 16);
            startTracking(
              (l) => {
                const map = mapRef.current;
                if (map) { const z = map.getZoom(); map.easeTo({ center: [l.lng, l.lat], zoom: z < 15 ? 16 : z, duration: 600 }); }
              },
              (msg) => setRouteError(msg),
            );
          } catch (e) {
            setRouteError((e as Error).message);
          }
        }}
        onResetView={resetView}
        onZoomIn={() => mapRef.current?.zoomIn({ duration: 200 })}
        onZoomOut={() => mapRef.current?.zoomOut({ duration: 200 })}
        onOpenDrawer={() => setDrawerOpen(true)}
      />

      <BootstrapPanel stack={stack} />

      <button
        className={`stack-pill${stackOk ? " ok" : " warn"}`}
        onClick={() => { setDrawerTab("stack"); setDrawerOpen(true); }}
        title="Состояние сервисов"
      >
        <span className="stack-pill-dot" />
        {upServices}/{totalServices}
      </button>

      {coord && (
        <div className="coord-readout">{coord.lat.toFixed(5)}, {coord.lng.toFixed(5)}</div>
      )}

      <RoutePanel
        routing={routing} route={route} routeError={routeError}
        stepsOpen={stepsOpen} setStepsOpen={setStepsOpen} clearRoute={clearRoute}
      />

      <DraftPanel
        draftPoint={draftPoint}
        draftType={draftType} setDraftType={setDraftType}
        draftTitle={draftTitle} setDraftTitle={setDraftTitle}
        draftDesc={draftDesc} setDraftDesc={setDraftDesc}
        draftAddr={draftAddr} setDraftAddr={setDraftAddr}
        saving={saving} saveError={saveError}
        saveDraft={saveDraft} cancelDraft={cancelDraft}
      />

      <DrawerPanel
        open={drawerOpen} onClose={() => setDrawerOpen(false)}
        drawerTab={drawerTab} setDrawerTab={setDrawerTab}
        sortedPois={sortedPois} filterTypes={filterTypes} setFilterTypes={setFilterTypes}
        stack={stack}
        zones={zones} downloadPhase={downloadStatus.phase}
        currentDistrictId={downloadStatus.currentDistrictId}
        pendingQueue={pendingQueue}
        onRemoveZone={removeZone} onClearZones={clearZones}
        onDownloadDistrict={(d) => enqueueDownload({ bounds: d.bounds, zMin: d.zMin, zMax: d.zMax, name: d.name, districtId: d.id })}
        onDequeueDistrict={dequeueDownload}
        onSelectPoi={(lng, lat) => flyTo(lng, lat, 17)}
        onResetSetup={resetSetup}
      />
    </div>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
