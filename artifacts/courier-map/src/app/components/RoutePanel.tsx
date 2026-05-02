import type { RouteData } from "../hooks/useRoute";

interface Props {
  routing: boolean;
  route: RouteData | null;
  routeError: string | null;
  stepsOpen: boolean;
  setStepsOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  clearRoute: () => void;
}

export function RoutePanel({ routing, route, routeError, stepsOpen, setStepsOpen, clearRoute }: Props) {
  if (!routing && !route && !routeError) return null;
  return (
    <div className="route-panel">
      {routing && <div className="route-loading">Строю маршрут…</div>}
      {routeError && (
        <div className="route-error">
          {routeError}
          <button className="ghost" onClick={clearRoute}>×</button>
        </div>
      )}
      {route && !routing && (
        <>
          <div className="route-row">
            <div>
              <div className="route-to" title={route.toLabel}>→ {route.toLabel}</div>
              <div className="route-meta">
                <b>{(route.distanceM / 1000).toFixed(2)} км</b>
                <span>·</span>
                <b>{Math.round(route.durationS / 60)} мин</b>
                {route.steps && route.steps.length > 0 && (
                  <button className="steps-toggle" onClick={() => setStepsOpen(v => !v)}>
                    {stepsOpen ? "▲ скрыть" : `▼ ${route.steps!.length} шагов`}
                  </button>
                )}
                <span className="route-source">({route.source})</span>
              </div>
            </div>
            <button className="ghost" title="Очистить маршрут" onClick={clearRoute}>×</button>
          </div>
          {stepsOpen && route.steps && route.steps.length > 0 && (
            <div className="route-steps">
              {route.steps.map((s, i) => (
                <div key={i} className="route-step">
                  <span className="step-num">{i + 1}</span>
                  <span className="step-text">{s.text}</span>
                  <span className="step-dist">
                    {s.distanceM >= 1000 ? `${(s.distanceM / 1000).toFixed(1)} км` : `${Math.round(s.distanceM)} м`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
