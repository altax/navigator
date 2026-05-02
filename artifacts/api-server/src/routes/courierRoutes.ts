import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";

const router: IRouter = Router();

type RouteRow = {
  id: number;
  name: string;
  description: string | null;
  geojson: string;
  distance_m: number | null;
  created_at: Date;
  updated_at: Date;
};

function rowToRoute(r: RouteRow) {
  const parsed = JSON.parse(r.geojson) as { coordinates: number[][] };
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    coordinates: parsed.coordinates,
    distanceM: r.distance_m == null ? null : Number(r.distance_m),
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : r.updated_at,
  };
}

router.get("/routes", async (_req, res) => {
  const r = await pool.query<RouteRow>(
    `SELECT id, name, description, ST_AsGeoJSON(geom) AS geojson,
      distance_m, created_at, updated_at FROM courier_routes ORDER BY id DESC`,
  );
  res.json(r.rows.map(rowToRoute));
});

router.post("/routes", async (req, res) => {
  const body = req.body as {
    name?: string;
    description?: string | null;
    coordinates?: number[][];
  };
  if (!body.name || typeof body.name !== "string" || body.name.trim().length === 0) {
    res.status(400).json({ error: "name required" });
    return;
  }
  if (!Array.isArray(body.coordinates) || body.coordinates.length < 2) {
    res.status(400).json({ error: "coordinates must have at least 2 points" });
    return;
  }
  const valid = body.coordinates.every(
    (p) => Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]),
  );
  if (!valid) {
    res.status(400).json({ error: "invalid coordinates" });
    return;
  }
  const geo = { type: "LineString", coordinates: body.coordinates };
  const r = await pool.query<RouteRow>(
    `INSERT INTO courier_routes (name, description, geom)
     VALUES ($1, $2, ST_SetSRID(ST_GeomFromGeoJSON($3), 4326))
     RETURNING id, name, description, ST_AsGeoJSON(geom) AS geojson,
       distance_m, created_at, updated_at`,
    [body.name.trim(), body.description ?? null, JSON.stringify(geo)],
  );
  res.status(201).json(rowToRoute(r.rows[0]));
});

router.delete("/routes/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  await pool.query("DELETE FROM courier_routes WHERE id = $1", [id]);
  res.status(204).end();
});

export default router;
