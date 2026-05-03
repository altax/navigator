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

### Workflows (4 active)
Active workflows (do not remove):
- `Web App` → `bash scripts/start-webapp.sh`
- `API Server` → `bash scripts/start-api.sh`
- `Martin tile server` → `bash stack/martin/run.sh`
- `GraphHopper` → `bash stack/graphhopper/run.sh`

### Frontend (`artifacts/courier-map`)
- **Framework**: Vite 7 + React 19 + TypeScript ~5.9.2
- **Entry**: `index.html` → `src/main.tsx` → `src/app/App.tsx`
- **Map**: MapLibre GL JS v4.7+ with PMTiles protocol
- **Config**: `vite.config.ts` — port 5000, proxy `/api` → localhost:8080, `allowedHosts: true`
- **Key files**:
  - `src/main.tsx` — bootstrap: adaptive worker count `Math.min(4, hardwareConcurrency - 1)`, SW registration
  - `src/app/App.tsx` — main component (map init, icons, click handler, route rendering)
  - `src/app/components/SearchBar.tsx` — debounced geocode search with abort
  - `src/app/utils.ts` — shared utilities (`escapeHtml` for XSS-safe popup content)
  - `src/app/globals.css` — all CSS (dark theme)
  - `src/app/types.ts` — shared TypeScript types (StackStatus interface)
  - `public/sw.js` — Service Worker (tile/POI/font LRU cache, stale-while-revalidate)

### Backend (`artifacts/api-server`)
- **Framework**: Express 5 + TypeScript, bundled with esbuild
- **Build**: `pnpm --filter @workspace/api-server run build` → `artifacts/api-server/dist/index.mjs`
- **Entry**: `src/index.ts` → starts server, tile warmup, watchdog
- **Security middleware** (`src/app.ts`):
  - `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `X-DNS-Prefetch-Control`
  - Body size limit: 512 KB
  - Global JSON error handler (Express 5 async errors → JSON, not HTML)
- **Routes**:
  - `GET /api/healthz` — liveness probe
  - `GET/POST/PATCH/DELETE /api/pois/*` — POI CRUD (PostGIS)
  - `GET/POST/DELETE /api/routes/*` — courier routes
  - `GET /api/geo/geocode` — forward geocoding; rate-limited (15 req/30s per IP); Pelias first, then Nominatim (max 2 parallel requests)
  - `GET /api/geo/reverse` — reverse geocode
  - `GET /api/geo/route` — GraphHopper e-bike, OSRM fallback
  - `GET /api/stack/status` — service health (10s TTL cache)
  - `GET /api/stack/progress` — data pipeline progress (OSM → PMTiles → GraphHopper)
  - `GET /api/tiles/*` — Martin proxy (PMTiles + POI layer + fonts)
  - `POST /api/admin/restart/:service` — manual service restart (protected by `ADMIN_SECRET` env var when set)
- **Lib modules**:
  - `src/lib/workspace.ts` — single WORKSPACE root constant (env → cwd)
  - `src/lib/services.ts` — service health checks with 30s TTL cache
  - `src/lib/watchdog.ts` — auto-restart Martin/GraphHopper after 3 failures
  - `src/lib/logger.ts` — Pino structured logger
  - `src/lib/spbAddress.ts` — SPb address normalizer/parser

### Libraries (`lib/`)
- `lib/db` — Drizzle ORM + pg pool (`db`, `pool`, schema exports)
- `lib/api-spec/openapi.yaml` — OpenAPI 3.1 contract (single source of truth for all types)
- `lib/api-zod` — Orval-generated Zod schemas from openapi.yaml (`PoiType`, etc.)
- `lib/api-client-react` — Orval-generated TanStack Query hooks from openapi.yaml

### Tile Data (`data/`)
- `data/spb-lo.pmtiles` — ~750MB, z5-z14, vector tiles for SPb + Leningrad Oblast
- `data/fonts/` — Noto Sans Regular + Bold for MapLibre glyphs
- Build script: `scripts/z14-bg-build.sh` (osmium → tippecanoe → pmtiles)

### Map Features
- **3D Buildings**: `fill-extrusion` at zoom 15+, height from `building:levels * 3m`
- **House Numbers**: always visible zoom 13+
- **POI Layer**: PostGIS dynamic layer via Martin, cluster at zoom < 15
- **Address Search**: debounced 420ms, abort on rapid typing, structured + free Nominatim (max 2 parallel requests to Nominatim)
- **Building Highlight**: orange selection pill, persists until dismissed
- **Speed**: `fadeDuration:0`, adaptive worker count (2-4), `maxTileCacheSize:600`, SW LRU

## Key Scripts
- `scripts/start-webapp.sh` — starts Vite on port 5000
- `scripts/start-api.sh` — installs deps, inits DB, builds and starts API on 8080
- `scripts/z14-bg-build.sh` — background z14 PMTiles rebuild
- `stack/martin/run.sh` — starts Martin, auto-triggers z14 rebuild if maxzoom < 14
- `stack/graphhopper/run.sh` — starts GraphHopper with e-bike profile

## Database
- PostgreSQL 16 / PostGIS 3.5 / h3_postgis
- Tables: `pois` (with h3_r9 trigger), `courier_routes` (auto distance_m)
- Connection: `DATABASE_URL` env var (Replit managed)

## Codegen Pipeline
Run from `lib/api-spec/`:
```bash
pnpm --filter @workspace/api-spec run codegen
```
Regenerates:
- `lib/api-client-react/src/generated/` — TanStack Query hooks + TypeScript interfaces
- `lib/api-zod/src/generated/` — Zod schemas + TypeScript enums

Always run codegen after changing `openapi.yaml`.

## Architecture Notes
- **POI type validation** (`pois.ts`) uses `PoiType` enum from `@workspace/api-zod` — single source of truth from OpenAPI spec. No hardcoded string sets.
- **Service health checks** are TTL-cached (30s) in `services.ts` — geocode and route requests do NOT fire live HTTP checks per request.
- **WORKSPACE path** resolved via `src/lib/workspace.ts` — never hardcoded. Uses `WORKSPACE_ROOT` env var or `process.cwd()`.
- **Error handling** — Express 5 global error handler in `app.ts` ensures all unhandled async errors return JSON (not HTML).
- **Watchdog** auto-restarts Martin/GraphHopper after 3 consecutive failed health checks (~3 min). Skips Martin restart if tippecanoe is building PMTiles.
- **Nominatim TOS compliance** — geocode endpoint fires at most 2 parallel requests to Nominatim (structured + free-text). Per-IP rate limit (15/30s) prevents abuse.
- **Admin auth** — `POST /api/admin/restart/:service` checks `Authorization: Bearer <ADMIN_SECRET>` if the `ADMIN_SECRET` env var is set. No restriction in local dev.
- **TypeScript strictness** — `tsconfig.base.json` enables `noUnusedLocals`, `strictFunctionTypes`, `strictNullChecks`, `noImplicitAny` across all packages.
- **Dead code** — `scripts/` npm package removed from workspace (hello.ts was the only source, now deleted). Bash scripts in `scripts/` are unaffected.

## Security Checklist
| Control | Status |
|---|---|
| Security headers (X-Content-Type-Options, Referrer-Policy, X-DNS-Prefetch-Control) | ✅ Active |
| Rate limiting on geocode (15 req / 30s / IP) | ✅ Active |
| Nominatim parallel request limit (max 2) | ✅ Active |
| Body size limit (512 KB) | ✅ Active |
| Admin endpoint optional secret auth | ✅ Set `ADMIN_SECRET` env var to enable |
| pnpm supply-chain minimumReleaseAge (1 day) | ✅ Active |
