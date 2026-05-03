import { useState, useEffect, useRef } from "react";
import type { DownloadStatus, DownloadRequest } from "../hooks/useDownloadQueue";
import type { MapMode } from "../hooks/useMapSetup";
import { DISTRICTS, DISTRICT_GROUPS } from "../data/districts";

interface Props {
  downloadStatus: DownloadStatus;
  pendingQueue:   DownloadRequest[];
  onEnqueue:      (req: DownloadRequest) => void;
  onCancelAll:    () => void;
  onComplete:     (mode: MapMode, selectedIds: string[]) => void;
}

type Step = "choose" | "downloading" | "done";

function plural(n: number) { return n === 1 ? "район" : n <= 4 ? "района" : "районов"; }

const CheckIcon = () => (
  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

export function OnboardingScreen({
  downloadStatus, pendingQueue, onEnqueue, onCancelAll, onComplete,
}: Props) {
  const [step,      setStep]      = useState<Step>("choose");
  const [mode,      setMode]      = useState<MapMode>("districts");
  const [pickedIds, setPickedIds] = useState<string[]>([]);

  const downloadStartedRef = useRef(false);
  const prevPhaseRef       = useRef(downloadStatus.phase);

  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = downloadStatus.phase;
    if (!downloadStartedRef.current || step !== "downloading") return;
    if (downloadStatus.phase === "cancelled") {
      downloadStartedRef.current = false;
      setStep("choose");
    } else if (prev !== "idle" && downloadStatus.phase === "idle") {
      setStep("done");
    }
  }, [downloadStatus.phase, step]);

  const toggle = (id: string) =>
    setPickedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id)
        : prev.length >= 4 ? prev
          : [...prev, id],
    );

  const handleStart = () => {
    const list = mode === "all" ? DISTRICTS : DISTRICTS.filter(d => pickedIds.includes(d.id));
    if (!list.length) return;
    list.forEach(d => onEnqueue({ bounds: d.bounds, zMin: d.zMin, zMax: d.zMax, name: d.name, districtId: d.id }));
    downloadStartedRef.current = true;
    setStep("downloading");
  };

  const handleOpen = () => {
    const ids = mode === "all" ? DISTRICTS.map(d => d.id) : pickedIds;
    onComplete(mode, ids);
  };

  const visibleQueue = pendingQueue.filter(r => r.districtId !== "__city_base__");
  const pct    = downloadStatus.total > 0 ? Math.round((downloadStatus.done / downloadStatus.total) * 100) : 0;
  const isCity = downloadStatus.currentDistrictId === "__city_base__";
  const canStart = mode === "all" || pickedIds.length > 0;

  return (
    <div className="ob-overlay">
      <div className="ob-wrap">

        {/* ── Шапка — горизонтальная, компактная ── */}
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

        {/* ── Шаг 1: выбор режима и районов ── */}
        {step === "choose" && (
          <div className="ob-choose">

            {/* Переключатель режима */}
            <div className="ob-tabs">
              <button className={`ob-tab${mode === "districts" ? " sel" : ""}`} onClick={() => setMode("districts")}>
                <span className="ob-tab-icon">📍</span>
                <span className="ob-tab-text">
                  <span className="ob-tab-name">Нужные районы</span>
                  <span className="ob-tab-sub">до 4 районов, быстрее</span>
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

            {/* Основная область — растягивается */}
            <div className="ob-content">

              {mode === "districts" && (
                <>
                  <div className="ob-pick-bar">
                    <span className="ob-pick-label">Выберите районы</span>
                    <span className="ob-pick-count">{pickedIds.length} / 4</span>
                  </div>
                  <div className="ob-scroll">
                    {DISTRICT_GROUPS.map(group => (
                      <div key={group.label} className="ob-group">
                        <div className="ob-group-label">{group.label}</div>
                        <div className="ob-chips">
                          {group.ids.map(id => {
                            const d = DISTRICTS.find(x => x.id === id);
                            if (!d) return null;
                            const on  = pickedIds.includes(id);
                            const off = !on && pickedIds.length >= 4;
                            return (
                              <button
                                key={id}
                                className={`ob-chip${on ? " on" : ""}${off ? " off" : ""}`}
                                onClick={() => !off && toggle(id)}
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
                    <div className="ob-all-row">
                      <span className="ob-all-icon">🏙</span>
                      <span>20 районов Санкт-Петербурга</span>
                    </div>
                    <div className="ob-all-row">
                      <span className="ob-all-icon">🌲</span>
                      <span>2 района Ленинградской области</span>
                    </div>
                    <div className="ob-all-row">
                      <span className="ob-all-icon">💾</span>
                      <span>≈ 40 000 – 60 000 тайлов</span>
                    </div>
                    <div className="ob-all-row ob-all-warn">
                      <span className="ob-all-icon">⏱</span>
                      <span>Загрузка займёт несколько минут</span>
                    </div>
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
            <div className="ob-track">
              <div className="ob-fill" style={{ width: `${pct}%` }} />
            </div>
            {visibleQueue.length > 0 && (
              <div className="ob-queue-hint">
                ещё в очереди: {visibleQueue.map(r => r.name).join(", ")}
              </div>
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
              {mode === "all"
                ? "Весь город и ЛО доступны офлайн"
                : pickedIds.map(id => DISTRICTS.find(d => d.id === id)?.name).filter(Boolean).join(", ")
              }
            </div>
            <button className="ob-open-btn" onClick={handleOpen}>
              Открыть карту →
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
