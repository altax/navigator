import { useState } from "react";
import type { Poi, PoiType, StackStatus } from "../types";
import { POI_TYPE_META } from "../types";

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

interface Props {
  open: boolean;
  onClose: () => void;
  drawerTab: "points" | "filter" | "stack";
  setDrawerTab: (tab: "points" | "filter" | "stack") => void;
  sortedPois: Poi[];
  filterTypes: Set<PoiType>;
  setFilterTypes: (v: Set<PoiType>) => void;
  stack: StackStatus | null;
  onSelectPoi: (lng: number, lat: number) => void;
}

export function DrawerPanel({ open, onClose, drawerTab, setDrawerTab, sortedPois, filterTypes, setFilterTypes, stack, onSelectPoi }: Props) {
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
