export const MARTIN_URL = process.env.MARTIN_URL ?? "http://127.0.0.1:3000";
export const GRAPHHOPPER_URL = process.env.GRAPHHOPPER_URL ?? "http://127.0.0.1:8000";
export const PELIAS_URL = process.env.PELIAS_URL ?? "http://127.0.0.1:4000";

// ── In-memory TTL cache ─────────────────────────────────────────────────────
// Service health checks are cached for SERVICE_CACHE_TTL_MS.
// This prevents routes like /geo/geocode from firing a live HTTP health-check
// on every user request (which added up to 400 ms latency per call).
const SERVICE_CACHE_TTL_MS = 30_000;

type ServiceResult = { up: boolean; detail: string | null };
type CachedResult = ServiceResult & { expiresAt: number };

const _cache = new Map<string, CachedResult>();

async function cachedCheck(
  key: string,
  fn: () => Promise<ServiceResult>,
): Promise<ServiceResult> {
  const now = Date.now();
  const hit = _cache.get(key);
  if (hit && now < hit.expiresAt) {
    return { up: hit.up, detail: hit.detail };
  }
  const result = await fn();
  _cache.set(key, { ...result, expiresAt: now + SERVICE_CACHE_TTL_MS });
  return result;
}

// ── Low-level fetch with timeout ────────────────────────────────────────────
// 400 ms is sufficient for localhost; don't wait longer.
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

// ── Exported health-check functions (TTL-cached) ───────────────────────────

export async function checkMartin(): Promise<ServiceResult> {
  return cachedCheck("martin", async () => {
    const r = await fetchWithTimeout(`${MARTIN_URL}/health`);
    return r?.ok
      ? { up: true, detail: "Martin tile server" }
      : { up: false, detail: "Martin not reachable — using raster OSM fallback" };
  });
}

export async function checkGraphHopper(): Promise<ServiceResult> {
  return cachedCheck("graphhopper", async () => {
    const r = await fetchWithTimeout(`${GRAPHHOPPER_URL}/health`);
    return r?.ok
      ? { up: true, detail: "GraphHopper e-bike profile" }
      : { up: false, detail: "GraphHopper not running — using OSRM fallback" };
  });
}

export async function checkPelias(): Promise<ServiceResult> {
  return cachedCheck("pelias", async () => {
    const r = await fetchWithTimeout(`${PELIAS_URL}/v1/status`);
    return r?.ok
      ? { up: true, detail: "Pelias geocoder" }
      : { up: false, detail: "Pelias not running — using Nominatim fallback" };
  });
}

/** Invalidate the cached status for a specific service (e.g. after restart). */
export function invalidateServiceCache(key: "martin" | "graphhopper" | "pelias"): void {
  _cache.delete(key);
}
