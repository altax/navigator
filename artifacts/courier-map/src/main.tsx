import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./app/globals.css";
import App from "./app/App";

// ── MapLibre global config — must run BEFORE new Map() ─────────────────────
// prewarm() создаёт WebGL-контекст и пул воркеров немедленно, пока React рендерится.
// Экономим 100–250 мс на первой загрузке карты.
maplibregl.setWorkerCount(6);
maplibregl.setMaxParallelImageRequests(64);
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
