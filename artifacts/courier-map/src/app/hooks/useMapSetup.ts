import { useState } from "react";

export type MapMode = "all" | "districts";

export interface MapSetup {
  done: boolean;
  mode: MapMode;
  selectedIds: string[];
}

const DEFAULT: MapSetup = { done: false, mode: "districts", selectedIds: [] };
const LS_KEY = "courier_map_setup_v1";

function readLS(): MapSetup {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT;
    const p = JSON.parse(raw) as Partial<MapSetup>;
    return {
      done:        Boolean(p.done),
      mode:        p.mode === "all" ? "all" : "districts",
      selectedIds: Array.isArray(p.selectedIds) ? p.selectedIds : [],
    };
  } catch { return DEFAULT; }
}

export function useMapSetup() {
  const [setup, _set] = useState<MapSetup>(readLS);

  const save = (next: MapSetup) => {
    _set(next);
    try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch {}
  };

  const completeSetup = (mode: MapMode, selectedIds: string[]) =>
    save({ done: true, mode, selectedIds });

  const resetSetup = () => save(DEFAULT);

  return { setup, completeSetup, resetSetup };
}
