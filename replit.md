# Курьерская Карта — СПб и Ленобласть

## Overview
Personal courier application for Saint Petersburg and Leningrad Oblast. Provides full-screen MapLibre GL map with z14 vector tiles, 3D buildings, POI management (PostGIS), e-bike routing (GraphHopper), and address search (Nominatim). Designed for tablet use.

## Architecture

### Stack
| Service | Port | Notes |
|---|---|---|
| **Vite dev server** (frontend) | 5000 | `Web App` workflow → `bash scripts/start-webapp.sh` |
| **Express API** | 8080 | `API Server` workflow → `bash scripts/start-api.sh` |
| **Martin tile server** | 3000 | `Martin tile server` workflow → `bash stack/martin/run.sh` |
| **GraphHopper** | 8000 | `GraphHopper` workflow → `bash stack/graphhopper/run.sh` |
| **PostgreSQL + PostGIS** | 5432 | Replit-managed, host=`helium` db=`heliumdb` |

### Workflows (4 active, 3 disabled)
Active workflows (do not remove):
- `Web App` → `bash scripts/start-webapp.sh`
- `API Server` → `bash scripts/start-api.sh`
- `Martin tile server` → `bash stack/martin/run.sh`
- `GraphHopper` → `bash stack/graphhopper/run.sh`

Disabled workflows (they FAIL intentionally — `dev` script set to `sleep infinity` to prevent port conflicts):
- `artifacts/courier-map: web` — duplicate of Web App
- `artifacts/api-server: API Server` — duplicate of API Server
- `artifacts/mockup-sandbox: Component Preview Server` — not used in production

### Frontend (`artifacts/courier-map`)
- **Framework**: Vite + React + TypeScript (converted from Next.js — 165ms cold start vs 40s)
- **Entry**: `index.html` → `src/main.tsx` → `src/app/App.tsx`
- **Map**: MapLibre GL JS v4.7+ with PMTiles protocol
- **Config**: `vite.config.ts` — port 5000, proxy `/api` → localhost:8080, `allowedHosts: "all"`
- **Key files**:
  - `src/app/App.tsx` — main component (2378 lines, map init + all logic)
  - `src/app/BootstrapPanel.tsx` — startup progress overlay
  - `src/app/globals.css` — all CSS (dark theme, 1068 lines)
  - `src/app/api.ts` — typed fetch wrappers for `/api/*`
  - `src/app/types.ts` — shared TypeScript types
  - `public/sw.js` — Service Worker (5000-tile LRU cache, v3)

### Backend (`artifacts/api-server`)
- **Framework**: Express 5 + TypeScript, built with esbuild
- **Routes**: `/api/pois`, `/api/geo/geocode`, `/api/geo/route`, `/api/tiles/*` (Martin proxy), `/api/stack/status`, `/api/stack/progress`
- **DB**: Drizzle ORM + PostGIS (lib/db)
- **Geocoding**: Nominatim (primary) with SPb address normalizer
- **Routing**: GraphHopper e-bike profile, fallback to OSRM

### Tile Data (`data/`)
- `data/spb-lo.pmtiles` — 532MB, z5-z14, vector tiles (mvt+gzip) for all of SPb + Leningrad Oblast
- `data/fonts/` — Noto Sans Regular + Bold for MapLibre glyphs
- Build script: `scripts/z14-bg-build.sh` (tippecanoe → pmtiles convert → pmtiles edit)

### Map Features
- **3D Buildings**: `fill-extrusion` at zoom 15+, height from `building:levels * 3m`
- **House Numbers**: always visible zoom 13+
- **POI Clustering**: native MapLibre clustering (clusterMaxZoom=15)
- **Animated Route**: RAF-animated "ant march" dash sequence
- **Turn-by-Turn**: GraphHopper steps with distances
- **Building Highlight**: persistent orange/yellow highlight until dismissed
- **Speed**: `fadeDuration:0`, `setWorkerCount(6)`, `maxTileCacheSize:600`, Service Worker LRU

## Key Scripts
- `scripts/start-webapp.sh` — starts Vite on port 5000 (used by `Web App` workflow)
- `scripts/start-api.sh` — builds and starts Express API on port 8080
- `scripts/z14-bg-build.sh` — background z14 PMTiles rebuild
- `stack/martin/run.sh` — starts Martin, auto-triggers z14 rebuild if maxzoom < 14
- `stack/graphhopper/run.sh` — starts GraphHopper with e-bike profile

## Database
- PostgreSQL 16 / PostGIS 3.5 / h3_postgis
- Tables: `pois` (with h3_r9 trigger), `courier_routes` (auto distance_m)
- Connection: `DATABASE_URL` env var (Replit managed)
