"use client";

import { useState, useEffect } from "react";
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

export function BootstrapPanel({ stack }: { stack: StackStatus | null }) {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch("/api/stack/progress");
        if (r.ok) setProgress(await r.json());
      } catch {}
    };
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  const coreUp = !!(stack?.postgis.up && stack?.martin.up && stack?.graphhopper.up);

  if (dismissed) return null;
  if (!progress) return null;
  if (coreUp && progress.allDone) return null;

  const doneCount = progress.steps.filter((s) => s.done).length;
  const total = progress.steps.length;

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
            : "⚙\u2009Подготовка данных…"}
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
          <SvcDot label="Martin" up={stack?.martin.up} />
          <SvcDot label="GraphHopper" up={stack?.graphhopper.up} />
        </div>
        {!progress.allDone && (
          <span className="bootstrap-hint">
            Первый запуск: ~30–45 мин
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
