import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { PoiType } from "@workspace/api-zod";

const router: IRouter = Router();

// POI_TYPES is derived from the generated OpenAPI enum — single source of truth.
const POI_TYPES = new Set(Object.values(PoiType));

type PoiRow = {
  id: number;
  type: string;
  title: string;
  description: string | null;
  address: string | null;
  lng: number;
  lat: number;
  h3_r9: string | null;
  created_at: Date;
  updated_at: Date;
  distance_m?: number;
};

function rowToPoi(r: PoiRow) {
  const out: Record<string, unknown> = {
    id: r.id,
    type: r.type,
    title: r.title,
    description: r.description,
    address: r.address,
    lng: Number(r.lng),
    lat: Number(r.lat),
    h3R9: r.h3_r9,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : r.updated_at,
  };
  if (r.distance_m !== undefined) out.distanceM = Number(r.distance_m);
  return out;
}

router.get("/pois", async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 1000) || 1000, 5000);
  const bbox = typeof req.query.bbox === "string" ? req.query.bbox.split(",").map(Number) : null;
  const types =
    typeof req.query.types === "string"
      ? req.query.types.split(",").filter((t) => POI_TYPES.has(t))
      : null;
  const conds: string[] = [];
  const args: unknown[] = [];
  if (bbox && bbox.length === 4 && bbox.every((n) => Number.isFinite(n))) {
    args.push(bbox[0], bbox[1], bbox[2], bbox[3]);
    conds.push(
      `geom && ST_MakeEnvelope($${args.length - 3}, $${args.length - 2}, $${args.length - 1}, $${args.length}, 4326)`,
    );
  }
  if (types && types.length > 0) {
    args.push(types);
    conds.push(`type = ANY($${args.length}::text[])`);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  args.push(limit);
  const sql = `SELECT id, type, title, description, address,
    ST_X(geom) AS lng, ST_Y(geom) AS lat,
    h3_r9::text AS h3_r9, created_at, updated_at
    FROM pois ${where} ORDER BY id DESC LIMIT $${args.length}`;
  const r = await pool.query<PoiRow>(sql, args);
  res.json(r.rows.map(rowToPoi));
});

router.get("/pois/recent", async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 20) || 20, 100);
  const r = await pool.query<PoiRow>(
    `SELECT id, type, title, description, address,
      ST_X(geom) AS lng, ST_Y(geom) AS lat,
      h3_r9::text AS h3_r9, created_at, updated_at
      FROM pois ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
  res.json(r.rows.map(rowToPoi));
});

router.get("/pois/stats", async (_req, res) => {
  const r = await pool.query<{ type: string; count: string }>(
    `SELECT type, COUNT(*)::text AS count FROM pois GROUP BY type ORDER BY type`,
  );
  const total = r.rows.reduce(
    (acc: number, row: { type: string; count: string }) => acc + Number(row.count),
    0,
  );
  res.json({
    total,
    byType: r.rows.map((row: { type: string; count: string }) => ({
      type: row.type,
      count: Number(row.count),
    })),
  });
});

router.get("/pois/h3", async (req, res) => {
  const resolution = Math.max(5, Math.min(11, Number(req.query.resolution ?? 8) || 8));
  type H3Row = { h3: string; count: string; lng: number; lat: number };
  const r = await pool.query<H3Row>(
    `WITH cells AS (
       SELECT h3_lat_lng_to_cell(geom::point, $1::int) AS cell FROM pois
     )
     SELECT cell::text AS h3, COUNT(*)::text AS count,
       ST_X(h3_cell_to_lat_lng(cell)::geometry) AS lng,
       ST_Y(h3_cell_to_lat_lng(cell)::geometry) AS lat
     FROM cells GROUP BY cell ORDER BY count DESC`,
    [resolution],
  );
  res.json(
    r.rows.map((row: H3Row) => ({
      h3: row.h3,
      count: Number(row.count),
      lng: Number(row.lng),
      lat: Number(row.lat),
    })),
  );
});

router.get("/pois/nearby", async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const radius = Number(req.query.radius ?? 500) || 500;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    res.status(400).json({ error: "lat/lng required" });
    return;
  }
  const r = await pool.query<PoiRow>(
    `SELECT id, type, title, description, address,
       ST_X(geom) AS lng, ST_Y(geom) AS lat,
       h3_r9::text AS h3_r9, created_at, updated_at,
       ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography) AS distance_m
     FROM pois
     WHERE ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, $3)
     ORDER BY distance_m ASC LIMIT 200`,
    [lng, lat, radius],
  );
  res.json(r.rows.map(rowToPoi));
});

router.get("/pois/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const r = await pool.query<PoiRow>(
    `SELECT id, type, title, description, address,
      ST_X(geom) AS lng, ST_Y(geom) AS lat,
      h3_r9::text AS h3_r9, created_at, updated_at
      FROM pois WHERE id = $1`,
    [id],
  );
  if (r.rows.length === 0) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json(rowToPoi(r.rows[0]));
});

router.post("/pois", async (req, res) => {
  const body = req.body as {
    type?: string;
    title?: string;
    description?: string | null;
    address?: string | null;
    lng?: number;
    lat?: number;
  };
  if (!body.type || !POI_TYPES.has(body.type)) {
    res.status(400).json({ error: "invalid type" });
    return;
  }
  if (!body.title || typeof body.title !== "string" || body.title.trim().length === 0) {
    res.status(400).json({ error: "title required" });
    return;
  }
  if (!Number.isFinite(body.lng) || !Number.isFinite(body.lat)) {
    res.status(400).json({ error: "lng/lat required" });
    return;
  }
  const r = await pool.query<PoiRow>(
    `INSERT INTO pois (type, title, description, address, geom)
     VALUES ($1,$2,$3,$4, ST_SetSRID(ST_MakePoint($5,$6),4326))
     RETURNING id, type, title, description, address,
       ST_X(geom) AS lng, ST_Y(geom) AS lat,
       h3_r9::text AS h3_r9, created_at, updated_at`,
    [body.type, body.title.trim(), body.description ?? null, body.address ?? null, body.lng, body.lat],
  );
  res.status(201).json(rowToPoi(r.rows[0]));
});

router.patch("/pois/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const body = req.body as Record<string, unknown>;
  const sets: string[] = [];
  const args: unknown[] = [];
  if (typeof body.type === "string") {
    if (!POI_TYPES.has(body.type)) {
      res.status(400).json({ error: "invalid type" });
      return;
    }
    args.push(body.type);
    sets.push(`type = $${args.length}`);
  }
  if (typeof body.title === "string") {
    args.push(body.title.trim());
    sets.push(`title = $${args.length}`);
  }
  if ("description" in body) {
    args.push(body.description ?? null);
    sets.push(`description = $${args.length}`);
  }
  if ("address" in body) {
    args.push(body.address ?? null);
    sets.push(`address = $${args.length}`);
  }
  if (Number.isFinite(body.lng) && Number.isFinite(body.lat)) {
    args.push(body.lng, body.lat);
    sets.push(`geom = ST_SetSRID(ST_MakePoint($${args.length - 1}, $${args.length}), 4326)`);
  }
  if (sets.length === 0) {
    res.status(400).json({ error: "no fields to update" });
    return;
  }
  args.push(id);
  const r = await pool.query<PoiRow>(
    `UPDATE pois SET ${sets.join(", ")} WHERE id = $${args.length}
     RETURNING id, type, title, description, address,
       ST_X(geom) AS lng, ST_Y(geom) AS lat,
       h3_r9::text AS h3_r9, created_at, updated_at`,
    args,
  );
  if (r.rows.length === 0) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json(rowToPoi(r.rows[0]));
});

router.delete("/pois/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  await pool.query("DELETE FROM pois WHERE id = $1", [id]);
  res.status(204).end();
});

export default router;
