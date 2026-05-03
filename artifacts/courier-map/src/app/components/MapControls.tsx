import type { DownloadPhase } from "../hooks/useAreaDownload";

interface Props {
  addMode: boolean;
  setAddMode: (v: boolean) => void;
  setMeMode: boolean;
  setSetMeMode: (v: boolean) => void;
  tracking: boolean;
  downloadPhase: DownloadPhase;
  onGeolocate: () => void;
  onResetView: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onOpenDrawer: () => void;
  onDownload: () => void;
}

export function MapControls({
  addMode, setAddMode,
  setMeMode, setSetMeMode,
  tracking,
  downloadPhase,
  onGeolocate, onResetView, onZoomIn, onZoomOut, onOpenDrawer, onDownload,
}: Props) {
  const isDownloading = downloadPhase === "downloading";

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
      {/* Скачать зону для офлайн-работы */}
      <button
        className={`map-btn${isDownloading ? " active" : ""}`}
        title={isDownloading ? "Остановить скачивание" : "Скачать зону для работы офлайн"}
        onClick={onDownload}
      >
        {isDownloading ? (
          // Иконка остановки (квадрат)
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="6" y="6" width="12" height="12" rx="1" />
          </svg>
        ) : (
          // Иконка скачивания (облако со стрелкой вниз)
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="8 17 12 21 16 17" />
            <line x1="12" y1="12" x2="12" y2="21" />
            <path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29" />
          </svg>
        )}
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
