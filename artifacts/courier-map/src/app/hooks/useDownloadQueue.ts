import { useCallback, useRef, useState } from "react";
import type { Map as MlMap } from "maplibre-gl";
import { tileUrls } from "../utils/tileUtils";
import type { TileBounds } from "../utils/tileUtils";
import type { DownloadedZone } from "./useDownloadedZones";
import { CITY_BASE_BBOX } from "../data/districts";

export type DownloadPhase = "idle" | "downloading" | "done" | "cancelled";

export interface DownloadRequest {
  bounds: TileBounds;
  zMin: number;
  zMax: number;
  name?: string;
  districtId?: string;
}

export interface DownloadStatus {
  phase: DownloadPhase;
  done: number;
  total: number;
  name?: string;
  currentDistrictId?: string;
  queued: number;
}

const BATCH = 20;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ── Базовый слой всего города: z10-z13 ──────────────────────────────────────
// Скачивается один раз в 7 дней автоматически перед первым районом в сессии.
// Гарантирует, что при наклоне (3D pitch) обзорные тайлы всегда из кеша.
const CITY_BASE_ID   = "__city_base__";
const CITY_BASE_LS   = "courier_city_base_ts";
const CITY_BASE_TTL  = 7 * 24 * 3600 * 1000;

const CITY_BASE_REQ: DownloadRequest = {
  bounds: CITY_BASE_BBOX,
  zMin: 10,
  zMax: 13,
  name: "Базовый слой города (z10–z13)",
  districtId: CITY_BASE_ID,
};

function isCityBaseStale(): boolean {
  try {
    const ts = localStorage.getItem(CITY_BASE_LS);
    if (!ts) return true;
    return Date.now() - Number(ts) > CITY_BASE_TTL;
  } catch {
    return true;
  }
}

export function useDownloadQueue(
  mapRef: React.RefObject<MlMap | null>,
  onSave: (zone: DownloadedZone) => void,
) {
  const [status, setStatus] = useState<DownloadStatus>({
    phase: "idle", done: 0, total: 0, queued: 0,
  });
  const [pendingQueue, setPendingQueue] = useState<DownloadRequest[]>([]);

  const queueRef   = useRef<DownloadRequest[]>([]);
  const runningRef = useRef(false);
  const cancelRef  = useRef(false);

  const syncUI = () => setPendingQueue([...queueRef.current]);

  const runQueue = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    cancelRef.current  = false;

    while (queueRef.current.length > 0) {
      if (cancelRef.current) break;

      const item = queueRef.current.shift()!;
      syncUI();

      const urls  = tileUrls(item.bounds, item.zMin, item.zMax);
      const total = urls.length;

      setStatus({
        phase: "downloading", done: 0, total,
        name: item.name, currentDistrictId: item.districtId,
        queued: queueRef.current.length,
      });

      let done = 0;
      for (let i = 0; i < urls.length; i += BATCH) {
        if (cancelRef.current) break;
        await Promise.allSettled(
          urls.slice(i, i + BATCH).map((u) => fetch(u).catch(() => {})),
        );
        done = Math.min(i + BATCH, total);
        setStatus({
          phase: "downloading", done, total,
          name: item.name, currentDistrictId: item.districtId,
          queued: queueRef.current.length,
        });
      }

      if (!cancelRef.current) {
        if (item.districtId === CITY_BASE_ID) {
          // Базовый слой — не сохраняем как зону, только ставим метку в localStorage
          try { localStorage.setItem(CITY_BASE_LS, String(Date.now())); } catch {}
        } else {
          onSave({
            id: String(Date.now()),
            name: item.name,
            districtId: item.districtId,
            downloadedAt: Date.now(),
            tileCount: total,
            bounds: item.bounds,
            zMin: item.zMin,
            zMax: item.zMax,
          });
        }

        if (queueRef.current.length > 0) {
          await sleep(400);
        } else {
          setStatus({ phase: "done", done: total, total, name: item.name, currentDistrictId: item.districtId, queued: 0 });
          await sleep(3500);
        }
      }
    }

    runningRef.current = false;

    if (cancelRef.current) {
      setStatus((s) => ({ ...s, phase: "cancelled", queued: 0 }));
      setTimeout(() => setStatus({ phase: "idle", done: 0, total: 0, queued: 0 }), 2000);
    } else {
      setStatus({ phase: "idle", done: 0, total: 0, queued: 0 });
    }
  }, [onSave]);

  const enqueue = useCallback(
    (req?: DownloadRequest) => {
      let request: DownloadRequest;

      if (req) {
        if (
          req.districtId &&
          queueRef.current.some((r) => r.districtId === req.districtId)
        ) return;
        request = req;
      } else {
        const map = mapRef.current;
        if (!map) return;
        const b   = map.getBounds();
        const z   = map.getZoom();
        const dLng = (b.getEast() - b.getWest()) * 0.3;
        const dLat = (b.getNorth() - b.getSouth()) * 0.3;
        request = {
          bounds: {
            west:  b.getWest()  - dLng,
            east:  b.getEast()  + dLng,
            south: b.getSouth() - dLat,
            north: b.getNorth() + dLat,
          },
          zMin: 10,
          zMax: Math.min(17, Math.max(15, Math.floor(z) + 1)),
          name: "Текущий вид",
        };
      }

      // Автоматически вставляем базовый слой первым, если он устарел и очередь
      // сейчас пуста (то есть начинается новая "сессия" скачивания).
      // Исключение: radius_zone уже включает z10–z16 для рабочей зоны,
      // качать весь город ради 6 км не нужно.
      const needBase =
        isCityBaseStale() &&
        !runningRef.current &&
        queueRef.current.length === 0 &&
        !queueRef.current.some((r) => r.districtId === CITY_BASE_ID) &&
        request.districtId !== "radius_zone";

      if (needBase) {
        queueRef.current = [CITY_BASE_REQ, request];
      } else {
        queueRef.current = [...queueRef.current, request];
      }

      syncUI();
      runQueue();
    },
    [mapRef, runQueue],
  );

  const dequeue = useCallback((districtId: string) => {
    queueRef.current = queueRef.current.filter((r) => r.districtId !== districtId);
    syncUI();
  }, []);

  const cancelAll = useCallback(() => {
    cancelRef.current    = true;
    queueRef.current     = [];
    syncUI();
  }, []);

  return { enqueue, dequeue, cancelAll, status, pendingQueue };
}
