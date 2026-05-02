export const MARTIN_URL = process.env.MARTIN_URL ?? "http://127.0.0.1:3000";
export const GRAPHHOPPER_URL = process.env.GRAPHHOPPER_URL ?? "http://127.0.0.1:8000";
export const PELIAS_URL = process.env.PELIAS_URL ?? "http://127.0.0.1:4000";

// Таймаут уменьшен до 400ms — мы на локальном хосте, 1500ms был избыточным
async function fetchWithTimeout(url: string, ms = 400): Promise<Response | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    return r;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function checkMartin(): Promise<{ up: boolean; detail: string | null }> {
  const r = await fetchWithTimeout(`${MARTIN_URL}/health`);
  if (r && r.ok) return { up: true, detail: "Martin tile server" };
  return { up: false, detail: "Martin not reachable — using raster OSM fallback" };
}

export async function checkGraphHopper(): Promise<{ up: boolean; detail: string | null }> {
  const r = await fetchWithTimeout(`${GRAPHHOPPER_URL}/health`);
  if (r && r.ok) return { up: true, detail: "GraphHopper e-bike profile" };
  return { up: false, detail: "GraphHopper not running — using OSRM fallback" };
}

export async function checkPelias(): Promise<{ up: boolean; detail: string | null }> {
  const r = await fetchWithTimeout(`${PELIAS_URL}/v1/status`);
  if (r && r.ok) return { up: true, detail: "Pelias geocoder" };
  return { up: false, detail: "Pelias not running — using Nominatim fallback" };
}
