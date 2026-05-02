import { useState, useCallback } from "react";
import type { PoiType } from "../types";
import { api } from "../api";

export function useDraft(reloadPois: () => void) {
  const [draftPoint, setDraftPoint] = useState<{ lng: number; lat: number } | null>(null);
  const [draftType, setDraftType] = useState<PoiType>("entrance");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDesc, setDraftDesc] = useState("");
  const [draftAddr, setDraftAddr] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [addMode, setAddMode] = useState(false);

  const saveDraft = useCallback(async () => {
    if (!draftPoint || !draftTitle.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      await api.createPoi({
        type: draftType,
        title: draftTitle.trim(),
        description: draftDesc.trim() || null,
        address: draftAddr.trim() || null,
        lng: draftPoint.lng,
        lat: draftPoint.lat,
      });
      setDraftPoint(null);
      setDraftTitle("");
      setDraftDesc("");
      setDraftAddr("");
      setSaveError(null);
      reloadPois();
    } catch (e) {
      setSaveError((e as Error).message ?? "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }, [draftPoint, draftType, draftTitle, draftDesc, draftAddr, reloadPois]);

  const cancelDraft = useCallback(() => {
    setDraftPoint(null);
    setSaveError(null);
  }, []);

  return {
    draftPoint, setDraftPoint,
    draftType, setDraftType,
    draftTitle, setDraftTitle,
    draftDesc, setDraftDesc,
    draftAddr, setDraftAddr,
    saving, saveError,
    saveDraft, cancelDraft,
    addMode, setAddMode,
  };
}
