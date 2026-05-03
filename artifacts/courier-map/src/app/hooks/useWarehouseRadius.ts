import type { District } from "../data/districts";
import type { TileBounds } from "../utils/tileUtils";

export const RADIUS_KM = 6;

/** Haversine distance in km between two [lng, lat] points */
export function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLng = ((b[0] - a[0]) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat ** 2 +
    Math.cos((a[1] * Math.PI) / 180) * Math.cos((b[1] * Math.PI) / 180) * sinLng ** 2;
  return R * 2 * Math.asin(Math.sqrt(h));
}

/** Bounding box of a circle as TileBounds */
export function circleTileBounds(center: [number, number], radiusKm: number): TileBounds {
  const latDeg = radiusKm / 111.32;
  const lngDeg = radiusKm / (111.32 * Math.cos((center[1] * Math.PI) / 180));
  return {
    west:  center[0] - lngDeg,
    east:  center[0] + lngDeg,
    south: center[1] - latDeg,
    north: center[1] + latDeg,
  };
}

/** Circle polygon as GeoJSON coordinates ring */
export function circleRing(center: [number, number], radiusKm: number, steps = 64): [number, number][] {
  const latDeg = radiusKm / 111.32;
  const lngDeg = radiusKm / (111.32 * Math.cos((center[1] * Math.PI) / 180));
  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    pts.push([center[0] + lngDeg * Math.cos(a), center[1] + latDeg * Math.sin(a)]);
  }
  return pts;
}

/** District IDs whose bounding boxes intersect the circle */
export function districtIdsInRadius(
  districts: District[],
  center: [number, number],
  radiusKm: number,
): string[] {
  return districts
    .filter(d => {
      const { west, south, east, north } = d.bounds;
      const cx = Math.max(west,  Math.min(center[0], east));
      const cy = Math.max(south, Math.min(center[1], north));
      return haversineKm(center, [cx, cy]) <= radiusKm;
    })
    .map(d => d.id);
}

/** Geocode an address via Nominatim (needs internet — only called once at setup) */
export async function geocodeAddress(address: string): Promise<[number, number]> {
  const q = address.toLowerCase().includes("санкт") || address.toLowerCase().includes("спб")
    ? address
    : `${address}, Санкт-Петербург`;
  const url =
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=ru`;
  const resp = await fetch(url, {
    headers: { "Accept-Language": "ru", "User-Agent": "courier-map/1.0" },
  });
  if (!resp.ok) throw new Error("Сервис геокодирования недоступен");
  const data = await resp.json() as { lat: string; lon: string }[];
  if (!data.length) throw new Error("Адрес не найден. Уточните запрос");
  return [parseFloat(data[0].lon), parseFloat(data[0].lat)];
}
