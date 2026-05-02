import { useState, useCallback, useRef, useEffect } from "react";

export type Location = { lng: number; lat: number; accuracy: number; heading: number | null };

const GEO_MSGS: Record<number, string> = {
  1: "Доступ к геолокации запрещён в браузере",
  2: "Не удалось определить позицию",
  3: "Геолокация: таймаут",
};

function parsePosition(pos: GeolocationPosition): Location {
  return {
    lng: pos.coords.longitude,
    lat: pos.coords.latitude,
    accuracy: pos.coords.accuracy ?? 30,
    heading: typeof pos.coords.heading === "number" && !Number.isNaN(pos.coords.heading)
      ? pos.coords.heading : null,
  };
}

export function useTracking() {
  const [myLocation, setMyLocation] = useState<Location | null>(null);
  const [tracking, setTracking] = useState(false);
  const watchIdRef = useRef<number | null>(null);

  const stopTracking = useCallback(() => {
    if (watchIdRef.current != null && "geolocation" in navigator) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    watchIdRef.current = null;
    setTracking(false);
  }, []);

  const getMyPosition = useCallback((): Promise<Location> => {
    return new Promise((resolve, reject) => {
      if (!("geolocation" in navigator)) {
        reject(new Error("Геолокация недоступна в этом браузере"));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = parsePosition(pos);
          setMyLocation(loc);
          resolve(loc);
        },
        (err) => reject(new Error(GEO_MSGS[err.code] ?? err.message)),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
      );
    });
  }, []);

  const startTracking = useCallback(
    (onUpdate: (loc: Location) => void, onError: (msg: string) => void) => {
      if (!("geolocation" in navigator)) { onError("Геолокация недоступна в этом браузере"); return; }
      if (watchIdRef.current != null) return;
      setTracking(true);
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const loc = parsePosition(pos);
          setMyLocation(loc);
          onUpdate(loc);
        },
        (err) => {
          onError(GEO_MSGS[err.code] ?? err.message);
          stopTracking();
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 2000 },
      );
    },
    [stopTracking],
  );

  useEffect(() => {
    return () => {
      if (watchIdRef.current != null && "geolocation" in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, []);

  return { myLocation, setMyLocation, tracking, startTracking, stopTracking, getMyPosition };
}
