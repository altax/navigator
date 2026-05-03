import { useCallback, useState } from "react";
import { tileUrls } from "../utils/tileUtils";
import type { TileBounds } from "../utils/tileUtils";

export interface DownloadedZone {
  id: string;
  downloadedAt: number;
  tileCount: number;
  bounds: TileBounds;
  zMin: number;
  zMax: number;
}

const STORAGE_KEY = "courier_downloaded_zones";
const TILE_CACHE  = "courier-tiles-v4";
const MAX_ZONES   = 20;

function load(): DownloadedZone[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function save(zones: DownloadedZone[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(zones));
}

export function useDownloadedZones() {
  const [zones, setZones] = useState<DownloadedZone[]>(load);

  const addZone = useCallback((zone: DownloadedZone) => {
    setZones((prev) => {
      const next = [zone, ...prev].slice(0, MAX_ZONES);
      save(next);
      return next;
    });
  }, []);

  const removeZone = useCallback(async (id: string) => {
    let removed: DownloadedZone | undefined;
    setZones((prev) => {
      removed = prev.find((z) => z.id === id);
      const next = prev.filter((z) => z.id !== id);
      save(next);
      return next;
    });
    // Вычищаем тайлы этой зоны из кеша SW (best-effort)
    if (removed && "caches" in window) {
      try {
        const cache = await caches.open(TILE_CACHE);
        const urls = tileUrls(removed.bounds, removed.zMin, removed.zMax);
        await Promise.allSettled(urls.map((u) => cache.delete(u)));
      } catch {
        // Игнорируем, если кеш недоступен
      }
    }
  }, []);

  const clearAll = useCallback(async () => {
    setZones([]);
    localStorage.removeItem(STORAGE_KEY);
    if ("caches" in window) {
      try {
        await caches.delete(TILE_CACHE);
      } catch {
        // Игнорируем
      }
    }
  }, []);

  return { zones, addZone, removeZone, clearAll };
}
