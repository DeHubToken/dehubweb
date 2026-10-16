import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useEditorStore } from "@/store/editorStore";
import { applyDesignLink, normaliseDesignLink } from "@/lib/editor/designLinks";

export function DesignLinkPanel() {
  const ids = useEditorStore(s => s.selectedClipIds), clips = useEditorStore(s => s.clips);
  const selected = clips.filter(c => ids.includes(c.id) && c.kind !== "audio");
  return <LinkDraft key={`${useEditorStore.getState().projectId}:${ids.join(",")}`} initial={selected[0]?.href ?? ""} disabled={!selected.length || selected.some(c => c.locked)} />;
}
function LinkDraft({ initial, disabled }: { initial: string; disabled: boolean }) {
  const { t } = useTranslation();
  const [value, setValue] = useState(initial);
  const apply = (href: string | null) => {
    const store = useEditorStore.getState(), before = store.toSnapshot();
    store.applyDesignEdit(before, applyDesignLink(before, store.selectedClipIds, href));
    if (href === null) setValue("");
  };
  const valid = normaliseDesignLink(value);
  return <form className="space-y-3" onSubmit={e => { e.preventDefault(); if (valid && !disabled) apply(valid); }}>
    <label className="block text-xs text-white/65">{t("editor.links.destination", { defaultValue: "Link destination" })}<input value={value} onChange={e => setValue(e.target.value)} maxLength={2048} placeholder="https://" inputMode="url" autoCapitalize="none" autoCorrect="off" className="mt-1 min-h-9 w-full rounded-lg border border-white/20 bg-white/5 px-3 text-sm text-white" /></label>
    <div className="flex gap-2"><button type="submit" disabled={disabled || !valid} className="min-h-9 rounded-lg bg-white px-3 text-xs font-medium text-black disabled:opacity-35">{t("editor.links.apply", { defaultValue: "Apply link" })}</button><button type="button" disabled={disabled} onClick={() => apply(null)} className="min-h-9 rounded-lg border border-white/20 px-3 text-xs disabled:opacity-35">{t("editor.links.remove", { defaultValue: "Remove link" })}</button></div>
    <p className="text-xs text-white/50">{t("editor.links.hint", { defaultValue: "Select text, photos, or shapes. PDF downloads preserve clickable web, email, and phone links." })}</p>
  </form>;
}
