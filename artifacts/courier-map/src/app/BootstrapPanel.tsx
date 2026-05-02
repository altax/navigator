"use client";

import { useState, useEffect, useRef } from "react";
import type { StackStatus } from "./types";

interface Step {
  id: string;
  label: string;
  done: boolean;
  pct: number;
  detail: string;
  active: boolean;
}

interface Progress {
  steps: Step[];
  allDone: boolean;
}

// Примерное время каждого этапа в секундах (для ETA)
const STEP_ETA_SECONDS: Record<string, number> = {
  osm_download:   600,   // скачать OSM-данные
  osm_import:     1200,  // импорт в PostGIS
  fonts_download: 120,   // шрифты
  graphhopper:    600,   // прогрев графа
  martin:         60,    // martin
  pois:           30,    // POI
};

function fmtDuration(sec: number): string {
  if (sec <= 0) return "ещё немного";
  if (sec < 60) return `~${Math.round(sec)} с`;
  const m = Math.round(sec / 60);
  if (m < 60) return `~${m} мин`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `~${h} ч ${rm} мин` : `~${h} ч`;
}

export function BootstrapPanel({ stack }: { stack: StackStatus | null }) {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const startedAtRef = useRef<Record<string, number>>({});  // id → timestamp когда стал active

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch("/api/stack/progress");
        if (r.ok) {
          const p: Progress = await r.json();
          // Фиксируем момент начала каждого активного шага
          p.steps.forEach((s) => {
            if (s.active && !startedAtRef.current[s.id]) {
              startedAtRef.current[s.id] = Date.now();
            }
          });
          setProgress(p);
        }
      } catch {}
    };
    load();
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, []);

  const coreUp = !!(stack?.postgis.up && stack?.martin.up && stack?.graphhopper.up);

  if (dismissed) return null;
  if (!progress) return null;
  if (coreUp && progress.allDone) return null;

  const doneCount = progress.steps.filter((s) => s.done).length;
  const total = progress.steps.length;
  const totalPct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  // Считаем ETA: сумма оставшихся шагов
  const etaSec = progress.steps
    .filter((s) => !s.done)
    .reduce((sum, s) => {
      const expected = STEP_ETA_SECONDS[s.id] ?? 120;
      if (s.active && s.pct > 0) {
        // Оцениваем оставшееся время по прогрессу
        const elapsed = (Date.now() - (startedAtRef.current[s.id] ?? Date.now())) / 1000;
        const rate = s.pct / 100;
        const total = rate > 0.01 ? elapsed / rate : expected;
        return sum + Math.max(0, total - elapsed);
      }
      return sum + expected;
    }, 0);

  if (minimized) {
    return (
      <button
        className="bootstrap-mini"
        onClick={() => setMinimized(false)}
        title="Показать прогресс запуска"
      >
        <span className="bootstrap-mini-spinner">⚙</span>
        <span>{doneCount}/{total}</span>
      </button>
    );
  }

  return (
    <div className="bootstrap-panel">
      <div className="bootstrap-header">
        <span className="bootstrap-title">
          {coreUp && progress.allDone
            ? "✓ Все сервисы готовы"
            : `⚙\u2009Подготовка данных… ${totalPct}%`}
        </span>
        <div className="bootstrap-actions">
          <button
            className="bootstrap-btn"
            onClick={() => setMinimized(true)}
            title="Свернуть"
          >
            −
          </button>
          <button
            className="bootstrap-btn"
            onClick={() => setDismissed(true)}
            title="Закрыть"
          >
            ×
          </button>
        </div>
      </div>

      {/* Общий прогресс-бар */}
      {!progress.allDone && (
        <div className="bs-total-bar">
          <div className="bs-total-fill" style={{ width: `${totalPct}%` }} />
        </div>
      )}

      <div className="bootstrap-steps">
        {progress.steps.map((step) => (
          <div
            key={step.id}
            className={`bs-step ${step.done ? "done" : step.active ? "active" : "waiting"}`}
          >
            <span className="bs-icon">
              {step.done ? "✓" : step.active ? "↻" : "○"}
            </span>
            <div className="bs-body">
              <div className="bs-row">
                <span className="bs-label">{step.label}</span>
                <span className="bs-detail">{step.detail}</span>
              </div>
              {step.active && step.pct > 0 && (
                <div className="bs-bar">
                  <div className="bs-fill" style={{ width: `${step.pct}%` }} />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="bootstrap-footer">
        <div className="bootstrap-services">
          <SvcDot label="PostGIS" up={stack?.postgis.up} />
          <SvcDot label="Тайлы" up={stack?.martin.up} />
          <SvcDot label="Маршруты" up={stack?.graphhopper.up} />
        </div>
        {!progress.allDone && (
          <span className="bootstrap-hint" title="Приблизительное время до готовности">
            ⏱ {fmtDuration(etaSec)}
          </span>
        )}
      </div>
    </div>
  );
}

function SvcDot({ label, up }: { label: string; up?: boolean }) {
  return (
    <span className={`bs-svc ${up ? "up" : "down"}`}>
      <span className="bs-svc-dot" />
      {label}
    </span>
  );
}
