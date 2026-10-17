import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useEditorStore } from "@/store/editorStore";
import { useMockupPreview, type MockupPreviewContent } from "@/lib/editor/useMockupPreview";
import type { MediaClip } from "@/lib/editor/types";
import type { MockupTemplateId } from "@/lib/editor/mockupTemplates";
export function MockupPreview({ source, preset, value, active }: { source: MediaClip | null; preset: MockupTemplateId; value: MockupPreviewContent | null; active: boolean }) {
  const { t } = useTranslation(), [open, setOpen] = useState(false), projectId = useEditorStore(store => store.projectId), settings = useEditorStore(store => store.settings);
  const readMedia = useCallback(async (id: string) => useEditorStore.getState().media.find(media => media.id === id), []);
  const result = useMockupPreview(projectId, settings, source, preset, value, readMedia, open && active);
  return <div className="rounded-lg border border-white/10 p-2"><button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="min-h-9 w-full text-left text-xs font-medium text-white/75">{t("editor.mockups.preview", { defaultValue: "Preview mockup" })} {open ? "−" : "+"}</button>{open && <div aria-busy={result.busy} className="space-y-2">{result.image && <img src={result.image} alt={t("editor.mockups.previewAlt", { defaultValue: "Draft mockup layout" })} className="h-48 w-full rounded-md object-contain" style={{ opacity: result.busy ? 0.5 : 1 }} />}<p role="status" className="text-[10px] text-white/45">{!value ? t("editor.mockups.previewNeedsData", { defaultValue: "Complete the frame colours to preview." }) : result.unavailable ? t("editor.mockups.previewUnavailable", { defaultValue: "The preview is unavailable. The frame settings remain editable." }) : result.busy ? t("editor.mockups.previewUpdating", { defaultValue: "Updating mockup preview…" }) : t("editor.mockups.previewHint", { defaultValue: "Preview shows the mockup without other artwork. Inserting it adds editable layers to the current page." })}</p></div>}</div>;
}
