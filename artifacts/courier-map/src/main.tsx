import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./app/globals.css";
import App from "./app/App";

// ── MapLibre global config — must run BEFORE new Map() ─────────────────────
// Worker count: cap at 4, adapt to available hardware, minimum 2.
// Hardcoding 6 wastes resources on devices with 2–4 logical cores.
const workerCount = Math.max(2, Math.min(4, (navigator.hardwareConcurrency ?? 4) - 1));
maplibregl.setWorkerCount(workerCount);

// prewarm() creates a WebGL context and worker pool immediately while React
// renders — saves 100–250 ms on first map load.
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
