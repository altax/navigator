export interface StackStatus {
  martin: { up: boolean; label: string; detail: string | null };
  graphhopper: { up: boolean; label: string; detail: string | null };
  pelias: { up: boolean; label: string; detail: string | null };
  postgis: { up: boolean; label: string; detail: string | null };
  basemap: { source: "pmtiles_martin" | "raster_osm_fallback"; url: string };
}
