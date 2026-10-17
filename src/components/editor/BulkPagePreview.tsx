import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useEditorStore } from "@/store/editorStore";
import { useBulkPagePreview, type BulkPagePreviewOptions } from "@/lib/editor/useBulkPagePreview";

export function BulkPagePreview({ options }: { options: BulkPagePreviewOptions }) {
  const { t } = useTranslation(), [open, setOpen] = useState(false);
  const clips = useEditorStore(store => store.clips), tracks = useEditorStore(store => store.tracks), settings = useEditorStore(store => store.settings), title = useEditorStore(store => store.title), id = useEditorStore(store => store.projectId);
  const project = useMemo(() => useEditorStore.getState().toSnapshot(), [id, title, clips, tracks, settings]);
  const readMedia = useCallback(async (mediaId: string) => useEditorStore.getState().media.find(media => media.id === mediaId), []);
  const result = useBulkPagePreview(project, options, readMedia, open);
  return <div className="rounded-lg border border-white/15 p-3"><button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="min-h-9 w-full text-left text-xs font-medium text-white/80">{t("editor.bulk.pagePreview", { defaultValue: "Preview populated page" })} {open ? "−" : "+"}</button>{open && <div aria-busy={result.busy} className="space-y-2">{result.image && <img src={result.image} alt={t("editor.bulk.pagePreviewAlt", { defaultValue: "Template page populated with data record {{record}}", record: options.row + 1 })} className="max-h-72 w-full rounded-md object-contain" style={{ opacity: result.busy ? 0.5 : 1 }} />}<p role="status" className="text-[10px] text-white/45">{result.busy ? t("editor.bulk.pagePreviewBusy", { defaultValue: "Updating populated page preview…" }) : t("editor.bulk.pagePreviewHint", { defaultValue: "Shows this record with the current text, QR and named-photo connections. The preview does not add pages to your design." })}</p>{result.error && <p role="alert" className="text-xs text-amber-200">{result.error}</p>}</div>}</div>;
}
