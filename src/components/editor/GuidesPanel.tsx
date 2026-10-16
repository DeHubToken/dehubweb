import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useEditorStore } from "@/store/editorStore";
import { changeDesignGuides, getDesignGuides, type DesignGuides } from "@/lib/editor/designGuides";

export function GuidesPanel() {
  const { t } = useTranslation();
  const value = useEditorStore(s => s.settings.guides), guides = getDesignGuides(value);
  const [position, setPosition] = useState("50"), [axis, setAxis] = useState<"vertical" | "horizontal">("vertical");
  const apply = (patch: Partial<DesignGuides>) => { const s = useEditorStore.getState(), before = s.toSnapshot(); s.applyDesignEdit(before, changeDesignGuides(before, patch)); };
  const button = "min-h-9 rounded-lg border border-white/20 px-3 text-xs text-white/80 hover:bg-white/10";
  return <div className="space-y-3 text-xs">
    <p className="text-white/55">{t("editor.guides.hint", { defaultValue: "Guides and margins help you align a layout. They are not included in downloads." })}</p>
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2"><input type="checkbox" checked={guides.visible} onChange={e => apply({ visible: e.target.checked })} />{t("editor.guides.visible", { defaultValue: "Show guides" })}</label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={guides.snap} onChange={e => apply({ snap: e.target.checked })} />{t("editor.guides.snap", { defaultValue: "Snap to guides" })}</label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={guides.rulers} onChange={e => apply({ rulers: e.target.checked })} />{t("editor.guides.rulers", { defaultValue: "Show rulers" })}</label>
      <button type="button" className={button} onClick={() => apply({ vertical: [0.5], horizontal: [0.5], visible: true })}>{t("editor.guides.centre", { defaultValue: "Centre" })}</button>
      <button type="button" className={button} onClick={() => apply({ vertical: [1 / 3, 2 / 3], horizontal: [1 / 3, 2 / 3], visible: true })}>{t("editor.guides.thirds", { defaultValue: "Thirds" })}</button>
      <button type="button" className={button} onClick={() => apply({ vertical: [], horizontal: [], margin: 0 })}>{t("editor.guides.clear", { defaultValue: "Clear" })}</button>
    </div>
    <form className="flex flex-wrap items-center gap-2" onSubmit={e => { e.preventDefault(); const n = Number(position) / 100; if (Number.isFinite(n) && n >= 0 && n <= 1) apply({ [axis]: [...guides[axis], n], visible: true }); }}>
      <select value={axis} onChange={e => setAxis(e.target.value as typeof axis)} aria-label={t("editor.guides.direction", { defaultValue: "Guide direction" })} className="min-h-9 rounded-lg border border-white/20 bg-neutral-900 px-2"><option value="vertical">{t("editor.guides.vertical", { defaultValue: "Vertical" })}</option><option value="horizontal">{t("editor.guides.horizontal", { defaultValue: "Horizontal" })}</option></select>
      <input type="number" min={0} max={100} required value={position} onChange={e => setPosition(e.target.value)} aria-label={t("editor.guides.position", { defaultValue: "Position as a percentage" })} className="min-h-9 w-20 rounded-lg border border-white/20 bg-white/5 px-2" /><span>%</span>
      <button type="submit" className={button}>{t("editor.guides.add", { defaultValue: "Add guide" })}</button>
      <label className="flex items-center gap-2 text-white/65">{t("editor.guides.margin", { defaultValue: "Margin" })}<input type="number" min={0} max={40} value={Math.round(guides.margin * 100)} onChange={e => apply({ margin: Number(e.target.value) / 100, visible: true })} className="min-h-9 w-16 rounded-lg border border-white/20 bg-white/5 px-2 text-white" />%</label>
    </form>
    <div className="flex flex-wrap gap-2">{(["vertical", "horizontal"] as const).flatMap(direction => guides[direction].map(n => <button key={`${direction}:${n}`} type="button" className={button} aria-label={t("editor.guides.remove", { defaultValue: "Remove {{direction}} guide at {{position}}%", direction: t(`editor.guides.${direction}`, { defaultValue: direction }), position: Number((n * 100).toFixed(1)) })} onClick={() => apply({ [direction]: guides[direction].filter(value => value !== n) })}>{direction === "vertical" ? "X" : "Y"} {Number((n * 100).toFixed(1))}% ×</button>))}</div>
  </div>;
}
