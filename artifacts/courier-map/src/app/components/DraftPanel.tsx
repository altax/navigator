import type { PoiType } from "../types";
import { POI_TYPE_META } from "../types";

const POI_TYPES = Object.keys(POI_TYPE_META) as PoiType[];

interface Props {
  draftPoint: { lng: number; lat: number } | null;
  draftType: PoiType;
  setDraftType: (t: PoiType) => void;
  draftTitle: string;
  setDraftTitle: (v: string) => void;
  draftDesc: string;
  setDraftDesc: (v: string) => void;
  draftAddr: string;
  setDraftAddr: (v: string) => void;
  saving: boolean;
  saveError: string | null;
  saveDraft: () => void;
  cancelDraft: () => void;
}

export function DraftPanel({
  draftPoint,
  draftType, setDraftType,
  draftTitle, setDraftTitle,
  draftDesc, setDraftDesc,
  draftAddr, setDraftAddr,
  saving, saveError,
  saveDraft, cancelDraft,
}: Props) {
  if (!draftPoint) return null;
  return (
    <div className="draft-panel">
      <div className="draft-header">
        <span>Новая точка</span>
        <span className="draft-coord">{draftPoint.lat.toFixed(5)}, {draftPoint.lng.toFixed(5)}</span>
      </div>
      <div className="draft-grid">
        <select value={draftType} onChange={(e) => setDraftType(e.target.value as PoiType)}>
          {POI_TYPES.map((t) => (
            <option key={t} value={t}>{POI_TYPE_META[t].icon} {POI_TYPE_META[t].label}</option>
          ))}
        </select>
        <input
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          placeholder="Название (Подъезд 3, код 1234)"
          autoFocus
        />
      </div>
      <input value={draftAddr} onChange={(e) => setDraftAddr(e.target.value)} placeholder="Адрес (опционально)" />
      <textarea value={draftDesc} onChange={(e) => setDraftDesc(e.target.value)} placeholder="Заметки для курьера…" rows={2} />
      {saveError && <div className="route-error" style={{ marginTop: 6 }}>{saveError}</div>}
      <div className="draft-actions">
        <button className="secondary" onClick={cancelDraft} disabled={saving}>Отмена</button>
        <button onClick={saveDraft} disabled={saving || !draftTitle.trim()}>
          {saving ? "Сохраняю…" : "Сохранить"}
        </button>
      </div>
    </div>
  );
}
