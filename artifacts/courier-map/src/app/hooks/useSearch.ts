import { useState, useRef, useEffect, useCallback } from "react";
import type { GeocodeResult } from "../types";
import { api } from "../api";

export function useSearch() {
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<GeocodeResult[]>([]);
  const [parsedQuery, setParsedQuery] = useState<{ display: string; full: string } | null>(null);
  const [searchSource, setSearchSource] = useState<string>("");
  const [searchFocused, setSearchFocused] = useState(false);
  const suppressSearchRef = useRef(false);

  const suppressNextSearch = useCallback(() => {
    suppressSearchRef.current = true;
  }, []);

  useEffect(() => {
    if (search.trim().length < 3) {
      setSearchResults([]);
      setParsedQuery(null);
      return;
    }
    if (suppressSearchRef.current) {
      suppressSearchRef.current = false;
      return;
    }
    const t = window.setTimeout(async () => {
      try {
        const res = await api.searchAddress(search.trim());
        setSearchResults(res.results.slice(0, 8));
        setSearchSource(res.source);
        setParsedQuery(res.parsed);
      } catch (e) {
        console.error(e);
      }
    }, 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const shortLabel = useCallback((label: string): { primary: string; secondary: string } => {
    const parts = label.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length <= 3) return { primary: parts.join(", "), secondary: "" };
    return {
      primary: parts.slice(0, 3).join(", "),
      secondary: parts.slice(3, -1).filter((p) => !/^\d{6}$/.test(p) && p !== "Россия").slice(0, 2).join(", "),
    };
  }, []);

  return {
    search, setSearch,
    searchResults, setSearchResults,
    parsedQuery,
    searchSource,
    searchFocused, setSearchFocused,
    suppressNextSearch,
    shortLabel,
  };
}
