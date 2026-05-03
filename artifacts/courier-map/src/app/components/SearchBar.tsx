import { useState, useEffect, useRef, useCallback } from "react";

interface SearchResult {
  label: string;
  lng: number;
  lat: number;
  match: "structured" | "free";
}

interface Props {
  onSelect: (lng: number, lat: number, label: string) => void;
}

function formatLabel(label: string): { primary: string; secondary: string } {
  const parts = label.split(", ");
  const primary = parts.slice(0, 2).join(", ");
  const secondary = parts.slice(2, 4).filter(Boolean).join(", ");
  return { primary, secondary };
}

export function SearchBar({ onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 60);
    } else {
      setQuery("");
      setResults([]);
      setError(false);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    }
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); setLoading(false); return; }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/geo/geocode?q=${encodeURIComponent(q)}&limit=8`, { signal: ctrl.signal });
      const data = await res.json() as { results?: SearchResult[] };
      setResults(data.results ?? []);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (v: string) => {
    setQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!v.trim()) { setResults([]); setLoading(false); return; }
    setLoading(true);
    debounceRef.current = setTimeout(() => doSearch(v), 420);
  };

  const handleSelect = (r: SearchResult) => {
    const { primary } = formatLabel(r.label);
    onSelect(r.lng, r.lat, primary);
    setOpen(false);
  };

  return (
    <>
      <button
        className="search-trigger"
        onClick={() => setOpen(true)}
        title="Поиск адреса"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </button>

      {open && (
        <div className="search-overlay">
          <div className="search-panel">
            <div className="search-input-row">
              <button className="search-back" onClick={() => setOpen(false)} title="Закрыть">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <input
                ref={inputRef}
                className="search-input"
                value={query}
                onChange={(e) => handleChange(e.target.value)}
                placeholder="Улица, дом…"
                autoComplete="off"
                spellCheck={false}
              />
              {loading && <span className="search-spinner" />}
              {!loading && query && (
                <button className="search-clear" onClick={() => handleChange("")}>×</button>
              )}
            </div>

            {results.length > 0 && (
              <ul className="search-results-list">
                {results.map((r, i) => {
                  const { primary, secondary } = formatLabel(r.label);
                  return (
                    <li
                      key={i}
                      className={`search-result-item${r.match === "structured" ? " exact" : ""}`}
                      onClick={() => handleSelect(r)}
                    >
                      <span className="search-result-icon">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                      </span>
                      <span className="search-result-text">
                        <span className="search-result-primary">{primary}</span>
                        {secondary && <span className="search-result-secondary">{secondary}</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}

            {!loading && query.trim() && results.length === 0 && !error && (
              <div className="search-empty">Ничего не найдено</div>
            )}
            {error && (
              <div className="search-empty">Ошибка поиска. Проверьте соединение.</div>
            )}
          </div>
          <div className="search-backdrop" onClick={() => setOpen(false)} />
        </div>
      )}
    </>
  );
}
