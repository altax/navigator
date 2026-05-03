import { useCallback, useRef, useState } from "react";
import type { Map as MlMap } from "maplibre-gl";

export type DownloadPhase = "idle" | "downloading" | "done" | "cancelled";

export interface DownloadStatus {
  phase: DownloadPhase;
  done: number;
  total: number;
}

// Вычисляем все URL тайлов для прямоугольника (west/south/east/north) на диапазоне зумов
function tileUrls(
  west: number,
  south: number,
  east: number,
  north: number,
  zMin: number,
  zMax: number,
): string[] {
  const urls: string[] = [];
  for (let z = zMin; z <= zMax; z++) {
    const n = 1 << z;
    const x1 = Math.max(0, Math.floor(((west + 180) / 360) * n));
    const x2 = Math.min(n - 1, Math.floor(((east + 180) / 360) * n));
    const toY = (lat: number) => {
      const lr = (lat * Math.PI) / 180;
      return Math.floor(
        ((1 - Math.log(Math.tan(lr) + 1 / Math.cos(lr)) / Math.PI) / 2) * n,
      );
    };
    const y1 = Math.max(0, toY(north));
    const y2 = Math.min(n - 1, toY(south));
    for (let x = x1; x <= x2; x++) {
      for (let y = y1; y <= y2; y++) {
        urls.push(`/api/tiles/spb-lo/${z}/${x}/${y}`);
      }
    }
  }
  return urls;
}

// Параллельные запросы батчами по BATCH штук
const BATCH = 20;

export function useAreaDownload(mapRef: React.RefObject<MlMap | null>) {
  const [status, setStatus] = useState<DownloadStatus>({
    phase: "idle",
    done: 0,
    total: 0,
  });
  const cancelRef = useRef(false);

  const download = useCallback(async () => {
    const map = mapRef.current;
    if (!map) return;

    cancelRef.current = false;

    const b = map.getBounds();
    const currentZoom = map.getZoom();

    // Расширяем зону на 30% по каждой стороне — курьер дойдёт туда через минуту
    const dLng = (b.getEast() - b.getWest()) * 0.3;
    const dLat = (b.getNorth() - b.getSouth()) * 0.3;
    const west = b.getWest() - dLng;
    const east = b.getEast() + dLng;
    const south = b.getSouth() - dLat;
    const north = b.getNorth() + dLat;

    // Зум: обзор (10) до навигационного уровня (15 или +1 от текущего, макс 17)
    const zMax = Math.min(17, Math.max(15, Math.floor(currentZoom) + 1));
    const urls = tileUrls(west, south, east, north, 10, zMax);

    setStatus({ phase: "downloading", done: 0, total: urls.length });

    let done = 0;
    for (let i = 0; i < urls.length; i += BATCH) {
      if (cancelRef.current) {
        setStatus((s) => ({ ...s, phase: "cancelled" }));
        // Сбрасываем через 2 сек
        setTimeout(() => setStatus({ phase: "idle", done: 0, total: 0 }), 2000);
        return;
      }
      await Promise.allSettled(
        urls
          .slice(i, i + BATCH)
          .map((url) => fetch(url).catch(() => {})),
      );
      done = Math.min(i + BATCH, urls.length);
      setStatus({ phase: "downloading", done, total: urls.length });
    }

    setStatus({ phase: "done", done: urls.length, total: urls.length });
    // Авто-сброс через 4 сек
    setTimeout(() => setStatus({ phase: "idle", done: 0, total: 0 }), 4000);
  }, [mapRef]);

  const cancel = useCallback(() => {
    cancelRef.current = true;
  }, []);

  return { download, cancel, status };
}
