import { useState, useCallback, useEffect, useMemo } from "react";
import type { Poi, PoiType } from "../types";
import { POI_TYPE_META } from "../types";
import { api } from "../api";

const POI_TYPES = Object.keys(POI_TYPE_META) as PoiType[];

export function usePois() {
  const [pois, setPois] = useState<Poi[]>([]);
  const [filterTypes, setFilterTypes] = useState<Set<PoiType>>(new Set(POI_TYPES));

  const reloadPois = useCallback(async () => {
    try {
      const list = await api.listPois();
      setPois(list);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    reloadPois();
  }, [reloadPois]);

  const sortedPois = useMemo(() => [...pois].sort((a, b) => b.id - a.id), [pois]);

  return { pois, sortedPois, filterTypes, setFilterTypes, reloadPois };
}
