import { useState } from "react";
import { useTranslation } from "react-i18next";
import { nanoid } from "nanoid";
import { useEditorStore } from "@/store/editorStore";
import { putTextComposition, TEXT_COMPOSITIONS, type TextCompositionId } from "@/lib/editor/textCompositions";

export function TextCompositionsPanel() {
  const { t } = useTranslation();
  const [title, setTitle] = useState(t("editor.compositions.sampleTitle", { defaultValue: "Make something memorable" }));
  const [subtitle, setSubtitle] = useState(t("editor.compositions.sampleSubtitle", { defaultValue: "Your story starts here." }));
  const [eyebrow, setEyebrow] = useState(t("editor.compositions.sampleEyebrow", { defaultValue: "A fresh perspective" }));
  const [colour, setColour] = useState("#ffffff"), [accent, setAccent] = useState("#38bdf8");
  const insert = (id: TextCompositionId) => {
    const store = useEditorStore.getState(), before = store.toSnapshot();
    const result = putTextComposition(before, store.currentTime, id, { title, subtitle, eyebrow, colour, accent }, () => nanoid(10));
    if (result && store.applyDesignEdit(before, result.project)) store.selectClip(result.id);
  };
  return <div className="space-y-3">
    <div className="grid gap-2 sm:grid-cols-3">{[{ value: title, set: setTitle, label: t("editor.compositions.heading", { defaultValue: "Heading" }) }, { value: subtitle, set: setSubtitle, label: t("editor.compositions.subtitle", { defaultValue: "Supporting text" }) }, { value: eyebrow, set: setEyebrow, label: t("editor.compositions.eyebrow", { defaultValue: "Eyebrow" }) }].map(field => <label key={field.label} className="text-xs text-white/60">{field.label}<input value={field.value} onChange={e => field.set(e.target.value)} maxLength={2000} className="mt-1 min-h-9 w-full rounded-lg border border-white/20 bg-white/5 px-2 text-white" /></label>)}</div>
    <div className="flex gap-3 text-xs"><label className="flex items-center gap-2">{t("editor.compositions.colour", { defaultValue: "Text colour" })}<input type="color" value={colour} onChange={e => setColour(e.target.value)} className="h-8 w-10 bg-transparent" /></label><label className="flex items-center gap-2">{t("editor.compositions.accent", { defaultValue: "Accent colour" })}<input type="color" value={accent} onChange={e => setAccent(e.target.value)} className="h-8 w-10 bg-transparent" /></label></div>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{TEXT_COMPOSITIONS.map(preset => <button type="button" key={preset.id} disabled={!title.trim()} onClick={() => insert(preset.id)} className="min-h-16 rounded-xl border border-white/15 p-3 text-left hover:border-white/50 hover:bg-white/5 disabled:opacity-35"><span className="block text-sm font-semibold">{t(`editor.compositions.${preset.id}`, { defaultValue: preset.label })}</span><span className="text-[11px] text-white/45">{preset.heading} + {preset.body}</span></button>)}</div>
  </div>;
}
