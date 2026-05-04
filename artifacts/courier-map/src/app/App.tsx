import { useEffect, useRef, useState, useCallback } from "react";
import { escapeHtml } from "./utils";
import maplibregl, { Map as MlMap, type MapLayerMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { buildStyle, SPB_CENTER } from "./mapStyle";
import { drawMetroIcon, drawMetroEntranceIcon, drawZebraIcon } from "./mapIcons";
import { SearchBar } from "./components/SearchBar";
import { ZoneLoader } from "./components/ZoneLoader";

export interface ZoneFilter {
  lng: number;
  lat: number;
  radiusKm: number;
}

function tileDistKm(z: number, tx: number, ty: number, zLng: number, zLat: number): number {
  const n = 1 << z;
  const lng = ((tx + 0.5) / n) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (ty + 0.5)) / n))) * 180) / Math.PI;
  const R = 6371;
  const dLat = (lat - zLat) * (Math.PI / 180);
  const dLng = (lng - zLng) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(zLat * (Math.PI / 180)) * Math.cos(lat * (Math.PI / 180)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const EMPTY_TILE = "data:application/octet-stream;base64,";

export default function App() {
  const mapRef = useRef<MlMap | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const zoneFilterRef = useRef<ZoneFilter | null>(null);

  const [coord, setCoord] = useState<{ lng: number; lat: number } | null>(null);
  const [webglError, setWebglError] = useState(false);
  const [selectedBuildingInfo, setSelectedBuildingInfo] = useState<{ label: string } | null>(null);

  // ── Map init ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let map: MlMap;
    try {
      const weakDevice =
        (navigator.hardwareConcurrency ?? 4) <= 2 ||
        ((navigator as { deviceMemory?: number }).deviceMemory ?? 4) <= 2;

      map = new maplibregl.Map({
        container: containerRef.current,
        style: buildStyle(null),
        center: SPB_CENTER,
        zoom: 14,
        pitch: weakDevice ? 0 : 35,
        maxPitch: 70,
        bearing: 0,
        minZoom: 5,
        maxZoom: 21,
        maxBounds: [27.0, 58.0, 34.0, 61.8],
        attributionControl: { compact: true },
        touchPitch: true,
        cooperativeGestures: false,
        fadeDuration: 0,
        antialias: false,
        maxTileCacheSize: weakDevice ? 400 : 800,
        crossSourceCollisions: false,
        refreshExpiredTiles: false,
        localIdeographFontFamily: "",
        pixelRatio: weakDevice ? 1 : Math.min(window.devicePixelRatio || 1, 2),
        transformRequest: (url, resourceType) => {
          if (resourceType === "Tile" && url.includes("/api/tiles/spb-lo/")) {
            const zone = zoneFilterRef.current;
            if (zone) {
              const m = url.match(/\/(\d+)\/(\d+)\/(\d+)(?:\?|$)/);
              if (m) {
                const z = parseInt(m[1]), tx = parseInt(m[2]), ty = parseInt(m[3]);
                const dist = tileDistKm(z, tx, ty, zone.lng, zone.lat);
                if (dist > zone.radiusKm * 1.3) {
                  return { url: EMPTY_TILE };
                }
              }
            }
          }
          return { url };
        },
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

    // ── Predictive tile prefetch ───────────────────────────────────────────
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
    let prefetchAbort: AbortController | null = null;

    const runQueue = (urls: string[], concurrency: number) => {
      if (prefetchAbort) prefetchAbort.abort();
      prefetchAbort = new AbortController();
      const signal = prefetchAbort.signal;
      let idx = 0;
      const next = () => {
        if (signal.aborted || idx >= urls.length) return;
        const url = urls[idx++];
        fetch(url, { priority: "low", signal } as RequestInit)
          .catch(() => {})
          .finally(next);
      };
      for (let i = 0; i < Math.min(concurrency, urls.length); i++) next();
    };

    const schedulePrefetch = () => {
      if (prefetchRaf) clearTimeout(prefetchRaf);
      prefetchRaf = setTimeout(() => {
        const m = mapRef.current;
        if (!m) return;
        const b = m.getBounds();
        const rawZ = m.getZoom();
        const buf = 1;
        const urls: string[] = [];
        const z = Math.floor(rawZ);
        const nw = tileCoord(b.getWest(), b.getNorth(), z);
        const se = tileCoord(b.getEast(), b.getSouth(), z);
        for (let tx = nw.x - buf; tx <= se.x + buf; tx++) {
          for (let ty = nw.y - buf; ty <= se.y + buf; ty++) {
            if (tx >= nw.x && tx <= se.x && ty >= nw.y && ty <= se.y) continue;
            const n = 1 << z;
            if (tx < 0 || ty < 0 || tx >= n || ty >= n) continue;
            urls.push(`/api/tiles/spb-lo/${z}/${tx}/${ty}`);
          }
        }
        runQueue(urls, 4);
      }, 500);
    };

    map.on("moveend", schedulePrefetch);
    map.on("zoomend", schedulePrefetch);
    schedulePrefetch();

    return () => {
      if (prefetchRaf) clearTimeout(prefetchRaf);
      if (prefetchAbort) prefetchAbort.abort();
      try { map.remove(); } catch {}
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  }, []);

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
  }, []);

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

  const buildBuildingLabel = useCallback((props: Record<string, string | number | undefined>): string => {
    const housenumber = props["addr:housenumber"];
    const street = props["addr:street"];
    const name = props["name"];
    if (street && housenumber) return `${street}, ${housenumber}`;
    if (housenumber) return `№ ${housenumber}`;
    if (name) return String(name);
    return "Здание";
  }, []);

  // ── Try to highlight building at coords ────────────────────────────────────
  const highlightAt = useCallback((lng: number, lat: number) => {
    const map = mapRef.current;
    if (!map) return;
    const tryHighlight = () => {
      const pt = map.project([lng, lat]);
      const r = 24;
      const feats = map.queryRenderedFeatures(
        [[pt.x - r, pt.y - r], [pt.x + r, pt.y + r]],
        { layers: ["buildings"] },
      );
      if (feats.length > 0) {
        const f = feats[0];
        setSelectedBuilding(
          f as unknown as GeoJSON.Feature,
          buildBuildingLabel((f.properties || {}) as Record<string, string | number | undefined>),
        );
        return true;
      }
      return false;
    };
    if (!tryHighlight()) {
      setTimeout(tryHighlight, 600);
      setTimeout(tryHighlight, 1200);
    }
  }, [setSelectedBuilding, buildBuildingLabel]);

  // ── Fly to + highlight ─────────────────────────────────────────────────────
  const flyToAndHighlight = useCallback((lng: number, lat: number, label: string) => {
    const map = mapRef.current;
    if (!map) return;
    setSelectedBuildingInfo({ label });
    map.flyTo({ center: [lng, lat], zoom: 17, duration: 1100, essential: true });
    map.once("moveend", () => highlightAt(lng, lat));
  }, [highlightAt]);

  // ── Click handler ──────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const onClick = (e: MapLayerMouseEvent) => {
      const buildingFeats = map.queryRenderedFeatures(e.point, { layers: ["buildings"] });
      if (buildingFeats.length === 0) {
        setSelectedBuilding(null, null);
        return;
      }
      const f = buildingFeats[0];
      const props = (f.properties || {}) as Record<string, string | number | undefined>;
      const headline = buildBuildingLabel(props);
      setSelectedBuilding(f as unknown as GeoJSON.Feature, headline);

      const levels = props["building:levels"];
      const buildingType = props["building"];
      const meta: string[] = [];
      if (levels) meta.push(`${levels} эт.`);
      if (buildingType && buildingType !== "yes") meta.push(String(buildingType));

      const html = `
        <h3>${escapeHtml(headline)}</h3>
        ${meta.length ? `<p class="small">${escapeHtml(meta.join(" · "))}</p>` : ""}
        <p class="small">${e.lngLat.lat.toFixed(5)}, ${e.lngLat.lng.toFixed(5)}</p>
      `;
      new maplibregl.Popup({ offset: 8, closeButton: true })
        .setLngLat(e.lngLat)
        .setHTML(html)
        .addTo(map);
    };

    const onEnter = () => { map.getCanvas().style.cursor = "pointer"; };
    const onLeave = () => { map.getCanvas().style.cursor = ""; };

    map.on("click", onClick);
    map.on("mouseenter", "buildings", onEnter);
    map.on("mouseleave", "buildings", onLeave);

    return () => {
      map.off("click", onClick);
      map.off("mouseenter", "buildings", onEnter);
      map.off("mouseleave", "buildings", onLeave);
    };
  }, [setSelectedBuilding, buildBuildingLabel]);

  // ── Render ─────────────────────────────────────────────────────────────────
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

      <SearchBar onSelect={flyToAndHighlight} />
      <ZoneLoader mapRef={mapRef} zoneFilterRef={zoneFilterRef} />

      {selectedBuildingInfo && (
        <button className="selection-pill" onClick={() => setSelectedBuilding(null, null)} title="Снять выделение здания">
          <span className="selection-dot" />
          <span className="selection-label">{selectedBuildingInfo.label}</span>
          <span className="selection-x">×</span>
        </button>
      )}

      {coord && (
        <div className="coord-readout">{coord.lat.toFixed(5)}, {coord.lng.toFixed(5)}</div>
      )}
    </div>
  );
}
