import { useState, useEffect, useRef, useCallback } from "react";
import maplibregl, { type Map as MlMap } from "maplibre-gl";
import type { ZoneFilter } from "../App";

interface ZoneSaved {
  address: string;
  lng: number;
  lat: number;
  radiusKm: number;
}

interface GeoResult {
  label: string;
  lng: number;
  lat: number;
}

interface Props {
  mapRef: React.RefObject<MlMap | null>;
  zoneFilterRef: React.RefObject<ZoneFilter | null>;
}

const LS_KEY = "zone-loader-v1";

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function lngLatToTile(lng: number, lat: number, z: number) {
  const n = 1 << z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latR = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n,
  );
  return { x: Math.max(0, Math.min(n - 1, x)), y: Math.max(0, Math.min(n - 1, y)) };
}

function tileCenter(tx: number, ty: number, z: number) {
  const n = 1 << z;
  const lng = ((tx + 0.5) / n) * 360 - 180;
  const lat =
    (Math.atan(Math.sinh(Math.PI * (1 - (2 * (ty + 0.5)) / n))) * 180) / Math.PI;
  return { lng, lat };
}

function tilesForZoom(
  lng: number, lat: number, radiusKm: number, z: number,
): string[] {
  const n = 1 << z;
  const c = lngLatToTile(lng, lat, z);
  const kmPerDegLng = 111 * Math.cos((lat * Math.PI) / 180);
  const degPerTileX = 360 / n;
  const degPerTileY = 170 / n;
  const bufX = Math.ceil(radiusKm / (degPerTileX * kmPerDegLng)) + 1;
  const bufY = Math.ceil(radiusKm / (degPerTileY * 111)) + 1;

  const urls: string[] = [];
  for (let dx = -bufX; dx <= bufX; dx++) {
    for (let dy = -bufY; dy <= bufY; dy++) {
      const tx = c.x + dx;
      const ty = c.y + dy;
      if (tx < 0 || ty < 0 || tx >= n || ty >= n) continue;
      const { lng: tLng, lat: tLat } = tileCenter(tx, ty, z);
      if (haversineKm(lat, lng, tLat, tLng) <= radiusKm) {
        urls.push(`/api/tiles/spb-lo/${z}/${tx}/${ty}`);
      }
    }
  }
  return urls;
}

function allTilesInRadius(lng: number, lat: number, radiusKm: number): string[] {
  const maxZ = radiusKm <= 7 ? 14 : radiusKm <= 12 ? 13 : 12;
  const result: string[] = [];
  for (let z = 5; z <= maxZ; z++) {
    result.push(...tilesForZoom(lng, lat, radiusKm, z));
  }
  return [...new Set(result)];
}

function makeCircle(
  lng: number, lat: number, radiusKm: number,
): GeoJSON.FeatureCollection {
  const N = 64;
  const coords: [number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * 2 * Math.PI;
    const dLat = (radiusKm / 111) * Math.cos(a);
    const dLng =
      (radiusKm / (111 * Math.cos((lat * Math.PI) / 180))) * Math.sin(a);
    coords.push([lng + dLng, lat + dLat]);
  }
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [coords] },
        properties: {},
      },
    ],
  };
}

function makeInverseMask(
  lng: number, lat: number, radiusKm: number,
): GeoJSON.FeatureCollection {
  const world: [number, number][] = [
    [-180, -85.051129], [180, -85.051129],
    [180, 85.051129], [-180, 85.051129], [-180, -85.051129],
  ];
  const N = 128;
  const hole: [number, number][] = [];
  for (let i = N; i >= 0; i--) {
    const a = (i / N) * 2 * Math.PI;
    const dLat = (radiusKm / 111) * Math.cos(a);
    const dLng = (radiusKm / (111 * Math.cos((lat * Math.PI) / 180))) * Math.sin(a);
    hole.push([lng + dLng, lat + dLat]);
  }
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [world, hole] },
        properties: {},
      },
    ],
  };
}

function zoneBounds(
  lng: number, lat: number, radiusKm: number, bufferFactor = 1.3,
): [number, number, number, number] {
  const r = radiusKm * bufferFactor;
  const dLat = r / 111;
  const dLng = r / (111 * Math.cos((lat * Math.PI) / 180));
  return [lng - dLng, lat - dLat, lng + dLng, lat + dLat];
}

const EMPTY_FC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
const FULL_BOUNDS: [number, number, number, number] = [27.0, 58.0, 34.0, 61.8];

export function ZoneLoader({ mapRef, zoneFilterRef }: Props) {
  const [open, setOpen] = useState(false);
  const [address, setAddress] = useState("");
  const [suggestions, setSuggestions] = useState<GeoResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<{ lng: number; lat: number; label: string } | null>(null);
  const [radiusKm, setRadiusKm] = useState(5);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [saved, setSaved] = useState<ZoneSaved | null>(null);

  const [showWelcome, setShowWelcome] = useState(() => {
    try { return !localStorage.getItem(LS_KEY); } catch { return true; }
  });

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const darkstoreMarkerRef = useRef<maplibregl.Marker | null>(null);

  // ── Paint / clear zone circle on the map ───────────────────────────────
  const paintCircle = useCallback(
    (lng: number, lat: number, r: number) => {
      const map = mapRef.current;
      if (!map || !map.isStyleLoaded()) return;
      const geo = makeCircle(lng, lat, r);
      const mask = makeInverseMask(lng, lat, r);

      if (!map.getSource("zone-circle")) {
        map.addSource("zone-circle", { type: "geojson", data: geo });
        map.addLayer(
          {
            id: "zone-fill",
            type: "fill",
            source: "zone-circle",
            paint: { "fill-color": "#3b82f6", "fill-opacity": 0.09 },
          },
          "selected-building-3d",
        );
        map.addLayer(
          {
            id: "zone-outline",
            type: "line",
            source: "zone-circle",
            paint: {
              "line-color": "#60a5fa",
              "line-width": 2,
              "line-opacity": 0.8,
              "line-dasharray": [5, 3],
            },
          },
          "selected-building-3d",
        );
      } else {
        (map.getSource("zone-circle") as maplibregl.GeoJSONSource).setData(geo);
      }

      (map.getSource("delivery-mask") as maplibregl.GeoJSONSource | undefined)?.setData(mask);

      // Update tile filter — only tiles within radius will be fetched from now on
      (zoneFilterRef as React.MutableRefObject<{ lng: number; lat: number; radiusKm: number } | null>).current = { lng, lat, radiusKm: r };
      // Flush tile cache so already-cached out-of-zone tiles are evicted
      (map.getSource("basemap") as maplibregl.VectorTileSource & { reload?: () => void })?.reload?.();

      map.setMaxBounds(zoneBounds(lng, lat, r));

      // ── Darkstore marker ────────────────────────────────────────────────
      if (darkstoreMarkerRef.current) {
        darkstoreMarkerRef.current.setLngLat([lng, lat]);
      } else {
        const el = document.createElement("div");
        el.className = "darkstore-marker";
        el.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
          <span class="darkstore-label">Даркстор</span>
        `;
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          mapRef.current?.flyTo({ center: [lng, lat], zoom: 17, duration: 900, essential: true });
        });
        darkstoreMarkerRef.current = new maplibregl.Marker({ element: el, anchor: "bottom" })
          .setLngLat([lng, lat])
          .addTo(map);
      }
    },
    [mapRef, zoneFilterRef, darkstoreMarkerRef],
  );

  const clearCircle = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.getSource("zone-circle")) {
      (map.getSource("zone-circle") as maplibregl.GeoJSONSource).setData(EMPTY_FC);
    }
    (map.getSource("delivery-mask") as maplibregl.GeoJSONSource | undefined)?.setData(EMPTY_FC);
    // Remove tile filter — full map loads again
    (zoneFilterRef as React.MutableRefObject<{ lng: number; lat: number; radiusKm: number } | null>).current = null;
    (map.getSource("basemap") as maplibregl.VectorTileSource & { reload?: () => void })?.reload?.();
    map.setMaxBounds(FULL_BOUNDS);
    // Remove darkstore marker
    darkstoreMarkerRef.current?.remove();
    darkstoreMarkerRef.current = null;
  }, [mapRef, zoneFilterRef, darkstoreMarkerRef]);

  // ── Restore saved zone on mount ────────────────────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const s = JSON.parse(raw) as ZoneSaved;
      setSaved(s);
      setSelected({ lng: s.lng, lat: s.lat, label: s.address });
      setAddress(s.address);
      setRadiusKm(s.radiusKm);
      const tryDraw = () => {
        const map = mapRef.current;
        if (map?.isStyleLoaded()) { paintCircle(s.lng, s.lat, s.radiusKm); return true; }
        return false;
      };
      if (!tryDraw()) {
        const iv = setInterval(() => { if (tryDraw()) clearInterval(iv); }, 400);
        setTimeout(() => clearInterval(iv), 12000);
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Address autocomplete ───────────────────────────────────────────────
  const doSearch = useCallback(async (q: string) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setSearching(true);
    try {
      const res = await fetch(
        `/api/geo/geocode?q=${encodeURIComponent(q)}&limit=6`,
        { signal: ctrl.signal },
      );
      const data = (await res.json()) as { results?: GeoResult[] };
      setSuggestions(data.results ?? []);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setSuggestions([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleAddressChange = (v: string) => {
    setAddress(v);
    setSelected(null);
    clearCircle();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!v.trim()) { setSuggestions([]); setSearching(false); return; }
    setSearching(true);
    debounceRef.current = setTimeout(() => doSearch(v), 420);
  };

  const handleSelect = (r: GeoResult) => {
    const label = r.label.split(", ").slice(0, 2).join(", ");
    setSelected({ lng: r.lng, lat: r.lat, label });
    setAddress(label);
    setSuggestions([]);
    paintCircle(r.lng, r.lat, radiusKm);
    mapRef.current?.flyTo({ center: [r.lng, r.lat], zoom: 13, duration: 900, essential: true });
  };

  const handleRadiusChange = (r: number) => {
    setRadiusKm(r);
    if (selected) paintCircle(selected.lng, selected.lat, r);
  };

  // ── Tile preload ───────────────────────────────────────────────────────
  const tileUrls = selected ? allTilesInRadius(selected.lng, selected.lat, radiusKm) : [];
  const estMB = Math.round(tileUrls.length * 0.25);

  const handleLoad = async () => {
    if (!selected || loading) return;
    const urls = allTilesInRadius(selected.lng, selected.lat, radiusKm);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const { signal } = ctrl;
    setLoading(true);
    setProgress({ done: 0, total: urls.length });

    let done = 0;
    let idx = 0;
    const CONCURRENCY = 8;

    await new Promise<void>((resolve) => {
      const next = () => {
        if (signal.aborted || idx >= urls.length) {
          if (done >= urls.length || signal.aborted) resolve();
          return;
        }
        const url = urls[idx++];
        fetch(url, { signal } as RequestInit)
          .catch(() => {})
          .finally(() => {
            done++;
            setProgress({ done, total: urls.length });
            if (done >= urls.length) resolve();
            else next();
          });
      };
      for (let i = 0; i < Math.min(CONCURRENCY, urls.length); i++) next();
      if (urls.length === 0) resolve();
    });

    if (!signal.aborted && selected) {
      const state: ZoneSaved = {
        address: selected.label,
        lng: selected.lng,
        lat: selected.lat,
        radiusKm,
      };
      localStorage.setItem(LS_KEY, JSON.stringify(state));
      setSaved(state);
    }
    setLoading(false);
    setProgress(null);
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    setLoading(false);
    setProgress(null);
  };

  const handleClear = () => {
    localStorage.removeItem(LS_KEY);
    setSaved(null);
    setSelected(null);
    setAddress("");
    setSuggestions([]);
    clearCircle();
  };

  const handleWelcomeStart = useCallback(() => {
    if (!selected) return;
    const map = mapRef.current;
    const doStart = () => {
      paintCircle(selected.lng, selected.lat, radiusKm);
      map!.flyTo({ center: [selected.lng, selected.lat], zoom: 13, duration: 1400, essential: true });
      const state: ZoneSaved = { address: selected.label, lng: selected.lng, lat: selected.lat, radiusKm };
      localStorage.setItem(LS_KEY, JSON.stringify(state));
      setSaved(state);
      setShowWelcome(false);
    };
    if (!map) { setShowWelcome(false); return; }
    if (map.isStyleLoaded()) doStart();
    else map.once("style.load", doStart);
  }, [selected, radiusKm, mapRef, paintCircle]);

  const pct = progress ? Math.round((progress.done / progress.total) * 100) : 0;
  const maxZLabel = radiusKm <= 7 ? "z5–z14" : radiusKm <= 12 ? "z5–z13" : "z5–z12";

  return (
    <>
      {showWelcome && (
        <div className="welcome-overlay">
          <div className="welcome-card">
            <div className="welcome-header">
              <div className="welcome-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9" />
                  <circle cx="12" cy="12" r="3" />
                  <line x1="12" y1="2" x2="12" y2="5" />
                  <line x1="12" y1="19" x2="12" y2="22" />
                  <line x1="2" y1="12" x2="5" y2="12" />
                  <line x1="19" y1="12" x2="22" y2="12" />
                </svg>
              </div>
              <h1 className="welcome-title">Курьерская Карта</h1>
              <p className="welcome-subtitle">Укажите адрес даркстора и радиус&nbsp;доставки — карта отрисует только вашу зону</p>
            </div>

            <div className="welcome-body">
              <div className="welcome-field">
                <span className="welcome-label">Адрес даркстора</span>
                <div className="welcome-input-row">
                  <input
                    className="welcome-input"
                    value={address}
                    onChange={(e) => handleAddressChange(e.target.value)}
                    placeholder="Улица, дом…"
                    autoComplete="off"
                    spellCheck={false}
                    autoFocus
                  />
                  {searching && <span className="zone-spinner" />}
                  {!searching && address && (
                    <button className="zone-input-clear" onClick={() => handleAddressChange("")}>×</button>
                  )}
                </div>
                {suggestions.length > 0 && (
                  <ul className="welcome-suggestions">
                    {suggestions.map((s, i) => (
                      <li key={i} className="welcome-suggestion" onClick={() => handleSelect(s)}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="welcome-suggestion-icon">
                          <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                        <span>{s.label.split(", ").slice(0, 3).join(", ")}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="welcome-field">
                <div className="welcome-radius-row">
                  <span className="welcome-label" style={{ margin: 0 }}>Радиус доставки</span>
                  <span className="welcome-radius-val">{radiusKm} км</span>
                </div>
                <input
                  type="range"
                  className="welcome-slider"
                  min={1} max={20} step={1}
                  value={radiusKm}
                  onChange={(e) => handleRadiusChange(Number(e.target.value))}
                />
                <div className="welcome-slider-marks">
                  <span>1</span><span>5</span><span>10</span><span>15</span><span>20</span>
                </div>
              </div>
            </div>

            <div className="welcome-footer">
              <button
                className="welcome-btn"
                disabled={!selected}
                onClick={handleWelcomeStart}
              >
                {selected ? `Начать — ${selected.label.split(", ").slice(0, 2).join(", ")}` : "Выберите адрес"}
              </button>
            </div>
          </div>
        </div>
      )}

      <button
        className={`zone-trigger${saved ? " zone-trigger--active" : ""}`}
        onClick={() => setOpen((v) => !v)}
        title="Зона доставки"
      >
        <svg
          width="18" height="18" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.2"
          strokeLinecap="round" strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="3" />
          <line x1="12" y1="2" x2="12" y2="5" />
          <line x1="12" y1="19" x2="12" y2="22" />
          <line x1="2" y1="12" x2="5" y2="12" />
          <line x1="19" y1="12" x2="22" y2="12" />
        </svg>
        {saved && <span className="zone-trigger-dot" />}
      </button>

      {open && (
        <div className="zone-panel">
          <div className="zone-panel-header">
            <span className="zone-panel-title">Зона доставки</span>
            <button className="zone-panel-close" onClick={() => setOpen(false)}>×</button>
          </div>

          {/* ── Адрес ── */}
          <div className="zone-section">
            <label className="zone-label">Стартовый адрес</label>
            <div className="zone-input-row">
              <input
                className="zone-input"
                value={address}
                onChange={(e) => handleAddressChange(e.target.value)}
                placeholder="Адрес склада / точки старта"
                autoComplete="off"
                spellCheck={false}
              />
              {searching && <span className="zone-spinner" />}
              {!searching && address && (
                <button
                  className="zone-input-clear"
                  onClick={() => handleAddressChange("")}
                >×</button>
              )}
            </div>
            {suggestions.length > 0 && (
              <ul className="zone-suggestions">
                {suggestions.map((s, i) => (
                  <li
                    key={i}
                    className="zone-suggestion"
                    onClick={() => handleSelect(s)}
                  >
                    <svg
                      width="11" height="11" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2"
                      strokeLinecap="round" strokeLinejoin="round"
                      className="zone-suggestion-icon"
                    >
                      <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    <span>{s.label.split(", ").slice(0, 3).join(", ")}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* ── Радиус ── */}
          <div className="zone-section">
            <label className="zone-label">
              Радиус доставки:&nbsp;
              <strong className="zone-radius-val">{radiusKm} км</strong>
            </label>
            <input
              type="range"
              className="zone-slider"
              min={1} max={20} step={1}
              value={radiusKm}
              onChange={(e) => handleRadiusChange(Number(e.target.value))}
            />
            <div className="zone-slider-marks">
              <span>1</span><span>5</span><span>10</span><span>15</span><span>20</span>
            </div>
          </div>

          {/* ── Оценка ── */}
          {selected && (
            <div className="zone-estimate">
              <span>~{tileUrls.length} тайлов</span>
              <span className="zone-sep">·</span>
              <span>~{estMB} МБ</span>
              <span className="zone-sep">·</span>
              <span className="zone-zoom-hint">{maxZLabel}</span>
            </div>
          )}

          {/* ── Прогресс ── */}
          {loading && progress && (
            <div className="zone-progress">
              <div className="zone-progress-track">
                <div
                  className="zone-progress-fill"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="zone-progress-label">
                {progress.done}&thinsp;/&thinsp;{progress.total}
                &nbsp;&middot;&nbsp;{pct}%
              </div>
            </div>
          )}

          {/* ── Кнопки ── */}
          <div className="zone-actions">
            {!loading ? (
              <>
                <button
                  className="zone-btn-primary"
                  disabled={!selected}
                  onClick={handleLoad}
                >
                  Загрузить зону
                </button>
                {saved && (
                  <button className="zone-btn-ghost" onClick={handleClear}>
                    Сбросить
                  </button>
                )}
              </>
            ) : (
              <button className="zone-btn-ghost" onClick={handleCancel}>
                Отмена
              </button>
            )}
          </div>

          {/* ── Сохранённая зона ── */}
          {saved && !loading && (
            <div className="zone-saved-info">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              {saved.address} · {saved.radiusKm} км
            </div>
          )}
        </div>
      )}
    </>
  );
}
