# Курьерская Карта — СПб и Ленобласть

## Overview
This project is a personal application designed for a courier operating in Saint Petersburg and the Leningrad Oblast. Its primary purpose is to provide essential navigation and information features for efficient delivery. Key functionalities include displaying Points of Interest (POIs) such as entrances, gates, passages, parking spots, notes, and staircases. It also offers geocoding services and e-bike specific routing. The long-term vision is to enhance courier efficiency and delivery accuracy within the specified regions.

## User Preferences
Not specified in the original document.

## System Architecture

### UI/UX Decisions
- **Full-screen Map Interface**: The application prioritizes a full-screen map experience without a sidebar for optimal tablet use.
- **Search Bar**: A prominent floating search bar is located top-left for easy access.
- **Navigation Buttons**: Top-right circular SVG buttons for menu (right drawer with tabs for points/filter/stack), add point, locate me, and reset map orientation.
- **Status Indicators**: A bottom-left pill `N/4` displays service statuses (Martin/GraphHopper/OSM/PostGIS) with color-coded indicators.
- **Draft Panel**: A `draft-panel` for creating new points is located bottom-center.
- **MapLibre ScaleControl**: Styled to fit the overall design, positioned bottom-right.
- **Removed Default Controls**: `NavigationControl` (+/-) and `GeolocateControl` were removed to avoid redundancy with custom buttons.
- **3D Buildings**: `fill-extrusion` layer for buildings (zoom 15+) with height based on `building:levels * 3m`, vertical gradient, and interpolated colors from dark blue to lavender. Map starts with `pitch:35 maxPitch:65`.
- **Building Color by Floors**: Flat layer uses interpolated colors based on `building:levels` for immediate recognition of high-rise buildings.
- **Persistent Building Highlight**: Clicking a building or selecting an address highlights it with orange fill and yellow outline, including 3D extrusion. This highlight remains until explicitly dismissed via a `selection-pill` at the top-center.
- **Always Visible House Numbers**: `housenumbers` layer (zoom 13+) with `text-allow-overlap:false`, `text-padding:4`, filtered for Polygons only.
- **Crossings (Pedestrian)**: `crossings` layer displays white points with black outlines for `highway=crossing` / `footway=crossing` / `crossing=*` (zoom 15+), with small "zebra" labels (zoom 17+).
- **POI Pin Icons**: Custom colored "drop" map pins with white letters (П/К/>/N/P/S) for each POI type, drawn via `canvas` and registered with `map.addImage()`.
- **Animated Route Line**: `route-line-dash` layer with RAF-animation for `line-dasharray` to create an "ant march" effect, indicating direction of travel.
- **Turn-by-Turn Instructions**: GraphHopper `steps[]` are saved and displayed. A `▼ N шагов` button in the route panel expands a scrollable list of steps with distances.
- **POI Clustering**: MapLibre native clustering for POIs (`cluster: true, clusterMaxZoom: 15, clusterRadius: 45`). Clicking a cluster zooms in.

### Technical Implementations
- **Frontend**: Next.js 15, TypeScript, MapLibre GL JS (`artifacts/courier-map`).
- **API**: Express, Zod, Pino, drizzle/pg (`artifacts/api-server`).
- **Database**: PostgreSQL 16 with PostGIS 3.5 and h3/h3_postgis.
- **Tiles**: tippecanoe → PMTiles → Martin v0.18 (workflow `Martin tile server`). Tiles are proxied via `/api/tiles/<source>/{z}/{x}/{y}`.
- **Routing**: GraphHopper 10.0 with a custom e-bike profile (workflow `GraphHopper`).
- **Geocoding**: Nominatim as a fallback, with Pelias planned. Includes a custom SPb address normalizer (`lib/spbAddress.ts`) for parsing abbreviations and handling specific address formats.
- **Data Pipeline**: Automated generation of large GIS files (`spb-lo-filtered.osm.pbf`, `spb-lo-filtered.geojsonseq`, `spb-lo.pmtiles`, GraphHopper routing graph) on first run from Geofabrik data.
- **OpenAPI**: Used for API specification with `orval-кодеген` for Zod, React Query, and type generation.
- **Drizzle Schema**: Defined for `pois` (with `h3_r9` trigger) and `courier_routes` (auto `distance_m`).
- **Geolocation**: `navigator.geolocation.getCurrentPosition` for "locate me" functionality.
- **Map Layers**:
    - **Base Map Detail**: Yellow house numbers (`addr:housenumber`, zoom 16+), street names (`name:ru`/`name`, zoom 14+), dotted yellow lines for arches/passages (`tunnel=building_passage`, `covered=arcade`, `footway+tunnel`) from zoom 15+.
    - **Glyphs**: `Noto Sans Regular` and `Noto Sans Bold` fonts are used.
- **Map Interactions**: "Route from me" button in POI popups and search results, automatically fits map to route bounding box.
- **Marker**: "I am here" marker (`me-dot` + `me-accuracy`) shows current position and accuracy.
- **Floating Panel**: Displays distance and time, source (GraphHopper/OSRM), and a clear button.

## External Dependencies
- **PostgreSQL 16**: Database, Replit-managed, with PostGIS 3.5 and h3/h3_postgis extensions.
- **MapLibre GL JS**: Frontend map library.
- **GraphHopper 10.0**: Routing engine, custom e-bike profile.
- **Martin v0.18**: Tile server for PMTiles.
- **Nominatim**: Geocoding service (fallback).
- **OSM (OpenStreetMap)**: Data source for maps and routing.
- **Geofabrik**: Source for OSM data extracts.
- **tippecanoe**: Tool for generating vector tiles.
- **osmium**: Tool for processing OSM data.
- **pnpm**: Package manager.