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

export function OnboardingScreen({
  downloadStatus, pendingQueue, onEnqueue, onCancelAll, onComplete,
}: Props) {
  const [step,      setStep]      = useState<Step>("choose");
  const [mode,      setMode]      = useState<MapMode>("districts");
  const [pickedIds, setPickedIds] = useState<string[]>([]);

  const downloadStartedRef = useRef(false);
  const prevPhaseRef       = useRef(downloadStatus.phase);

  // ── Следим за завершением загрузки ────────────────────────────────────────
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

  // ── Чекбокс района (макс. 4) ───────────────────────────────────────────────
  const toggle = (id: string) => {
    setPickedIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 4)  return prev;
      return [...prev, id];
    });
  };

  // ── Запуск загрузки ────────────────────────────────────────────────────────
  const handleStart = () => {
    const districts = mode === "all"
      ? DISTRICTS
      : DISTRICTS.filter(d => pickedIds.includes(d.id));
    if (districts.length === 0) return;
    districts.forEach(d =>
      onEnqueue({ bounds: d.bounds, zMin: d.zMin, zMax: d.zMax, name: d.name, districtId: d.id }),
    );
    downloadStartedRef.current = true;
    setStep("downloading");
  };

  // ── Открыть карту ─────────────────────────────────────────────────────────
  const handleOpen = () => {
    const finalIds = mode === "all" ? DISTRICTS.map(d => d.id) : pickedIds;
    onComplete(mode, finalIds);
  };

  const visibleQueue = pendingQueue.filter(r => r.districtId !== "__city_base__");
  const pct = downloadStatus.total > 0
    ? Math.round((downloadStatus.done / downloadStatus.total) * 100)
    : 0;
  const isCity = downloadStatus.currentDistrictId === "__city_base__";
  const canStart = mode === "all" || pickedIds.length > 0;

  const pluralRayonov = (n: number) =>
    n === 1 ? "район" : n <= 4 ? "района" : "районов";

  return (
    <div className="ob-overlay">
      <div className="ob-card">

        {/* Шапка */}
        <div className="ob-header">
          <div className="ob-logo-icon">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
          </div>
          <h1 className="ob-title">Карта курьера</h1>
          <p className="ob-subtitle">Санкт-Петербург и Ленинградская область</p>
        </div>

        {/* ── Шаг 1: выбор ──────────────────────────────────────────────────── */}
        {step === "choose" && (
          <>
            <h2 className="ob-section-title">Что загрузить офлайн?</h2>

            <div className="ob-mode-grid">
              <button
                className={`ob-mode-card${mode === "districts" ? " selected" : ""}`}
                onClick={() => setMode("districts")}
              >
                <span className="ob-mode-icon">📍</span>
                <span className="ob-mode-name">Нужные районы</span>
                <span className="ob-mode-desc">До 4 районов,<br/>быстрее и компактнее</span>
              </button>
              <button
                className={`ob-mode-card${mode === "all" ? " selected" : ""}`}
                onClick={() => setMode("all")}
              >
                <span className="ob-mode-icon">🌐</span>
                <span className="ob-mode-name">Весь город</span>
                <span className="ob-mode-desc">Всё СПб и ЛО,<br/>≈ 40 000 тайлов</span>
              </button>
            </div>

            {mode === "districts" && (
              <div className="ob-picker">
                <div className="ob-picker-hint">
                  Выбрано районов: <strong>{pickedIds.length}</strong> / 4
                </div>
                {DISTRICT_GROUPS.map(group => (
                  <div key={group.label} className="ob-group">
                    <div className="ob-group-label">{group.label}</div>
                    <div className="ob-district-grid">
                      {group.ids.map(id => {
                        const d = DISTRICTS.find(x => x.id === id);
                        if (!d) return null;
                        const checked  = pickedIds.includes(id);
                        const maxed    = !checked && pickedIds.length >= 4;
                        return (
                          <button
                            key={id}
                            className={`ob-district-btn${checked ? " checked" : ""}${maxed ? " maxed" : ""}`}
                            onClick={() => !maxed && toggle(id)}
                            disabled={maxed}
                          >
                            {checked && (
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round">
                                <polyline points="20 6 9 17 4 12"/>
                              </svg>
                            )}
                            {d.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              className={`ob-start-btn${!canStart ? " disabled" : ""}`}
              onClick={handleStart}
              disabled={!canStart}
            >
              {mode === "all"
                ? "Скачать весь город"
                : pickedIds.length === 0
                  ? "Выберите хотя бы 1 район"
                  : `Скачать ${pickedIds.length} ${pluralRayonov(pickedIds.length)}`
              }
            </button>
          </>
        )}

        {/* ── Шаг 2: загрузка ───────────────────────────────────────────────── */}
        {step === "downloading" && (
          <div className="ob-progress-view">
            <div className="ob-progress-spinner" />
            <div className="ob-progress-label">
              {downloadStatus.phase === "downloading"
                ? isCity
                  ? "Подготовка базового слоя…"
                  : (downloadStatus.name ?? "Скачивание…")
                : "Ожидание…"
              }
            </div>
            {downloadStatus.phase === "downloading" && !isCity && (
              <div className="ob-progress-count">
                {downloadStatus.done.toLocaleString()} / {downloadStatus.total.toLocaleString()} тайлов
              </div>
            )}
            <div className="ob-progress-track">
              <div className="ob-progress-fill" style={{ width: `${pct}%` }} />
            </div>
            {visibleQueue.length > 0 && (
              <div className="ob-queue-hint">
                ещё в очереди: {visibleQueue.map(r => r.name).join(", ")}
              </div>
            )}
            <button className="ob-cancel-btn" onClick={onCancelAll}>
              Отмена
            </button>
          </div>
        )}

        {/* ── Шаг 3: готово ─────────────────────────────────────────────────── */}
        {step === "done" && (
          <div className="ob-done-view">
            <div className="ob-done-check">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <div className="ob-done-title">Карта загружена</div>
            <div className="ob-done-desc">
              {mode === "all"
                ? "Весь город и ЛО доступны офлайн"
                : pickedIds
                    .map(id => DISTRICTS.find(d => d.id === id)?.name)
                    .filter(Boolean)
                    .join(", ")
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
