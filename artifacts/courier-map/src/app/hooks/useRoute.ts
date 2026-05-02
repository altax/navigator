import { useState, useCallback } from "react";
import type { Map as MlMap } from "maplibre-gl";
import type { Location } from "./useTracking";
import { api } from "../api";

export type RouteData = {
  coordinates: [number, number][];
  distanceM: number;
  durationS: number;
  source: string;
  toLabel: string;
  steps?: Array<{ text: string; distanceM: number; durationS: number }>;
};

export function useRoute(
  mapRef: { current: MlMap | null },
  myLocation: Location | null,
  getMyPosition: () => Promise<Location>,
) {
  const [route, setRoute] = useState<RouteData | null>(null);
  const [routing, setRouting] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [stepsOpen, setStepsOpen] = useState(false);

  const routeFromMe = useCallback(async (to: { lng: number; lat: number }, label: string) => {
    setRouteError(null);
    setRouting(true);
    try {
      const me = myLocation ?? (await getMyPosition());
      const r = await api.route({ lat: me.lat, lng: me.lng }, to, "ebike");
      setRoute({
        coordinates: r.coordinates as [number, number][],
        distanceM: r.distanceM,
        durationS: r.durationS,
        source: r.source,
        toLabel: label,
        steps: r.steps,
      });
      setStepsOpen(false);
      const map = mapRef.current;
      if (map && r.coordinates.length > 0) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const [x, y] of r.coordinates) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
        map.fitBounds([[minX, minY], [maxX, maxY]], { padding: 60, duration: 700, maxZoom: 17 });
      }
    } catch (e) {
      setRouteError((e as Error).message);
    } finally {
      setRouting(false);
    }
  }, [myLocation, getMyPosition, mapRef]);

  const clearRoute = useCallback(() => {
    setRoute(null);
    setRouteError(null);
    setStepsOpen(false);
  }, []);

  return { route, routing, routeError, setRouteError, stepsOpen, setStepsOpen, routeFromMe, clearRoute };
}
