import type { Poi, StackStatus, GeocodeResponse } from "./types";

const API_BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`${r.status} ${r.statusText}: ${body}`);
  }
  if (r.status === 204) return undefined as T;
  return (await r.json()) as T;
}

export const api = {
  listPois: (params: { types?: string[]; bbox?: [number, number, number, number] } = {}) => {
    const qs = new URLSearchParams();
    if (params.types?.length) qs.set("types", params.types.join(","));
    if (params.bbox) qs.set("bbox", params.bbox.join(","));
    const q = qs.toString();
    return request<Poi[]>(`/pois${q ? `?${q}` : ""}`);
  },
  createPoi: (input: Pick<Poi, "type" | "title" | "lng" | "lat"> & { description?: string | null; address?: string | null }) =>
    request<Poi>("/pois", { method: "POST", body: JSON.stringify(input) }),
  deletePoi: (id: number) => request<void>(`/pois/${id}`, { method: "DELETE" }),
  stackStatus: () => request<StackStatus>("/stack/status"),
  searchAddress: (q: string) =>
    request<GeocodeResponse>(`/geo/geocode?q=${encodeURIComponent(q)}`),
  route: (from: { lat: number; lng: number }, to: { lat: number; lng: number }, profile = "ebike") =>
    request<{
      source: string;
      profile: string;
      distanceM: number;
      durationS: number;
      coordinates: [number, number][];
      steps: Array<{ text: string; distanceM: number; durationS: number }>;
    }>(`/geo/route?from=${from.lat},${from.lng}&to=${to.lat},${to.lng}&profile=${encodeURIComponent(profile)}`),
};
