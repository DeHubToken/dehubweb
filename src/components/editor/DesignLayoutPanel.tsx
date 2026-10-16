import { PageLayerTransferControls } from "./PageLayerTransferControls";
import { SelectionTransformControls } from "./SelectionTransformControls";
import { SimilarSelectionControls } from "./SimilarSelectionControls";
import { useState } from "react";
import type { Clip } from "@/lib/editor/types";
import { useTranslation } from "react-i18next";
import { useEditorStore } from "@/store/editorStore";
import { recordOpts } from "@/store/editorUiStore";
import { clipBoxForSize, getTransform, placementPatchAt } from "@/lib/editor/render";
import { resolveClipAt } from "@/lib/editor/keyframes";
import { groupedSelection } from "@/lib/editor/designGroups";
import { layoutDesign, LAYOUT_ACTIONS, type LayoutAction } from "@/lib/editor/designLayout";

export function DesignLayoutPanel() {
  const { t } = useTranslation();
  const ids = useEditorStore(s => s.selectedClipIds);
  const [reference, setReference] = useState<"page" | "selection">("selection");
  const [columns, setColumns] = useState(0), [gap, setGap] = useState(24);
  const apply = (action: LayoutAction) => {
    const s = useEditorStore.getState(), expected = s.toSnapshot(), time = s.currentTime;
    const chosen = new Set(groupedSelection(s.clips, ids, time));
    const selected = s.clips.filter(c => chosen.has(c.id) && c.kind !== "audio" && !c.isPageBackground && !c.hidden && time >= c.start && time < c.start + c.duration && !s.tracks.find(track => track.id === c.trackId)?.hidden);
    if (selected.some(c => c.locked)) return;
    const context = document.createElement("canvas").getContext("2d");
    if (!context) return;
    const boxes = selected.flatMap(clip => {
      const media = "mediaId" in clip ? s.media.find(m => m.id === clip.mediaId) : undefined;
      const box = clipBoxForSize(context, resolveClipAt(clip, time), s.settings.width, s.settings.height,
        media?.width && media.height ? { w: media.width, h: media.height } : null);
      return box ? [{ ...box, id: clip.id, groupId: clip.groupId }] : [];
    });
    const moves = new Map(layoutDesign(boxes, action, s.settings, reference, columns, gap).map(move => [move.id, move]));
    if (!moves.size) return;
    s.applyDesignEdit(expected, { ...expected, clips: expected.clips.map(clip => {
      const move = moves.get(clip.id); if (!move) return clip;
      const transform = getTransform(resolveClipAt(clip, time));
      return { ...clip, ...placementPatchAt(clip, { x: transform.x + move.dx / s.settings.width, y: transform.y + move.dy / s.settings.height }, time, recordOpts()) } as Clip;
    }) });
  };
  return <div className="space-y-3">
    <SimilarSelectionControls />
    <PageLayerTransferControls />
    <SelectionTransformControls />
    <div className="flex flex-wrap gap-2">{(["selection", "page"] as const).map(value => <button type="button" key={value} aria-pressed={reference === value} onClick={() => setReference(value)} className={`min-h-9 rounded-lg border px-3 text-xs ${reference === value ? "border-white bg-white/15" : "border-white/20"}`}>{t(`editor.layout.reference.${value}`, { defaultValue: value === "page" ? "Align to page" : "Align to selection" })}</button>)}</div>
    <div className="grid grid-cols-3 gap-2">{LAYOUT_ACTIONS.map(({ action, label }) => <button type="button" key={action} disabled={!ids.length} onClick={() => apply(action)} className="min-h-9 rounded-lg border border-white/20 px-2 text-xs hover:bg-white/10 disabled:opacity-35">{t(`editor.layout.${action}`, { defaultValue: label })}</button>)}</div>
    <div className="flex flex-wrap items-center gap-3 text-xs text-white/65">
      <label>{t("editor.layout.columns", { defaultValue: "Grid columns (0 = auto)" })}<input type="number" min={0} max={30} value={columns} onChange={e => setColumns(Math.max(0, Math.min(30, Number(e.target.value) || 0)))} className="ml-2 min-h-9 w-16 rounded-lg border border-white/20 bg-white/5 px-2" /></label>
      <label>{t("editor.layout.gap", { defaultValue: "Grid gap in pixels" })}<input type="number" min={0} max={1000} value={gap} onChange={e => setGap(Math.max(0, Math.min(1000, Number(e.target.value) || 0)))} className="ml-2 min-h-9 w-20 rounded-lg border border-white/20 bg-white/5 px-2" /></label>
    </div>
  </div>;
}
