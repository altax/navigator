import type { TileBounds } from "../utils/tileUtils";

export interface District {
  id: string;
  name: string;
  bounds: TileBounds;
  zMin: number;
  zMax: number;
}

// Bbox для всего города + ближайшего ЛО — используется для базового слоя z10-z13
export const CITY_BASE_BBOX: TileBounds = {
  west: 29.3,
  south: 59.55,
  east: 31.3,
  north: 60.45,
};

// 18 районов Санкт-Петербурга + 2 ближайших района ЛО
export const DISTRICTS: District[] = [
  // ── Центр ────────────────────────────────────────────
  {
    id: "admiralteysky",
    name: "Адмиралтейский",
    bounds: { west: 30.24, south: 59.89, east: 30.34, north: 59.95 },
    zMin: 10, zMax: 16,
  },
  {
    id: "centralny",
    name: "Центральный",
    bounds: { west: 30.28, south: 59.90, east: 30.43, north: 59.97 },
    zMin: 10, zMax: 16,
  },
  {
    id: "vasileo",
    name: "Василеостровский",
    bounds: { west: 30.17, south: 59.90, east: 30.31, north: 59.98 },
    zMin: 10, zMax: 16,
  },
  {
    id: "petrogradsky",
    name: "Петроградский",
    bounds: { west: 30.25, south: 59.94, east: 30.37, north: 60.02 },
    zMin: 10, zMax: 16,
  },
  // ── Север ────────────────────────────────────────────
  {
    id: "primorsky",
    name: "Приморский",
    bounds: { west: 30.14, south: 59.97, east: 30.38, north: 60.09 },
    zMin: 10, zMax: 15,
  },
  {
    id: "vyborg",
    name: "Выборгский",
    bounds: { west: 30.28, south: 59.99, east: 30.50, north: 60.13 },
    zMin: 10, zMax: 15,
  },
  {
    id: "kurortny",
    name: "Курортный",
    bounds: { west: 29.82, south: 60.02, east: 30.24, north: 60.22 },
    zMin: 10, zMax: 14,
  },
  // ── Восток ───────────────────────────────────────────
  {
    id: "kalinin",
    name: "Калининский",
    bounds: { west: 30.36, south: 59.97, east: 30.58, north: 60.07 },
    zMin: 10, zMax: 15,
  },
  {
    id: "krasnogvard",
    name: "Красногвардейский",
    bounds: { west: 30.38, south: 59.88, east: 30.62, north: 59.99 },
    zMin: 10, zMax: 15,
  },
  {
    id: "nevsky",
    name: "Невский",
    bounds: { west: 30.38, south: 59.83, east: 30.62, north: 59.93 },
    zMin: 10, zMax: 15,
  },
  {
    id: "kolpinsky",
    name: "Колпинский",
    bounds: { west: 30.52, south: 59.70, east: 30.77, north: 59.83 },
    zMin: 10, zMax: 15,
  },
  // ── Юг ──────────────────────────────────────────────
  {
    id: "frunzensky",
    name: "Фрунзенский",
    bounds: { west: 30.32, south: 59.83, east: 30.53, north: 59.92 },
    zMin: 10, zMax: 15,
  },
  {
    id: "moskovsky",
    name: "Московский",
    bounds: { west: 30.24, south: 59.81, east: 30.43, north: 59.92 },
    zMin: 10, zMax: 15,
  },
  {
    id: "kirovsky",
    name: "Кировский",
    bounds: { west: 30.19, south: 59.85, east: 30.34, north: 59.95 },
    zMin: 10, zMax: 15,
  },
  {
    id: "krasnoselsky",
    name: "Красносельский",
    bounds: { west: 29.98, south: 59.77, east: 30.29, north: 59.90 },
    zMin: 10, zMax: 14,
  },
  // ── Пригороды ────────────────────────────────────────
  {
    id: "pushkin",
    name: "Пушкинский",
    bounds: { west: 30.24, south: 59.63, east: 30.53, north: 59.81 },
    zMin: 10, zMax: 14,
  },
  {
    id: "petrodvortsovy",
    name: "Петродворцовый",
    bounds: { west: 29.72, south: 59.82, east: 30.23, north: 59.94 },
    zMin: 10, zMax: 14,
  },
  {
    id: "kronshtadt",
    name: "Кронштадтский",
    bounds: { west: 29.63, south: 59.96, east: 30.02, north: 60.08 },
    zMin: 10, zMax: 15,
  },
  // ── Ближайшее ЛО ─────────────────────────────────────
  {
    id: "vsevolozhsky",
    name: "Всеволожский р-н",
    bounds: { west: 30.28, south: 59.88, east: 31.10, north: 60.30 },
    zMin: 10, zMax: 13,
  },
  {
    id: "gatchinsky",
    name: "Гатчинский р-н",
    bounds: { west: 29.80, south: 59.43, east: 30.50, north: 59.70 },
    zMin: 10, zMax: 13,
  },
];

// Группировка для отображения в UI
export const DISTRICT_GROUPS: { label: string; ids: string[] }[] = [
  { label: "Центр",     ids: ["admiralteysky", "centralny", "vasileo", "petrogradsky"] },
  { label: "Север",     ids: ["primorsky", "vyborg", "kurortny"] },
  { label: "Восток",    ids: ["kalinin", "krasnogvard", "nevsky", "kolpinsky"] },
  { label: "Юг",        ids: ["frunzensky", "moskovsky", "kirovsky", "krasnoselsky"] },
  { label: "Пригороды", ids: ["pushkin", "petrodvortsovy", "kronshtadt"] },
  { label: "ЛО",        ids: ["vsevolozhsky", "gatchinsky"] },
];

export function districtById(id: string): District | undefined {
  return DISTRICTS.find((d) => d.id === id);
}
