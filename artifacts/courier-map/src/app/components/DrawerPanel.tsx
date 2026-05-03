import { useState } from "react";
import type { Poi, PoiType, StackStatus } from "../types";
import { POI_TYPE_META } from "../types";
import type { DownloadedZone } from "../hooks/useDownloadedZones";

const POI_TYPES = Object.keys(POI_TYPE_META) as PoiType[];

function ServiceRow({ label, up, detail, restartService }: {
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
      setTimeout(() => { setRestarting(false); setMsg(null); }, 12_000);
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
        >↺</button>
      )}
      {msg && <span className="svc-restart-msg">{msg}</span>}
    </div>
  );
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const dd  = String(d.getDate()).padStart(2, "0");
  const mm  = String(d.getMonth() + 1).padStart(2, "0");
  const hh  = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()} ${hh}:${min}`;
}

type Tab = "points" | "filter" | "zones" | "stack";

interface Props {
  open: boolean;
  onClose: () => void;
  drawerTab: Tab;
  setDrawerTab: (tab: Tab) => void;
  sortedPois: Poi[];
  filterTypes: Set<PoiType>;
  setFilterTypes: (v: Set<PoiType>) => void;
  stack: StackStatus | null;
  zones: DownloadedZone[];
  onRemoveZone: (id: string) => void;
  onClearZones: () => void;
  onSelectPoi: (lng: number, lat: number) => void;
}

export function DrawerPanel({
  open, onClose,
  drawerTab, setDrawerTab,
  sortedPois, filterTypes, setFilterTypes,
  stack,
  zones, onRemoveZone, onClearZones,
  onSelectPoi,
}: Props) {
  if (!open) return null;
  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer">
        <div className="drawer-header">
          <h2>Меню</h2>
          <button className="drawer-close" onClick={onClose}>×</button>
        </div>
        <div className="drawer-tabs">
          <button className={drawerTab === "points" ? "active" : ""} onClick={() => setDrawerTab("points")}>
            Точки ({sortedPois.length})
          </button>
          <button className={drawerTab === "filter" ? "active" : ""} onClick={() => setDrawerTab("filter")}>
            Фильтр
          </button>
          <button className={drawerTab === "zones" ? "active" : ""} onClick={() => setDrawerTab("zones")}>
            Зоны {zones.length > 0 && <span className="zones-badge">{zones.length}</span>}
          </button>
          <button className={drawerTab === "stack" ? "active" : ""} onClick={() => setDrawerTab("stack")}>
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
                  <div key={p.id} className="poi-card" onClick={() => { onSelectPoi(p.lng, p.lat); onClose(); }}>
                    <div className="top">
                      <span className="badge" style={{ background: meta.color, color: "#0b0e12" }}>
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
              <p className="drawer-hint">Скрыть/показать точки определённого типа на карте.</p>
              <div className="types">
                {POI_TYPES.map((t) => {
                  const active = filterTypes.has(t);
                  return (
                    <button key={t} className={active ? "active" : ""} onClick={() => {
                      const next = new Set(filterTypes);
                      if (active) next.delete(t); else next.add(t);
                      setFilterTypes(next);
                    }}>
                      {POI_TYPE_META[t].icon} {POI_TYPE_META[t].label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {drawerTab === "zones" && (
            <div className="drawer-section">
              <p className="drawer-hint">
                Зоны, скачанные для работы офлайн. Тайлы хранятся в кеше браузера.
              </p>
              {zones.length === 0 && (
                <div className="empty-state">
                  Нет скачанных зон.<br />
                  Нажмите кнопку облака на карте, чтобы скачать видимую область.
                </div>
              )}
              {zones.map((z) => (
                <div key={z.id} className="zone-card">
                  <div className="zone-card-header">
                    <span className="zone-card-date">{formatDate(z.downloadedAt)}</span>
                    <button
                      className="zone-delete-btn"
                      title="Удалить зону из кеша"
                      onClick={() => onRemoveZone(z.id)}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14H6L5 6" />
                        <path d="M10 11v6M14 11v6" />
                        <path d="M9 6V4h6v2" />
                      </svg>
                    </button>
                  </div>
                  <div className="zone-card-info">
                    <span className="zone-info-item">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="8 17 12 21 16 17" />
                        <line x1="12" y1="12" x2="12" y2="21" />
                        <path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29" />
                      </svg>
                      {z.tileCount} тайлов
                    </span>
                    <span className="zone-info-item">
                      z{z.zMin}–{z.zMax}
                    </span>
                  </div>
                </div>
              ))}
              {zones.length > 0 && (
                <button className="zone-clear-btn" onClick={onClearZones}>
                  Очистить весь тайловый кеш
                </button>
              )}
            </div>
          )}
          {drawerTab === "stack" && (
            <div className="drawer-section">
              <p className="drawer-hint">Состояние гео-сервисов проекта.</p>
              <ServiceRow label="PostGIS + h3" up={stack?.postgis.up} detail={stack?.postgis.detail} />
              <ServiceRow label="Martin (PMTiles)" up={stack?.martin.up} detail={stack?.martin.detail} restartService="martin" />
              <ServiceRow label="GraphHopper" up={stack?.graphhopper.up} detail={stack?.graphhopper.detail} restartService="graphhopper" />
              <ServiceRow label="Pelias" up={stack?.pelias.up} detail={stack?.pelias.detail} />
              <div className="basemap-source">
                Базовая карта:{" "}
                {stack?.basemap.source === "pmtiles_martin" ? "PMTiles (Martin)" : "OSM raster (fallback)"}
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
