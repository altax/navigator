import { useState, useEffect, useRef } from "react";
import type { Map as MlMap } from "maplibre-gl";
import type { DownloadStatus, DownloadRequest } from "../hooks/useDownloadQueue";
import type { MapMode } from "../hooks/useMapSetup";
import { DISTRICTS, DISTRICT_GROUPS, districtById } from "../data/districts";
import { geocodeAddress, districtIdsInRadius, circleTileBounds, RADIUS_KM } from "../hooks/useWarehouseRadius";

// ── Типы ──────────────────────────────────────────────────────────────────────

interface Props {
  downloadStatus:    DownloadStatus;
  pendingQueue:      DownloadRequest[];
  onEnqueue:         (req: DownloadRequest) => void;
  onCancelAll:       () => void;
  onComplete:        (mode: MapMode, selectedIds: string[], warehouseAddress: string, warehouseCoords: [number, number] | null) => void;
  mapRef:            React.RefObject<MlMap | null>;
  onWarehouseChange: (coords: [number, number] | null, inRadius: string[]) => void;
  onDistrictHover:   (id: string | null) => void;
}

type Step = "address" | "choose" | "downloading" | "done";

interface Suggestion {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function plural(n: number) {
  return n === 1 ? "район" : n <= 4 ? "района" : "районов";
}

/** Короткое имя из Nominatim display_name: первые 2 части через запятую */
function shortName(displayName: string): string {
  return displayName.split(",").slice(0, 2).map(s => s.trim()).join(", ");
}

const CheckIcon = () => (
  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

// ── Компонент ─────────────────────────────────────────────────────────────────

export function OnboardingScreen({
  downloadStatus, pendingQueue, onEnqueue, onCancelAll, onComplete,
  mapRef, onWarehouseChange, onDistrictHover,
}: Props) {
  const [step,            setStep]           = useState<Step>("address");
  const [mode,            setMode]           = useState<MapMode>("districts");
  const [pickedIds,       setPickedIds]      = useState<string[]>([]);
  const [addressInput,    setAddressInput]   = useState("");
  const [suggestions,     setSuggestions]    = useState<Suggestion[]>([]);
  const [sugOpen,         setSugOpen]        = useState(false);
  const [searching,       setSearching]      = useState(false);
  const [geocoding,       setGeocoding]      = useState(false);
  const [geocodeError,    setGeocodeError]   = useState<string | null>(null);
  const [warehouseCoords, setWarehouseCoords] = useState<[number, number] | null>(null);
  const [inRadiusIds,     setInRadiusIds]    = useState<string[]>([]);

  const downloadStartedRef = useRef(false);
  const prevPhaseRef       = useRef(downloadStatus.phase);
  const searchTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef            = useRef<HTMLDivElement>(null);

  // Закрыть дропдаун при клике снаружи
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setSugOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = downloadStatus.phase;
    if (!downloadStartedRef.current || step !== "downloading") return;
    if (downloadStatus.phase === "cancelled") { downloadStartedRef.current = false; setStep("choose"); }
    else if (prev !== "idle" && downloadStatus.phase === "idle") { setStep("done"); }
  }, [downloadStatus.phase, step]);

  // ── Применить выбранные координаты (из поиска или Enter) ──────────────────
  const applyCoords = (coords: [number, number], label: string) => {
    const inRadius = districtIdsInRadius(DISTRICTS, coords, RADIUS_KM);
    setWarehouseCoords(coords);
    setInRadiusIds(inRadius);
    setPickedIds(inRadius.slice(0, 4));
    setAddressInput(label);
    setGeocodeError(null);
    onWarehouseChange(coords, inRadius);
    mapRef.current?.flyTo({ center: coords, zoom: 11, duration: 900 });
  };

  // ── Живой поиск при вводе (debounce 400 мс) ───────────────────────────────
  const handleAddressInput = (value: string) => {
    setAddressInput(value);
    setGeocodeError(null);
    // Сбрасываем выбранный адрес если пользователь редактирует
    if (warehouseCoords) {
      setWarehouseCoords(null);
      setInRadiusIds([]);
      setPickedIds([]);
      onWarehouseChange(null, []);
    }
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (value.trim().length < 3) { setSuggestions([]); setSugOpen(false); return; }

    searchTimerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const q = /санкт|питер|спб/i.test(value) ? value : `${value}, Санкт-Петербург`;
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=6&countrycodes=ru&accept-language=ru`;
        const resp = await fetch(url, { headers: { "User-Agent": "courier-map/1.0" } });
        const data = await resp.json() as Suggestion[];
        setSuggestions(data);
        setSugOpen(data.length > 0);
      } catch { /* без интернета — тихо */ }
      setSearching(false);
    }, 400);
  };

  // ── Клик по подсказке ────────────────────────────────────────────────────
  const handleSuggestionSelect = (s: Suggestion) => {
    const coords: [number, number] = [parseFloat(s.lon), parseFloat(s.lat)];
    applyCoords(coords, shortName(s.display_name));
    setSuggestions([]);
    setSugOpen(false);
  };

  // ── Поиск через Enter / кнопку (fallback) ────────────────────────────────
  const handleGeocode = async () => {
    if (!addressInput.trim() || warehouseCoords) return;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    setSugOpen(false);
    setGeocoding(true);
    try {
      const coords = await geocodeAddress(addressInput);
      applyCoords(coords, addressInput);
    } catch (e) {
      setGeocodeError((e as Error).message);
    }
    setGeocoding(false);
  };

  const handleChipHover = (id: string | null) => {
    onDistrictHover(id);
    if (id) {
      const d = districtById(id);
      if (d && mapRef.current) {
        mapRef.current.flyTo({
          center: [(d.bounds.west + d.bounds.east) / 2, (d.bounds.south + d.bounds.north) / 2],
          zoom: 12, duration: 500,
        });
      }
    }
  };

  const toggle = (id: string) =>
    setPickedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : prev.length >= 4 ? prev : [...prev, id],
    );

  const handleStart = () => {
    if (warehouseCoords && mode === "districts") {
      const bounds = circleTileBounds(warehouseCoords, RADIUS_KM);
      onEnqueue({ bounds, zMin: 10, zMax: 16, name: `Зона ${RADIUS_KM} км`, districtId: "radius_zone" });
    } else {
      const list = mode === "all" ? DISTRICTS : DISTRICTS.filter(d => pickedIds.includes(d.id));
      if (!list.length) return;
      list.forEach(d => onEnqueue({ bounds: d.bounds, zMin: d.zMin, zMax: d.zMax, name: d.name, districtId: d.id }));
    }
    downloadStartedRef.current = true;
    setStep("downloading");
  };

  const handleOpen = () => {
    const ids = mode === "all" ? DISTRICTS.map(d => d.id) : pickedIds;
    onComplete(mode, ids, addressInput, warehouseCoords);
  };

  const visibleQueue = pendingQueue.filter(r => r.districtId !== "__city_base__");
  const pct      = downloadStatus.total > 0 ? Math.round((downloadStatus.done / downloadStatus.total) * 100) : 0;
  const isCity   = downloadStatus.currentDistrictId === "__city_base__";
  const canStart = mode === "all" || (warehouseCoords ? inRadiusIds.length > 0 : pickedIds.length > 0);

  const shownGroups = inRadiusIds.length > 0
    ? DISTRICT_GROUPS.map(g => ({ ...g, ids: g.ids.filter(id => inRadiusIds.includes(id)) })).filter(g => g.ids.length > 0)
    : DISTRICT_GROUPS;

  const overlayClass = `ob-overlay${step === "choose" ? " ob-overlay--choose" : ""}`;

  return (
    <div className={overlayClass}>
      <div className="ob-wrap">

        {/* ── Шапка ── */}
        <header className="ob-hdr">
          <div className="ob-hdr-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6"
              strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
          </div>
          <div className="ob-hdr-text">
            <h1 className="ob-title">Карта курьера</h1>
            <p className="ob-subtitle">Санкт-Петербург и Ленинградская область</p>
          </div>
        </header>

        {/* ── Шаг 0: адрес цеха ── */}
        {step === "address" && (
          <div className="ob-choose">
            <div className="ob-addr-card">
              <div className="ob-addr-intro">
                <div className="ob-addr-emoji">🏭</div>
                <h2 className="ob-addr-title">Где ваш цех или даркстор?</h2>
                <p className="ob-addr-desc">
                  Укажем рабочую зону {RADIUS_KM} км — карта покажет только нужные районы.
                </p>
              </div>

              {/* Поле с автодополнением */}
              <div className="ob-addr-autocomplete" ref={wrapRef}>
                <div className="ob-addr-field">
                  <input
                    className="ob-addr-input"
                    type="text"
                    placeholder="Начните вводить адрес…"
                    value={addressInput}
                    onChange={e => handleAddressInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") { setSugOpen(false); handleGeocode(); }
                      if (e.key === "Escape") setSugOpen(false);
                    }}
                    onFocus={() => suggestions.length > 0 && setSugOpen(true)}
                    autoFocus
                    autoComplete="off"
                  />
                  {(searching || geocoding) && <span className="ob-addr-spin ob-addr-spin--inline" />}
                </div>

                {sugOpen && suggestions.length > 0 && (
                  <ul className="ob-suggestions">
                    {suggestions.map(s => (
                      <li
                        key={s.place_id}
                        className="ob-suggestion"
                        onMouseDown={() => handleSuggestionSelect(s)}
                      >
                        <svg className="ob-sug-icon" width="12" height="12" viewBox="0 0 24 24"
                          fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                          <circle cx="12" cy="10" r="3"/>
                        </svg>
                        <span className="ob-sug-text">{s.display_name}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {geocodeError && <div className="ob-addr-error">{geocodeError}</div>}

              {warehouseCoords && !geocodeError && (
                <div className="ob-addr-result">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4ade80"
                    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  {inRadiusIds.length} {plural(inRadiusIds.length)} в зоне {RADIUS_KM} км
                </div>
              )}
            </div>

            <button
              className={`ob-cta${!warehouseCoords ? " dim" : ""}`}
              onClick={() => setStep("choose")}
              disabled={!warehouseCoords}
            >
              Продолжить →
            </button>
            <button className="ob-skip-link" onClick={() => setStep("choose")}>
              Пропустить — выбрать вручную
            </button>
          </div>
        )}

        {/* ── Шаг 1: выбор режима и районов ── */}
        {step === "choose" && (
          <div className="ob-choose">
            <div className="ob-tabs">
              <button className={`ob-tab${mode === "districts" ? " sel" : ""}`} onClick={() => setMode("districts")}>
                <span className="ob-tab-icon">📍</span>
                <span className="ob-tab-text">
                  <span className="ob-tab-name">{warehouseCoords ? `Зона ${RADIUS_KM} км` : "Нужные районы"}</span>
                  <span className="ob-tab-sub">{warehouseCoords ? `${inRadiusIds.length} районов автоматически` : "до 4 районов"}</span>
                </span>
              </button>
              <button className={`ob-tab${mode === "all" ? " sel" : ""}`} onClick={() => setMode("all")}>
                <span className="ob-tab-icon">🌐</span>
                <span className="ob-tab-text">
                  <span className="ob-tab-name">Весь город</span>
                  <span className="ob-tab-sub">≈ 40 000 тайлов</span>
                </span>
              </button>
            </div>

            <div className="ob-content">
              {mode === "districts" && (
                <>
                  <div className="ob-pick-bar">
                    <span className="ob-pick-label">
                      {warehouseCoords ? "Районы в вашей зоне" : "Выберите районы"}
                    </span>
                    {!warehouseCoords && (
                      <span className="ob-pick-count">{pickedIds.length} / 4</span>
                    )}
                  </div>
                  <div className="ob-scroll">
                    {shownGroups.map(group => (
                      <div key={group.label} className="ob-group">
                        <div className="ob-group-label">{group.label}</div>
                        <div className="ob-chips">
                          {group.ids.map(id => {
                            const d = DISTRICTS.find(x => x.id === id);
                            if (!d) return null;
                            const on  = pickedIds.includes(id);
                            const off = !on && !warehouseCoords && pickedIds.length >= 4;
                            return (
                              <button
                                key={id}
                                className={`ob-chip${on ? " on" : ""}${off ? " off" : ""}`}
                                onClick={() => !off && toggle(id)}
                                onMouseEnter={() => handleChipHover(id)}
                                onMouseLeave={() => handleChipHover(null)}
                                disabled={off}
                              >
                                {on && <CheckIcon />}
                                {d.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {mode === "all" && (
                <div className="ob-all-body">
                  <div className="ob-all-list">
                    <div className="ob-all-row"><span className="ob-all-icon">🏙</span><span>20 районов Санкт-Петербурга</span></div>
                    <div className="ob-all-row"><span className="ob-all-icon">🌲</span><span>2 района Ленинградской области</span></div>
                    <div className="ob-all-row"><span className="ob-all-icon">💾</span><span>≈ 40 000 – 60 000 тайлов</span></div>
                    <div className="ob-all-row ob-all-warn"><span className="ob-all-icon">⏱</span><span>Загрузка займёт несколько минут</span></div>
                  </div>
                </div>
              )}
            </div>

            <button
              className={`ob-cta${!canStart ? " dim" : ""}`}
              onClick={handleStart}
              disabled={!canStart}
            >
              {mode === "all"
                ? "Скачать весь город"
                : warehouseCoords
                  ? `Скачать зону ${RADIUS_KM} км`
                  : pickedIds.length === 0
                    ? "Выберите хотя бы 1 район"
                    : `Скачать ${pickedIds.length} ${plural(pickedIds.length)}`
              }
            </button>
          </div>
        )}

        {/* ── Шаг 2: загрузка ── */}
        {step === "downloading" && (
          <div className="ob-center">
            <div className="ob-spinner" />
            <div className="ob-dl-name">
              {downloadStatus.phase === "downloading"
                ? isCity ? "Подготовка базового слоя…" : (downloadStatus.name ?? "Скачивание…")
                : "Ожидание…"
              }
            </div>
            {downloadStatus.phase === "downloading" && !isCity && (
              <div className="ob-dl-count">
                {downloadStatus.done.toLocaleString()} / {downloadStatus.total.toLocaleString()} тайлов
              </div>
            )}
            <div className="ob-track"><div className="ob-fill" style={{ width: `${pct}%` }} /></div>
            {visibleQueue.length > 0 && (
              <div className="ob-queue-hint">ещё в очереди: {visibleQueue.map(r => r.name).join(", ")}</div>
            )}
            <button className="ob-cancel-btn" onClick={onCancelAll}>Отмена</button>
          </div>
        )}

        {/* ── Шаг 3: готово ── */}
        {step === "done" && (
          <div className="ob-center">
            <div className="ob-done-check">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4ade80"
                strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <div className="ob-done-title">Карта загружена</div>
            <div className="ob-done-sub">
              {warehouseCoords && addressInput
                ? `Зона ${RADIUS_KM} км от «${addressInput}»`
                : mode === "all"
                  ? "Весь город и ЛО доступны офлайн"
                  : pickedIds.map(id => DISTRICTS.find(d => d.id === id)?.name).filter(Boolean).join(", ")
              }
            </div>
            <button className="ob-open-btn" onClick={handleOpen}>Открыть карту →</button>
          </div>
        )}

      </div>
    </div>
  );
}
