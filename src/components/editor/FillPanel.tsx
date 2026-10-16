import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { nanoid } from "nanoid";
import { useEditorStore } from "@/store/editorStore";
import { GRADIENT_PRESETS, gradientFromColours, type GradientFill } from "@/lib/editor/gradientFill";
import { fillDesignLayers, putGradientBackground } from "@/lib/editor/fillProject";

export function FillPanel() {
  const { t } = useTranslation();
  const ids = useEditorStore(s => s.selectedClipIds);
  const clips = useEditorStore(s => s.clips);
  const selected = clips.find(c => ids.includes(c.id) && (c.kind === "text" || c.kind === "shape"));
  const gradient = selected && (selected.kind === "text" || selected.kind === "shape") ? selected.gradient : null;
  const [type, setType] = useState<GradientFill["type"]>("linear");
  const [angle, setAngle] = useState(45);
  const [first, setFirst] = useState("#2563eb"), [last, setLast] = useState("#22d3ee");
  useEffect(() => {
    if (!gradient?.stops?.length) return;
    setType(gradient.type); setAngle(gradient.angle); setFirst(gradient.stops[0].colour); setLast(gradient.stops[gradient.stops.length - 1].colour);
  }, [selected?.id, gradient]);
  const apply = (value: GradientFill | null, background = false) => {
    const store = useEditorStore.getState(), before = store.toSnapshot();
    const result = background && value ? putGradientBackground(before, store.currentTime, value, () => nanoid(10)) : null;
    const next = background ? result?.project : fillDesignLayers(before, store.selectedClipIds, value);
    if (next && next !== before && store.applyDesignEdit(before, next) && result) store.selectClip(result.id);
  };
  const canFill = clips.some(c => ids.includes(c.id) && !c.locked && (c.kind === "text" || (c.kind === "shape" && !c.chart && !c.table)));
  return <div className="space-y-3">
    <p className="text-xs text-white/55">{t("editor.fills.hint", { defaultValue: "Apply a gradient to selected text or shapes, or add it behind this page." })}</p>
    <div className="flex flex-wrap gap-2">{GRADIENT_PRESETS.map(preset => <button key={preset.id} type="button" onClick={() => { setFirst(preset.colours[0]); setLast(preset.colours[preset.colours.length - 1]); apply(gradientFromColours(preset.colours, type, angle), !canFill); }} className="flex min-h-12 items-center gap-2 rounded-lg border border-white/15 px-3 text-xs hover:bg-white/10">
      <span className="h-8 w-12 rounded-md" style={{ background: `linear-gradient(45deg, ${preset.colours.join(",")})` }} />{t(`editor.fills.preset.${preset.id}`, { defaultValue: preset.label })}
    </button>)}</div>
    <div className="flex flex-wrap items-center gap-3 text-xs">
      <select aria-label={t("editor.fills.type", { defaultValue: "Gradient type" })} value={type} onChange={e => setType(e.target.value as GradientFill["type"])} className="min-h-9 rounded-lg border border-white/20 bg-neutral-900 px-2"><option value="linear">{t("editor.fills.linear", { defaultValue: "Linear" })}</option><option value="radial">{t("editor.fills.radial", { defaultValue: "Radial" })}</option></select>
      <input type="color" value={first} onChange={e => setFirst(e.target.value)} aria-label={t("editor.fills.first", { defaultValue: "First colour" })} className="h-9 w-10 bg-transparent" />
      <input type="color" value={last} onChange={e => setLast(e.target.value)} aria-label={t("editor.fills.last", { defaultValue: "Last colour" })} className="h-9 w-10 bg-transparent" />
      <label>{t("editor.fills.angle", { defaultValue: "Angle" })}<input type="number" min={0} max={360} value={angle} onChange={e => setAngle(Math.max(0, Math.min(360, Number(e.target.value) || 0)))} className="ml-2 min-h-9 w-20 rounded-lg border border-white/20 bg-white/5 px-2" /></label>
      <button type="button" disabled={!canFill} onClick={() => apply(gradientFromColours([first, last], type, angle))} className="min-h-9 rounded-lg bg-white px-3 font-medium text-black disabled:opacity-35">{t("editor.fills.apply", { defaultValue: "Apply fill" })}</button>
      <button type="button" onClick={() => apply(gradientFromColours([first, last], type, angle), true)} className="min-h-9 rounded-lg border border-white/20 px-3">{t("editor.fills.background", { defaultValue: "Use as page background" })}</button>
      <button type="button" disabled={!canFill} onClick={() => apply(null)} className="min-h-9 rounded-lg border border-white/20 px-3 disabled:opacity-35">{t("editor.fills.solid", { defaultValue: "Restore solid fill" })}</button>
    </div>
  </div>;
}
