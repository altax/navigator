import { useState } from "react";

export type MapMode = "all" | "districts";

export interface MapSetup {
  done:             boolean;
  mode:             MapMode;
  selectedIds:      string[];
  warehouseAddress: string;
  warehouseCoords:  [number, number] | null;
}

const DEFAULT: MapSetup = {
  done:             false,
  mode:             "districts",
  selectedIds:      [],
  warehouseAddress: "",
  warehouseCoords:  null,
};

const LS_KEY = "courier_map_setup_v1";

function readLS(): MapSetup {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT;
    const p = JSON.parse(raw) as Partial<MapSetup>;
    return {
      done:             Boolean(p.done),
      mode:             p.mode === "all" ? "all" : "districts",
      selectedIds:      Array.isArray(p.selectedIds) ? p.selectedIds : [],
      warehouseAddress: typeof p.warehouseAddress === "string" ? p.warehouseAddress : "",
      warehouseCoords:  Array.isArray(p.warehouseCoords) && p.warehouseCoords.length === 2
        ? p.warehouseCoords as [number, number]
        : null,
    };
  } catch { return DEFAULT; }
}

export function useMapSetup() {
  const [setup, _set] = useState<MapSetup>(readLS);

  const save = (next: MapSetup) => {
    _set(next);
    try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch {}
  };

  const completeSetup = (
    mode:             MapMode,
    selectedIds:      string[],
    warehouseAddress: string        = "",
    warehouseCoords:  [number, number] | null = null,
  ) => save({ done: true, mode, selectedIds, warehouseAddress, warehouseCoords });

  const resetSetup = () => save(DEFAULT);

  return { setup, completeSetup, resetSetup };
}
