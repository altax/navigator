import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./app/globals.css";
import App from "./app/App";

// ── MapLibre global config — must run BEFORE new Map() ─────────────────────
// Адаптируем количество воркеров и параллельных запросов под железо.
// На 2-ядерном Celeron N3350 (Intel HD 500) избыток воркеров создаёт
// contention и замедляет рендер — снижаем до 2.
const _cores = navigator.hardwareConcurrency ?? 2;
maplibregl.setWorkerCount(_cores <= 2 ? 2 : _cores <= 4 ? 3 : 6);
// Снижаем параллелизм на слабом CPU: 64 одновременных запроса создают
// очередь микротасок в V8, увеличивая задержку первого тайла.
maplibregl.setMaxParallelImageRequests(_cores <= 2 ? 16 : _cores <= 4 ? 32 : 64);
// prewarm() создаёт WebGL-контекст и пул воркеров немедленно, пока React рендерится.
maplibregl.prewarm();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
