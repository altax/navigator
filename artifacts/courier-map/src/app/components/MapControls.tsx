interface Props {
  addMode: boolean;
  setAddMode: (v: boolean) => void;
  setMeMode: boolean;
  setSetMeMode: (v: boolean) => void;
  tracking: boolean;
  onGeolocate: () => void;
  onResetView: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onOpenDrawer: () => void;
}

export function MapControls({
  addMode, setAddMode,
  setMeMode, setSetMeMode,
  tracking,
  onGeolocate, onResetView, onZoomIn, onZoomOut, onOpenDrawer,
}: Props) {
  return (
    <div className="map-controls">
      <button className="map-btn" title="Меню" onClick={onOpenDrawer}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
      <button
        className={`map-btn${addMode ? " active" : ""}`}
        title={addMode ? "Отменить добавление" : "Добавить точку"}
        onClick={() => { if (setMeMode) setSetMeMode(false); setAddMode(!addMode); }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
      <button
        className={`map-btn${setMeMode ? " active" : ""}`}
        title={setMeMode ? "Отменить ручную установку позиции" : "Указать моё положение вручную (для коррекции GPS)"}
        onClick={() => { if (addMode) setAddMode(false); setSetMeMode(!setMeMode); }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 21s-6-5.5-6-11a6 6 0 1 1 12 0c0 5.5-6 11-6 11z" />
          <line x1="12" y1="7" x2="12" y2="13" /><line x1="9" y1="10" x2="15" y2="10" />
        </svg>
      </button>
      <button
        className={`map-btn${tracking ? " active" : ""}`}
        title={tracking ? "Выключить отслеживание" : "Следить за моим положением"}
        onClick={onGeolocate}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <line x1="12" y1="2" x2="12" y2="5" /><line x1="12" y1="19" x2="12" y2="22" />
          <line x1="2" y1="12" x2="5" y2="12" /><line x1="19" y1="12" x2="22" y2="12" />
        </svg>
      </button>
      <button className="map-btn" title="Сбросить наклон и поворот" onClick={onResetView}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 15 8 12 6 9 8 12 2" /><polygon points="12 22 15 16 12 18 9 16 12 22" />
          <line x1="12" y1="6" x2="12" y2="18" />
        </svg>
      </button>
      <div className="map-btn-divider" />
      <button className="map-btn" title="Приблизить" onClick={onZoomIn}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
      <button className="map-btn" title="Отдалить" onClick={onZoomOut}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
    </div>
  );
}
