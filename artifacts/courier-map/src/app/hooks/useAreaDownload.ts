import { useCallback, useRef, useState } from "react";
import type { Map as MlMap } from "maplibre-gl";
import { tileUrls } from "../utils/tileUtils";
import type { DownloadedZone } from "./useDownloadedZones";

export type DownloadPhase = "idle" | "downloading" | "done" | "cancelled";

export interface DownloadStatus {
  phase: DownloadPhase;
  done: number;
  total: number;
}

const BATCH = 20;

export function useAreaDownload(
  mapRef: React.RefObject<MlMap | null>,
  onSave: (zone: DownloadedZone) => void,
) {
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
    const bounds = {
      west:  b.getWest()  - dLng,
      east:  b.getEast()  + dLng,
      south: b.getSouth() - dLat,
      north: b.getNorth() + dLat,
    };

    const zMin = 10;
    const zMax = Math.min(17, Math.max(15, Math.floor(currentZoom) + 1));
    const urls = tileUrls(bounds, zMin, zMax);

    setStatus({ phase: "downloading", done: 0, total: urls.length });

    let done = 0;
    for (let i = 0; i < urls.length; i += BATCH) {
      if (cancelRef.current) {
        setStatus((s) => ({ ...s, phase: "cancelled" }));
        setTimeout(() => setStatus({ phase: "idle", done: 0, total: 0 }), 2000);
        return;
      }
      await Promise.allSettled(
        urls.slice(i, i + BATCH).map((url) => fetch(url).catch(() => {})),
      );
      done = Math.min(i + BATCH, urls.length);
      setStatus({ phase: "downloading", done, total: urls.length });
    }

    const total = urls.length;
    setStatus({ phase: "done", done: total, total });

    onSave({
      id: String(Date.now()),
      downloadedAt: Date.now(),
      tileCount: total,
      bounds,
      zMin,
      zMax,
    });

    setTimeout(() => setStatus({ phase: "idle", done: 0, total: 0 }), 4000);
  }, [mapRef, onSave]);

  const cancel = useCallback(() => {
    cancelRef.current = true;
  }, []);

  return { download, cancel, status };
}
