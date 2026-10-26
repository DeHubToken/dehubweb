import { MatchSelectionSizeControls } from "./MatchSelectionSizeControls";
import { planMatchSelectionSize, type MatchSizeAxis, type MatchSizeReference } from "@/lib/editor/matchSelectionSize";
import { SelectedShadowControls } from "./SelectedShadowControls";
import { SelectedMediaControls } from "./SelectedMediaControls";
import { SelectedVectorControls } from "./SelectedVectorControls";
import { SelectedTextControls } from "./SelectedTextControls";
import { SelectionOrientationControls } from "./SelectionOrientationControls";
import { PrecisionSelectionControls } from "./PrecisionSelectionControls";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useEditorStore } from "@/store/editorStore";
import { recordOpts } from "@/store/editorUiStore";
import { clipBoxForSize, placementPatchAt } from "@/lib/editor/render";
import { resolveClipAt } from "@/lib/editor/keyframes";
import { groupedSelection } from "@/lib/editor/designGroups";
import { measureSelectionBounds, planSelectionTransform, type SelectionTransform } from "@/lib/editor/selectionTransforms";
import type { Clip } from "@/lib/editor/types";
import { editorErrorText } from "@/lib/editor/editorErrorText";

function measuredSelectionBoxes() {
  const store = useEditorStore.getState(), before = store.toSnapshot(), context = document.createElement("canvas").getContext("2d"); if (!context) return [];
  const chosen = new Set(groupedSelection(before.clips, store.selectedClipIds, store.currentTime));
  return before.clips.filter(clip => chosen.has(clip.id)).flatMap(clip => { const source = "mediaId" in clip ? store.media.find(item => item.id === clip.mediaId) : undefined; const box = clipBoxForSize(context, resolveClipAt(clip, store.currentTime), before.settings.width, before.settings.height, source?.width && source.height ? { w: source.width, h: source.height } : null); return box ? [{ ...box, id: clip.id }] : []; });
}

export function SelectionTransformControls() {
  const { t } = useTranslation(), ids = useEditorStore(store => store.selectedClipIds);
  const settings = useEditorStore(store => store.settings), projectId = useEditorStore(store => store.projectId);
  const [error, setError] = useState(""), [percent, setPercent] = useState("100"), [angle, setAngle] = useState("0"), [opacity, setOpacity] = useState("100");
  const apply = (operation: SelectionTransform) => {
    try { const store = useEditorStore.getState(), before = store.toSnapshot(), boxes = measuredSelectionBoxes();
      const plans = new Map(planSelectionTransform(before, store.selectedClipIds, store.currentTime, boxes, operation).map(plan => [plan.id, plan]));
      if (plans.size) { store.setIsPlaying(false); store.applyDesignEdit(before, { ...before, clips: before.clips.map(clip => { const plan = plans.get(clip.id); return plan ? { ...clip, ...placementPatchAt(clip, plan.placement, store.currentTime, recordOpts()), ...plan.extra } as Clip : clip; }) }); }
      setError("");
    } catch (value) { setError(editorErrorText(value, t("copy.e381a112308b", { defaultValue: "Could not transform this selection" }))); }
  };
  const matchSizes = (axis: MatchSizeAxis, reference: MatchSizeReference) => {
    try { const store = useEditorStore.getState(), before = store.toSnapshot(), plans = new Map(planMatchSelectionSize(before, store.selectedClipIds, store.currentTime, measuredSelectionBoxes(), axis, reference).map(plan => [plan.id, plan]));
      if (plans.size) { store.setIsPlaying(false); store.applyDesignEdit(before, { ...before, clips: before.clips.map(clip => { const plan = plans.get(clip.id); return plan ? { ...clip, ...placementPatchAt(clip, plan.placement, store.currentTime, recordOpts()), ...plan.extra } as Clip : clip; }) }); }
      setError("");
    } catch (reason) { setError(editorErrorText(reason, t("copy.9700cef6be69", { defaultValue: "Could not match selected sizes" }))); }
  };
  const button = "min-h-9 rounded-lg border border-white/20 px-3 text-xs text-white/75 disabled:opacity-35";
  return <div className="space-y-2 border-t border-white/10 pt-3"><SelectedShadowControls /><SelectedMediaControls /><SelectedVectorControls /><SelectedTextControls /><MatchSelectionSizeControls disabled={ids.length < 2} onApply={matchSizes} /><SelectionOrientationControls disabled={!ids.length} onApply={apply} /><PrecisionSelectionControls key={`${projectId}:${ids.join(",")}`} settings={settings} disabled={!ids.length} onApply={apply} onMeasure={() => { const store = useEditorStore.getState(); return measureSelectionBounds(store.toSnapshot(), store.selectedClipIds, store.currentTime, measuredSelectionBoxes()); }} /><div className="flex flex-wrap gap-2"><button type="button" disabled={!ids.length} className={button} onClick={() => apply({ kind: "scale", factor: 0.9 })}>{t("editor.groups.smaller", { defaultValue: "Smaller" })}</button><button type="button" disabled={!ids.length} className={button} onClick={() => apply({ kind: "scale", factor: 1.1 })}>{t("editor.groups.larger", { defaultValue: "Larger" })}</button>{[-15, 15].map(degrees => <button type="button" key={degrees} disabled={!ids.length} className={button} onClick={() => apply({ kind: "rotate", degrees })}>{t("editor.groups.rotateBy", { defaultValue: "Rotate {{degrees}}°", degrees: degrees > 0 ? `+${degrees}` : degrees })}</button>)}{(["horizontal", "vertical"] as const).map(axis => <button type="button" key={axis} disabled={!ids.length} className={button} onClick={() => apply({ kind: "flip", axis })}>{t(`editor.groups.flip.${axis}`, { defaultValue: axis === "horizontal" ? "Flip horizontally" : "Flip vertically" })}</button>)}</div><div className="flex flex-wrap items-center gap-2"><input type="number" value={percent} min={1} max={1000} onChange={event => setPercent(event.target.value)} aria-label={t("editor.groups.scalePercent", { defaultValue: "Scale selection by percentage" })} className="min-h-9 w-20 rounded-lg border border-white/20 bg-neutral-900 px-2 text-xs text-white" /><span className="text-xs text-white/45">%</span><button type="button" className={button} disabled={!ids.length || !Number(percent)} onClick={() => apply({ kind: "scale", factor: Number(percent) / 100 })}>{t("editor.groups.applyScale", { defaultValue: "Scale selection" })}</button><input type="number" value={angle} min={-360} max={360} onChange={event => setAngle(event.target.value)} aria-label={t("editor.groups.rotationDegrees", { defaultValue: "Rotate selection by degrees" })} className="min-h-9 w-20 rounded-lg border border-white/20 bg-neutral-900 px-2 text-xs text-white" /><span className="text-xs text-white/45">°</span><button type="button" className={button} disabled={!ids.length || !Number(angle)} onClick={() => apply({ kind: "rotate", degrees: Number(angle) })}>{t("editor.groups.applyRotation", { defaultValue: "Rotate selection" })}</button></div><div className="flex flex-wrap items-center gap-2"><label className="flex items-center gap-2 text-xs text-white/65">{t("editor.groups.layerOpacity", { defaultValue: "Layer opacity" })}<input type="number" value={opacity} min={0} max={100} step={1} onChange={event => setOpacity(event.target.value)} className="min-h-9 w-20 rounded-lg border border-white/20 bg-neutral-900 px-2 text-xs text-white" /><span>%</span></label><button type="button" className={button} disabled={!ids.length || opacity.trim() === ""} onClick={() => apply({ kind: "opacity", value: Number(opacity) / 100 })}>{t("editor.groups.applyOpacity", { defaultValue: "Apply to selected layers" })}</button>{[25, 50, 75, 100].map(value => <button type="button" key={value} className={button} disabled={!ids.length} onClick={() => { setOpacity(String(value)); apply({ kind: "opacity", value: value / 100 }); }}>{value}%</button>)}</div>{error && <p role="alert" className="text-xs text-red-300">{error}</p>}</div>;
}
