export type PoiType = "entrance" | "gate" | "passage" | "note" | "parking" | "stairs";

export interface Poi {
  id: number;
  type: PoiType;
  title: string;
  description: string | null;
  address: string | null;
  lng: number;
  lat: number;
  h3R9: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StackStatus {
  martin: { up: boolean; label: string; detail: string | null };
  graphhopper: { up: boolean; label: string; detail: string | null };
  pelias: { up: boolean; label: string; detail: string | null };
  postgis: { up: boolean; label: string; detail: string | null };
  basemap: { source: "pmtiles_martin" | "raster_osm_fallback"; url: string };
}

export interface GeocodeResult {
  label: string;
  lng: number;
  lat: number;
  source?: string;
  /** "structured" — точное попадание по улица+дом, "free" — свободный поиск */
  match?: "structured" | "free";
}

export interface GeocodeResponse {
  source: string;
  parsed: { display: string; full: string } | null;
  results: GeocodeResult[];
}

export const POI_TYPE_META: Record<PoiType, { label: string; color: string; icon: string }> = {
  entrance: { label: "Подъезд", color: "#3b82f6", icon: "🚪" },
  gate:     { label: "Калитка/ворота", color: "#10b981", icon: "🚧" },
  passage:  { label: "Проход", color: "#f59e0b", icon: "↪" },
  note:     { label: "Заметка", color: "#a78bfa", icon: "📝" },
  parking:  { label: "Парковка", color: "#06b6d4", icon: "P" },
  stairs:   { label: "Лестница", color: "#ef4444", icon: "↟" },
};
