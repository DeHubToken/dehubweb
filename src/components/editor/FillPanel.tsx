import { useState } from "react";
import { useTranslation } from "react-i18next";
import { nanoid } from "nanoid";
import { useEditorStore } from "@/store/editorStore";
import { GRADIENT_PRESETS, gradientFromColours, validGradientFill, type GradientFill } from "@/lib/editor/gradientFill";
import { useGradientDraft } from "@/lib/editor/useGradientDraft";
import { fillDesignLayers, putGradientBackground, putSolidBackground, solidDesignLayers, removePageBackground } from "@/lib/editor/fillProject";
import { PhotoBackgroundControls } from "./PhotoBackgroundControls";
import { GradientEditor } from "./GradientEditor";
import { BackgroundScopeControls } from "./BackgroundScopeControls";

export function FillPanel() {
  const { t } = useTranslation();
  const ids = useEditorStore(store => store.selectedClipIds), clips = useEditorStore(store => store.clips);
  const selected = clips.find(clip => ids.includes(clip.id) && (clip.kind === "text" || clip.kind === "shape"));
  const { fill, setFill, first } = useGradientDraft(selected);
  const [error, setError] = useState("");
  const canFill = clips.some(clip => ids.includes(clip.id) && !clip.locked && (clip.kind === "text" || (clip.kind === "shape" && !clip.chart && !clip.table && !clip.qr)));
  const valid = validGradientFill(fill), solidValid = /^#[\da-f]{6}$/i.test(first);
  const apply = (value: GradientFill | null, background = false) => {
    if (value && !validGradientFill(value)) return;
    const store = useEditorStore.getState(), before = store.toSnapshot();
    const result = background && value ? putGradientBackground(before, store.currentTime, value, () => nanoid(10)) : null;
    if (background && !result) { setError(t("editor.fills.lockedBackground", { defaultValue: "Unlock the page background before replacing it." })); return; }
    const next = background ? result?.project : fillDesignLayers(before, store.selectedClipIds, value);
    if (next && next !== before && store.applyDesignEdit(before, next) && result) store.selectClip(result.id);
    setError("");
  };
  const applySolid = (background = false) => {
    if (!solidValid) return;
    const store = useEditorStore.getState(), before = store.toSnapshot();
    const result = background ? putSolidBackground(before, store.currentTime, first, () => nanoid(10)) : null;
    if (background && !result) { setError(t("editor.fills.lockedBackground", { defaultValue: "Unlock the page background before replacing it." })); return; }
    const next = background ? result?.project : solidDesignLayers(before, store.selectedClipIds, first);
    if (next && next !== before && store.applyDesignEdit(before, next) && result) store.selectClip(result.id);
    setError("");
  };
  const button = "min-h-9 rounded-lg border border-white/20 px-3 text-xs text-white/80 disabled:opacity-35";
  return <div className="space-y-3">
    <PhotoBackgroundControls />
    <BackgroundScopeControls />
    <p className="text-xs text-white/55">{t("editor.fills.hint", { defaultValue: "Apply a gradient to selected text or shapes, or add it behind this page." })}</p>
    <div className="flex flex-wrap gap-2">{GRADIENT_PRESETS.map(preset => <button key={preset.id} type="button" onClick={() => { const next = { ...fill, stops: gradientFromColours(preset.colours).stops }; setFill(next); apply(next, !canFill); }} className="flex min-h-12 items-center gap-2 rounded-lg border border-white/15 px-3 text-xs hover:bg-white/10"><span className="h-8 w-12 rounded-md" style={{ background: `linear-gradient(45deg, ${preset.colours.join(",")})` }} />{t(`editor.fills.preset.${preset.id}`, { defaultValue: preset.label })}</button>)}</div>
    <GradientEditor value={fill} onChange={setFill} projectId={useEditorStore.getState().projectId} />
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={!canFill || !valid} onClick={() => apply(fill)} className="min-h-9 rounded-lg bg-white px-3 text-xs font-medium text-black disabled:opacity-35">{t("editor.fills.apply", { defaultValue: "Apply fill" })}</button>
      <button type="button" disabled={!valid} onClick={() => apply(fill, true)} className={button}>{t("editor.fills.background", { defaultValue: "Use as page background" })}</button>
      <button type="button" disabled={!canFill || !solidValid} onClick={() => applySolid()} className={button}>{t("editor.fills.applySolid", { defaultValue: "Apply first colour as solid" })}</button>
      <button type="button" disabled={!solidValid} onClick={() => applySolid(true)} className={button}>{t("editor.fills.solidBackground", { defaultValue: "Use first colour as page background" })}</button>
      <button type="button" onClick={() => { const store = useEditorStore.getState(), before = store.toSnapshot(); store.applyDesignEdit(before, removePageBackground(before, store.currentTime)); }} className={button}>{t("editor.fills.resetBackground", { defaultValue: "Reset page background" })}</button>
      <button type="button" disabled={!canFill} onClick={() => apply(null)} className={button}>{t("editor.fills.solid", { defaultValue: "Restore solid fill" })}</button>
    </div>
    {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
  </div>;
}
