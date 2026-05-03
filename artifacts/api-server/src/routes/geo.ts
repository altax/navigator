import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import { GRAPHHOPPER_URL, PELIAS_URL, checkGraphHopper, checkPelias } from "../lib/services";
import { parseSpbAddress, nominatimStructuredParams } from "../lib/spbAddress";

const router: IRouter = Router();

const SPB_FOCUS = { lat: 59.9343, lng: 30.3351 };
const NOMINATIM_HEADERS = { "User-Agent": "courier-map-spb-personal/0.1 (self-hosted)" };
const NOMINATIM_VIEWBOX = "27.5,61.5,36.5,58.0";

// ── Geocode rate limiter ────────────────────────────────────────────────────
// Nominatim's usage policy allows max 1 request/second.
// We limit each client IP to 15 geocode requests per 30 seconds (0.5 req/s
// on average), which is safe even with our Nominatim fallback logic.
// The SearchBar has a 420ms debounce so legitimate use stays well under this.
const geocodeRateLimiter = rateLimit({
  windowMs: 30_000,
  max: 15,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      error: "too_many_requests",
      detail: "Geocode rate limit exceeded. Please wait before searching again.",
    });
  },
});

interface NominatimRow {
  display_name: string;
  lat: string;
  lon: string;
  type?: string;
  class?: string;
  importance?: number;
}

interface GeoResult {
  label: string;
  lng: number;
  lat: number;
  source: string;
  /** "structured" — exact match on street+house, "free" — general search */
  match: "structured" | "free";
}

async function nominatimSearch(params: Record<string, string>, limit: number): Promise<NominatimRow[]> {
  const u = new URL("https://nominatim.openstreetmap.org/search");
  u.searchParams.set("format", "json");
  u.searchParams.set("limit", String(limit));
  u.searchParams.set("accept-language", "ru");
  u.searchParams.set("viewbox", NOMINATIM_VIEWBOX);
  u.searchParams.set("bounded", "1");
  u.searchParams.set("addressdetails", "0");
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const r = await fetch(u, { headers: NOMINATIM_HEADERS });
  if (!r.ok) return [];
  return (await r.json()) as NominatimRow[];
}

function dedupeByCoord<T extends { lat: number; lng: number }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    const key = `${r.lat.toFixed(5)}|${r.lng.toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

router.get("/geo/geocode", geocodeRateLimiter, async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  const limit = Math.min(Number(req.query.limit ?? 8) || 8, 20);
  if (!q) {
    res.status(400).json({ error: "q required" });
    return;
  }

  // Try Pelias first (self-hosted, no rate limit concerns)
  const pelias = await checkPelias();
  if (pelias.up) {
    try {
      const u = new URL(`${PELIAS_URL}/v1/autocomplete`);
      u.searchParams.set("text", q);
      u.searchParams.set("size", String(limit));
      u.searchParams.set("focus.point.lat", String(SPB_FOCUS.lat));
      u.searchParams.set("focus.point.lon", String(SPB_FOCUS.lng));
      const r = await fetch(u);
      const data = (await r.json()) as {
        features?: Array<{
          geometry: { coordinates: [number, number] };
          properties: { label: string };
        }>;
      };
      res.json({
        source: "pelias",
        parsed: null,
        results: (data.features ?? []).map((f) => ({
          label: f.properties.label,
          lng: f.geometry.coordinates[0],
          lat: f.geometry.coordinates[1],
          source: "pelias",
          match: "free" as const,
        })),
      });
      return;
    } catch (e) {
      req.log?.warn({ err: (e as Error).message }, "pelias failed");
    }
  }

  // ── Nominatim fallback ──────────────────────────────────────────────────
  // To respect Nominatim's 1 req/sec policy we fire at most 2 parallel requests:
  //   1) Structured search (most accurate, used when address is parseable)
  //   2) Raw free-text search (always, as a safety net)
  // The intermediate variant searches (house without litera, street only) are
  // intentionally omitted — they would fire extra requests and add little value
  // given the structured + free pair already covers the main cases.
  try {
    const parsed = parseSpbAddress(q);
    const tasks: Promise<{ rows: NominatimRow[]; match: "structured" | "free" }>[] = [];

    if (parsed) {
      // Structured search — highest quality, based on parsed street/house
      tasks.push(
        nominatimSearch(nominatimStructuredParams(parsed), limit).then((rows) => ({
          rows,
          match: "structured" as const,
        })),
      );
    }

    // Raw free-text search — always included as reliable fallback
    tasks.push(
      nominatimSearch({ q, countrycodes: "ru" }, limit).then((rows) => ({
        rows,
        match: parsed ? ("free" as const) : ("free" as const),
      })),
    );

    const settled = await Promise.allSettled(tasks);
    const merged: GeoResult[] = [];
    for (const r of settled) {
      if (r.status !== "fulfilled") continue;
      for (const row of r.value.rows) {
        merged.push({
          label: row.display_name,
          lng: Number(row.lon),
          lat: Number(row.lat),
          source: "nominatim",
          match: r.value.match,
        });
      }
    }

    // Structured results first, then free-text
    merged.sort((a, b) =>
      a.match === "structured" && b.match !== "structured"
        ? -1
        : a.match !== "structured" && b.match === "structured"
          ? 1
          : 0,
    );

    const unique = dedupeByCoord(merged).slice(0, limit);
    res.json({
      source: parsed ? "nominatim+spb" : "nominatim",
      parsed: parsed ? { display: parsed.display, full: parsed.full } : null,
      results: unique,
    });
  } catch (e) {
    res.status(502).json({ error: "geocoding upstream failed", detail: (e as Error).message });
  }
});

router.get("/geo/reverse", async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    res.status(400).json({ error: "lat/lng required" });
    return;
  }
  const pelias = await checkPelias();
  if (pelias.up) {
    try {
      const u = new URL(`${PELIAS_URL}/v1/reverse`);
      u.searchParams.set("point.lat", String(lat));
      u.searchParams.set("point.lon", String(lng));
      const r = await fetch(u);
      const data = (await r.json()) as {
        features?: Array<{ properties: { label: string } & Record<string, string> }>;
      };
      const f = data.features?.[0];
      res.json({ source: "pelias", label: f?.properties?.label ?? null, address: f?.properties ?? null });
      return;
    } catch {
      // fall through to Nominatim
    }
  }
  try {
    const u = new URL("https://nominatim.openstreetmap.org/reverse");
    u.searchParams.set("lat", String(lat));
    u.searchParams.set("lon", String(lng));
    u.searchParams.set("format", "json");
    u.searchParams.set("accept-language", "ru");
    const r = await fetch(u, { headers: NOMINATIM_HEADERS });
    const data = (await r.json()) as { display_name?: string; address?: Record<string, string> };
    res.json({
      source: "nominatim",
      label: data.display_name ?? null,
      address: data.address ?? null,
    });
  } catch (e) {
    res.status(502).json({ error: "reverse geocoding failed", detail: (e as Error).message });
  }
});

router.get("/geo/route", async (req, res) => {
  const from = String(req.query.from ?? "").split(",").map(Number);
  const to = String(req.query.to ?? "").split(",").map(Number);
  const profile = String(req.query.profile ?? "ebike");
  if (
    from.length !== 2 ||
    to.length !== 2 ||
    from.some((n) => !Number.isFinite(n)) ||
    to.some((n) => !Number.isFinite(n))
  ) {
    res.status(400).json({ error: "from and to must be 'lat,lng'" });
    return;
  }
  const gh = await checkGraphHopper();
  if (gh.up) {
    try {
      const u = new URL(`${GRAPHHOPPER_URL}/route`);
      u.searchParams.append("point", `${from[0]},${from[1]}`);
      u.searchParams.append("point", `${to[0]},${to[1]}`);
      u.searchParams.set("profile", profile);
      u.searchParams.set("points_encoded", "false");
      u.searchParams.set("instructions", "true");
      u.searchParams.set("locale", "ru");
      const r = await fetch(u);
      const data = (await r.json()) as {
        paths?: Array<{
          distance: number;
          time: number;
          points: { coordinates: number[][] };
          instructions?: Array<{ text: string; distance: number; time: number }>;
        }>;
      };
      const p = data.paths?.[0];
      if (p) {
        res.json({
          source: "graphhopper",
          profile,
          distanceM: p.distance,
          durationS: p.time / 1000,
          coordinates: p.points.coordinates,
          steps: (p.instructions ?? []).map((s) => ({
            text: s.text,
            distanceM: s.distance,
            durationS: s.time / 1000,
          })),
        });
        return;
      }
    } catch (e) {
      req.log?.warn({ err: (e as Error).message }, "graphhopper failed");
    }
  }

  // OSRM fallback
  const osrmProfile = profile === "car" ? "car" : profile === "foot" ? "foot" : "bike";
  try {
    const u = `https://router.project-osrm.org/route/v1/${osrmProfile}/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson&steps=true`;
    const r = await fetch(u);
    const data = (await r.json()) as {
      routes?: Array<{
        distance: number;
        duration: number;
        geometry: { coordinates: number[][] };
        legs?: Array<{
          steps?: Array<{
            name?: string;
            distance: number;
            duration: number;
            maneuver?: { type?: string };
          }>;
        }>;
      }>;
    };
    const rt = data.routes?.[0];
    if (!rt) {
      res.status(502).json({ error: "no route" });
      return;
    }
    const steps = (rt.legs ?? []).flatMap(
      (l) =>
        l.steps?.map((s) => ({
          text: `${s.maneuver?.type ?? "go"}${s.name ? ` — ${s.name}` : ""}`,
          distanceM: s.distance,
          durationS: s.duration,
        })) ?? [],
    );
    res.json({
      source: "osrm",
      profile,
      distanceM: rt.distance,
      durationS: rt.duration,
      coordinates: rt.geometry.coordinates,
      steps,
    });
  } catch (e) {
    res.status(502).json({ error: "routing upstream failed", detail: (e as Error).message });
  }
});

export default router;
