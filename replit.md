# Карта курьера — СПб и Ленобласть

Личное приложение для курьера: точки доступа (подъезды/калитки/проходы/парковки/заметки/лестницы), геокодинг и маршруты на e-bike по Санкт-Петербургу и Ленинградской области.

## Стек (как просил пользователь)

- **Фронт**: Next.js 15 + TypeScript + MapLibre GL JS (`artifacts/courier-map`)
- **API**: Express + Zod + Pino + drizzle/pg (`artifacts/api-server`, путь `/api`)
- **База**: PostgreSQL 16 + PostGIS 3.5 + h3/h3_postgis (Replit-managed)
- **Тайлы**: tippecanoe → PMTiles → Martin v0.18 (workflow `Martin tile server`, порт 3000)
- **Маршруты**: GraphHopper 10.0 с кастомным e-bike профилем (workflow `GraphHopper`, порт 8000)
- **Геокодер**: Pelias запланирован (Docker only — отложено), сейчас Nominatim как fallback

## Структура

```
artifacts/
├── api-server/         Express, OpenAPI-first, /api/{healthz,pois,routes,geo,stack,tiles}
└── courier-map/        Next.js 15 SPA с MapLibre, темная тема, RU UI
lib/
├── api-spec/           OpenAPI + orval-кодеген (Zod, React Query, types)
└── db/                 drizzle схема: pois (с h3_r9 trigger), courier_routes (auto distance_m)
stack/
├── martin/             config.yaml + run.sh (запускает tippecanoe при первом старте)
└── graphhopper/        config-ebike.yml + ebike.json (custom model) + run.sh
data/                   OSM/PMTiles/GraphHopper graph (gitignored, ~1.5GB)
tools/                  martin v0.18, pmtiles CLI (скачаны однажды)
```

## Точки `/api`

- `GET /healthz` — статус сервера
- `GET /stack/status` — состояние всех сервисов и URL базовой карты
- `GET/POST/PATCH/DELETE /pois` + `/pois/:id` — CRUD точек POI
- `GET/POST/PATCH/DELETE /routes` + `/routes/:id` — CRUD сохранённых маршрутов
- `GET /geo/geocode?q=` — нормализатор СПб-адресов (`lib/spbAddress.ts`) → параллельные structured + free-form Nominatim запросы, дедуп по координатам, отдаёт `parsed.{display,full}` + `match: "structured" | "free"`
- `GET /geo/reverse?lat=&lng=` — Pelias → Nominatim
- `GET /geo/route?from=lat,lng&to=lat,lng&profile=ebike` — GraphHopper → OSRM fallback
- `GET /tiles/*` — прокси к Martin (для PMTiles и pois_layer)

## Запуск (workflows)

| Workflow | Команда | Порт |
|---|---|---|
| `GraphHopper` | `bash stack/graphhopper/run.sh` | 8000 |
| `Martin tile server` | `bash stack/martin/run.sh` | 3000 |
| `artifacts/api-server: API Server` | `pnpm --filter @workspace/api-server run dev` | 8080 |
| `artifacts/courier-map: web` | `pnpm --filter @workspace/courier-map run dev` | dynamic |

Прокси: всё ходит через `localhost:80` → артефакт по path. PMTiles и MVT-тайлы Martin проксируются через `/api/tiles/<source>/{z}/{x}/{y}`, чтобы браузер мог их получить с того же origin.

## Данные

Большие GIS-файлы (>100 МБ) **не хранятся в git** — они создаются автоматически при первом запуске
через `scripts/bootstrap.sh`. Это сделано потому что Replit не поддерживает Git LFS при импорте.

### Пайплайн данных (автоматический)

```
Geofabrik (NW Federal District, ~600 МБ)
  └─> osmium extract bbox 27.5,58.3,36.5,61.5  ──> data/spb-lo-filtered.osm.pbf (~150 МБ)
        ├─> osmium export (GeoJSON)              ──> data/spb-lo-filtered.geojsonseq (~1 ГБ)
        │     └─> tippecanoe (z6-z14)            ──> data/spb-lo.pmtiles [martin/run.sh]
        └─> GraphHopper import                   ──> data/graphhopper/spb-lo-ebike-gh/ [gh/run.sh]
```

### Файлы в git (малые, коммитятся нормально)
- `data/fonts/NotoSans-*.ttf` — шрифты для подписей карты
- `data/graphhopper-web-10.0.jar` (~45 МБ) — JAR GraphHopper
- `data/spb-center.osm.pbf` (~30 МБ) — резерв (центр СПб)
- Git LFS pointer-файлы для больших данных (bootstrap.sh распознаёт их и перегенерирует)

### После импорта с GitHub
При первом старте `bootstrap.sh`:
1. Если `data/spb-lo-filtered.osm.pbf` отсутствует или это LFS-заглушка (<10 МБ):
   - Скачивает NW Federal District с Geofabrik (~600 МБ, **однократно**)
   - Вырезает bbox СПб+ЛО через `osmium extract`
2. Генерирует `data/spb-lo-filtered.geojsonseq` через `osmium export`
3. Martin автоматически строит `data/spb-lo.pmtiles` через tippecanoe (~15 мин)
4. GraphHopper автоматически строит граф маршрутизации (~10-20 мин)

### GraphHopper
Теперь использует `data/spb-lo-filtered.osm.pbf` (не `spb-lo.osm.pbf`) — файл содержит
все теги нужные для e-bike маршрутизации (highway, surface, access, maxspeed, bicycle и т.д.)

При первом запуске workflow автоматически:
- Martin: ждёт geojsonseq → запускает tippecanoe (~15 мин), создаёт `data/spb-lo.pmtiles`, стартует Martin
- GraphHopper: ждёт spb-lo-filtered.osm.pbf → запускает import графа (~10-20 мин), стартует сервер

## Особенности окружения Replit

- **Никогда не запускать длинные процессы через `nohup`+`disown`** — Replit убивает их при выходе из shell. Использовать только workflows.
- Поддерживаемые порты для проксирования: `3000, 3001, 3002, 3003, 4200, 5000, 5173, 6000, 6800, 8000, 8008, 8080, 8099, 9000`.
- Foreground bash-команды агента — таймаут 120 сек.
- `pgrep -f` ловит сам себя (kill self) — использовать `pgrep -x` или PID напрямую.
- WebGL не работает в headless-скриншоттере — карта отрендерится только в реальном Chrome/Firefox/Safari. Приложение это детектит и показывает дружелюбное сообщение.

## Безопасность / секреты

- `DATABASE_URL` — Replit Postgres (PostGIS-enabled).
- `SESSION_SECRET` — есть, но сейчас не используется (single-user app).
- Ничего публичного писать не нужно — приложение для одного курьера.

## Курьерская карта — добавленные слои/UI (для удобства курьера)

Реализованный 3-шаговый план:

1. **Детализация базовой карты** (App.tsx, `appendLabelLayers`):
   - Жёлтые номера домов (`addr:housenumber`, zoom 16+, `Noto Sans Bold`).
   - Названия улиц (`name:ru`/`name`, zoom 14+, `Noto Sans Regular`).
   - Арки/проезды через дома (`tunnel=building_passage`, `covered=arcade`, `footway+tunnel`) — пунктирные жёлтые линии с zoom 15+.
   - Glyphs URL: `https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf` — работают только `Noto Sans Regular` и `Noto Sans Bold` (не `Open Sans`!).

2. **СПб-адресный геокодер** (`api-server/src/lib/spbAddress.ts`):
   - Парсит сокращения: `ул./пр./наб./пер./бул./ш./пл.` → полные формы.
   - Корпус: `к1`, `корп. 1`, `/1`. Литера: `А`, `лит. А`, слитно `11А` → выводится как `11А` для structured-запроса.
   - Город по умолчанию: `Санкт-Петербург`. Bbox для Nominatim: `27.5,61.5,36.5,58.0` (СПб + Ленобласть).
   - В роуте: 3 параллельных Nominatim-запроса (structured + 2 свободных варианта + исходная строка), дедуп по `lat.toFixed(5)|lng.toFixed(5)`, structured-результаты в начало.
   - UI: выпадающий список показывает `понял как: <разбор>` и помечает structured-попадания жёлтой точкой и слегка выделенным фоном.

3. **Маршрут "от меня" в один тап**:
   - Кнопка с прицелом ⌖ в правом верхнем углу карты — `navigator.geolocation.getCurrentPosition` (`enableHighAccuracy`, кеш 30 сек), летим к текущей позиции.
   - Кнопка "→ Маршрут от меня" в попапе любого POI и стрелка → справа от каждого результата поиска.
   - Маршрут рисуется двумя линиями: тёмная подложка (casing) + синяя основная (`route-casing`/`route-line`) под слоем POI, чтобы кружки оставались сверху.
   - Маркер "я здесь" (`me-dot` + `me-accuracy`) — синий круг с белой обводкой и полупрозрачным кругом точности (пересчёт метров→пикселей по широте/зуму).
   - Плавающая панель снизу: расстояние в км, время в мин, источник (graphhopper/osrm), кнопка очистки. Карта автоматически фитится под bbox маршрута.
   - Профиль по умолчанию: `ebike` (GraphHopper custom profile из `stack/graphhopper/ebike.json`).

4. **Курьерский UX (полноэкранная карта, апрель 2026)**:
   - Без сайдбара. Карта на весь экран. Сверху-слева — крупная плавающая строка поиска (под палец на планшете, иконки SVG, тип результата выделен иконкой дома + жёлтой полосой слева).
   - Сверху-справа — 4 круглые кнопки SVG: ☰ меню (выезжает правый drawer с табами «точки/фильтр/стек»), `+` добавить точку, ⌖ найти меня, «сброс» (вернуть наклон/поворот).
   - Снизу-слева — pill `N/4` со статусом сервисов (martin/graphhopper/osm/postgis) с цветным индикатором.
   - Снизу-по центру — `draft-panel` (форма создания точки), снизу-справа — `ScaleControl` MapLibre (стилизован под сайт).
   - **Удалены дефолтные `NavigationControl` (+/−) и `GeolocateControl`** — дублировали наши кнопки `+`/⌖.
   - **3D-здания**: `fill-extrusion` слой `buildings-3d` (z15+), высота `building:levels * 3 m`, base = `min_height`, vertical-gradient, цвет интерполяцией от тёмно-синего к лавандовому. Карта стартует `pitch:35 maxPitch:65`. Плоский `buildings` — только до z16, чтобы не дублировать.
   - **Цвет здания по этажности** (плоский слой): interpolate `building:levels` 1→`#1a2230`, 5→`#2f3650`, 12→`#5b6298`, 25→`#9495cf`. Сразу видно высотки.
   - **Подсветка дома устойчивая**: клик по зданию или выбор адреса из поиска → оранжевая заливка `#fb923c` + жёлтая обводка `#fde047` + 3D-extrusion поверх. Подсветка **не снимается** при закрытии попапа — только по явной кнопке-плашке `× <адрес>` сверху-по центру (`selection-pill`, оранжевый dot, label дома). State: `selectedBuildingInfo` + callback `setSelectedBuilding(feature, label)`.
   - **Подписи домов всегда видимы** (`housenumbers` z13+, `text-allow-overlap:false`, `text-padding:4`, фильтр Polygon только, без `building:part`/`garage`/`shed`/`roof`/`carport`). Размер: 11px@z13 → 16px@z17.
   - **Зебры (пешеходные переходы)**: слой `crossings` — белые точки `#ffffff` с обводкой `#1a1a1a` для `highway=crossing` / `footway=crossing` / `crossing=*` (z15+), плюс мелкие подписи «зебра» (z17+). Курьеру удобно перейти улицу.
   - Без визуальных дублей: один `+` (добавить точку), одна ⌖ (найти меня); зум — жестами; сброс наклона — отдельной кнопкой.

## Улучшения карты (апрель 2026 — v2)

5. **Пин-иконки POI (вместо кружков)**:
   - Каждый тип точки — цветная «капля» (map pin) с белой буквой: П/К/>/N/P/S.
   - Нарисованы через `canvas` (`drawPoiPin`), зарегистрированы через `map.addImage()`.
   - Symbol-слой `pois-icons` с `icon-anchor: "bottom"` — кончик пина точно на координате.

6. **Анимированная пунктирная линия маршрута (ant march)**:
   - Слой `route-line-dash` поверх `route-line` с RAF-анимацией `line-dasharray`.
   - Последовательность из 14 фаз переключается каждые ~55 мс → плавная «бегущая точка» по маршруту.
   - Показывает направление движения — видно с первого взгляда.

7. **Пошаговые инструкции маршрута (turn-by-turn)**:
   - GraphHopper уже возвращал `steps[]` в API — теперь они сохраняются в state и показываются.
   - Кнопка `▼ N шагов` в панели маршрута раскрывает скроллируемый список шагов с расстоянием.
   - Номера шагов — синие кружки, расстояние — жёлтое.

8. **Кластеризация POI (native MapLibre)**:
   - Источник `pois` теперь `cluster: true, clusterMaxZoom: 15, clusterRadius: 45`.
   - Кластерные слои: `pois-clusters` (синие кружки) + `pois-cluster-count` (счётчик).
   - Клик по кластеру → `getClusterExpansionZoom()` → плавное приближение.
   - Индивидуальные POI фильтруются через `["!", ["has", "point_count"]]`.

## Известные ограничения

- **Pelias отложен** — требует Docker + OpenSearch, что неудобно в Replit. Используется Nominatim как fallback (rate-limited 1 req/s — хватает для личного использования).
- **GraphHopper 10 миграция**: убран `vehicle: roads` из профиля (deprecated); удалено `SETT` из ebike.json (невалидный enum в GH 10).
- PMTiles содержит только `building/highway/landuse/name` (tippecanoe сжал теги). Этого хватает для базовой карты.

## Команды

```bash
pnpm run typecheck                       # все артефакты
pnpm --filter @workspace/api-spec run codegen   # перегенерить OpenAPI клиенты
```
