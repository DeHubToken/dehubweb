import { useState } from "react";
import { nanoid } from "nanoid";
import { useTranslation } from "react-i18next";
import { useEditorStore } from "@/store/editorStore";
import { ANIMATION_PRESETS } from "@/lib/editor/animationPresets";
import { applyPageAnimation, type PageAnimationEdge, type PageAnimationScope } from "@/lib/editor/pageAnimations";
import type { ClipAnimationKind } from "@/lib/editor/types";
import { editorErrorText } from "@/lib/editor/editorErrorText";

export function PageAnimationPanel() {
  const { t } = useTranslation();
  const [scope, setScope] = useState<PageAnimationScope>("page"), [edge, setEdge] = useState<PageAnimationEdge>("in");
  const [kind, setKind] = useState<ClipAnimationKind | "none">("fade"), [duration, setDuration] = useState("0.6");
  const [message, setMessage] = useState(""), [error, setError] = useState("");
  const ids = useEditorStore(s => s.selectedClipIds);
  const apply = () => {
    try {
      const store = useEditorStore.getState(), before = store.toSnapshot();
      const result = applyPageAnimation(before, store.currentTime, store.selectedClipIds, { scope, edge, kind, duration: Number(duration) }, () => nanoid(10));
      if (result.project !== before && store.applyDesignEdit(before, result.project)) { store.setIsPlaying(false); store.selectClip(null); }
      setError(""); setMessage(result.count ? t("editor.pageAnimation.updated", { defaultValue: "Updated {{count}} layers", count: result.count }) : t("editor.pageAnimation.noChange", { defaultValue: "No editable layers needed changing" }));
    } catch (value) { setError(editorErrorText(value, t("copy.235ef181c079", { defaultValue: "Could not apply animation" }))); }
  };
  const chip = (label: string, active: boolean, onClick: () => void, disabled = false) => <button key={label} type="button" aria-pressed={active} disabled={disabled} onClick={() => { onClick(); setMessage(""); }} className={`min-h-9 rounded-lg border px-3 text-xs disabled:opacity-35 ${active ? "border-white bg-white text-black" : "border-white/20 text-white/75 hover:bg-white/10"}`}>{label}</button>;
  return <div className="space-y-3">
    <p className="text-xs text-white/60">{t("editor.pageAnimation.hint", { defaultValue: "Apply coordinated entrance or exit motion to a page or selection. Locked and hidden layers stay unchanged. Images and PDFs still export the complete artwork." })}</p>
    <div className="flex flex-wrap gap-2">{(["page", "all", "selection"] as const).map(value => chip(t(`editor.pageAnimation.scope.${value}`, { defaultValue: ({ page: "This page", all: "Every page", selection: "Selected layers" })[value] }), scope === value, () => setScope(value), value === "selection" && !ids.length))}</div>
    <div className="flex flex-wrap gap-2">{(["in", "out", "both"] as const).map(value => chip(t(`editor.pageAnimation.edge.${value}`, { defaultValue: ({ in: "On enter", out: "On exit", both: "Enter and exit" })[value] }), edge === value, () => setEdge(value)))}</div>
    <div className="flex flex-wrap gap-2">{chip(t("editor.pageAnimation.none", { defaultValue: "None" }), kind === "none", () => setKind("none"))}{ANIMATION_PRESETS.map(preset => chip(t(`editor.animation.${preset.kind}`, { defaultValue: preset.label }), kind === preset.kind, () => setKind(preset.kind)))}</div>
    {kind !== "none" && <label className="flex items-center gap-3 text-xs text-white/65">{t("editor.pageAnimation.duration", { defaultValue: "Duration in seconds" })}<input type="number" min={0.05} max={10} step={0.05} value={duration} onChange={e => setDuration(e.target.value)} className="min-h-9 w-24 rounded-lg border border-white/20 bg-white/5 px-2 text-white" /></label>}
    {kind === "typewriter" && <p className="text-xs text-white/45">{t("editor.pageAnimation.typewriterHint", { defaultValue: "Text types on; other layers fade. Durations fit within each layer’s timing." })}</p>}
    <button type="button" disabled={scope === "selection" && !ids.length} onClick={apply} className="min-h-9 rounded-lg bg-white px-3 text-xs font-medium text-black disabled:opacity-35">{t("editor.pageAnimation.apply", { defaultValue: "Apply animation" })}</button>
    {message && <p role="status" className="text-xs text-white/60">{message}</p>}{error && <p role="alert" className="text-xs text-red-300">{error}</p>}
  </div>;
}
