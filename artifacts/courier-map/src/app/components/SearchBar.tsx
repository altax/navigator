import type { GeocodeResult } from "../types";

interface Props {
  search: string;
  setSearch: (v: string) => void;
  searchResults: GeocodeResult[];
  setSearchResults: (v: GeocodeResult[]) => void;
  parsedQuery: { display: string; full: string } | null;
  searchSource: string;
  searchFocused: boolean;
  setSearchFocused: (v: boolean) => void;
  suppressNextSearch: () => void;
  shortLabel: (label: string) => { primary: string; secondary: string };
  onSelectResult: (lng: number, lat: number, primary: string) => void;
  onRouteToResult: (lng: number, lat: number, primary: string) => void;
}

export function SearchBar({
  search, setSearch,
  searchResults, setSearchResults,
  parsedQuery, searchSource,
  searchFocused, setSearchFocused,
  suppressNextSearch, shortLabel,
  onSelectResult, onRouteToResult,
}: Props) {
  return (
    <div className={`search-floating${searchFocused ? " focused" : ""}`}>
      <div className="search-bar">
        <svg className="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
          placeholder="Адрес, метро, ТЦ…"
          inputMode="search"
          autoComplete="off"
        />
        {search && (
          <button className="search-clear" title="Очистить" onClick={() => { setSearch(""); setSearchResults([]); }}>
            ×
          </button>
        )}
      </div>
      {searchResults.length > 0 && (
        <div className="search-results">
          {parsedQuery && (
            <div className="parsed-hint" title={parsedQuery.full}>
              Понял как: <b>{parsedQuery.display}</b>
            </div>
          )}
          {searchResults.map((r, i) => {
            const { primary, secondary } = shortLabel(r.label);
            const isStruct = r.match === "structured";
            return (
              <div key={i} className={`item${isStruct ? " item-struct" : ""}`} title={r.label}>
                <div className="item-tap" onClick={() => {
                  suppressNextSearch();
                  setSearchResults([]);
                  setSearchFocused(false);
                  setSearch(primary);
                  onSelectResult(r.lng, r.lat, primary);
                }}>
                  <span className={`item-icon${isStruct ? " icon-house" : ""}`}>
                    {isStruct ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 11l9-8 9 8v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                        <polyline points="9 22 9 12 15 12 15 22" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                    )}
                  </span>
                  <div className="item-content">
                    <div className="item-primary">{primary}</div>
                    {secondary && <div className="item-secondary">{secondary}</div>}
                  </div>
                </div>
                <button className="item-route-btn" title="Маршрут от меня" onClick={(ev) => {
                  ev.stopPropagation();
                  suppressNextSearch();
                  setSearchResults([]);
                  setSearchFocused(false);
                  setSearch(primary);
                  onRouteToResult(r.lng, r.lat, primary);
                }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </button>
              </div>
            );
          })}
          <div className="search-source-line">источник: {searchSource}</div>
        </div>
      )}
    </div>
  );
}
