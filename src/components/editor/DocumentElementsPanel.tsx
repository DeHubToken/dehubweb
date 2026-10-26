import { RepeatPageScopeControls } from "./RepeatPageScopeControls";
import { resolveRepeatPageScope, type RepeatPageScope } from "@/lib/editor/repeatPageScope";
import { designPageSections } from "@/lib/editor/pageDetails";
import { useState } from "react";
import { nanoid } from "nanoid";
import { useTranslation } from "react-i18next";
import { useEditorStore } from "@/store/editorStore";
import { DEFAULT_PAGE_NUMBER_FORMAT, pageNumberText, type PageNumberFormat } from "@/lib/editor/pageNumbering";
import { putPageNumbers, removePageNumbers, repeatPageElements, type PageNumberPosition } from "@/lib/editor/documentElements";
import { getPages } from "@/lib/editor/pages";
import type { ProjectSnapshot } from "@/lib/editor/types";
import { editorErrorText } from "@/lib/editor/editorErrorText";

export function DocumentElementsPanel() {
  const { t } = useTranslation();
  const ids = useEditorStore(s => s.selectedClipIds), clips = useEditorStore(s => s.clips), settings = useEditorStore(s => s.settings);
  const [repeatScope, setRepeatScope] = useState<RepeatPageScope>({ mode: "all", range: "", section: "" });
  const [format, setFormat] = useState<PageNumberFormat>({ ...DEFAULT_PAGE_NUMBER_FORMAT });
  const [position, setPosition] = useState<PageNumberPosition>("bottom-centre"), [skipFirst, setSkipFirst] = useState(false), [colour, setColour] = useState("#ffffff"), [fontSize, setFontSize] = useState(28), [message, setMessage] = useState("");
  const apply = (operation: (project: ProjectSnapshot) => ProjectSnapshot, success: string) => {
    try { const store = useEditorStore.getState(), before = store.toSnapshot(), next = operation(before); if (next !== before) store.applyDesignEdit(before, next); setMessage(success); }
    catch (error) { setMessage(editorErrorText(error, t("copy.68865e14c4b1", { defaultValue: "Could not add this element" }))); }
  };
  const input = "min-h-9 rounded-lg border border-white/20 bg-neutral-900 px-3 text-xs text-white";
  const count = getPages(settings, clips).length;
  return <div className="space-y-4">
    <div className="flex items-center gap-3"><span className="rounded-lg border border-white/20 bg-white/5 px-4 py-3 text-lg text-white" aria-label={t("editor.document.numberPreview", { defaultValue: "Page number preview" })}>{pageNumberText(0, count, format)}</span><p className="max-w-lg text-xs text-white/55">{t("editor.document.numberHint", { defaultValue: "Add editable page numbers to the whole document. Numbers update when pages are added, duplicated, deleted, or reordered. Locked numbers stay unchanged." })}</p></div>
    <div className="flex flex-wrap items-end gap-3">
      <label className="space-y-1 text-xs text-white/65"><span className="block">{t("editor.document.position", { defaultValue: "Position" })}</span><select value={position} onChange={event => setPosition(event.target.value as PageNumberPosition)} className={input}>{(["top-left", "top-centre", "top-right", "bottom-left", "bottom-centre", "bottom-right"] as const).map(value => <option key={value} value={value}>{t(`editor.document.position.${value}`, { defaultValue: value.replace("-", " ") })}</option>)}</select></label>
      <label className="space-y-1 text-xs text-white/65"><span className="block">{t("editor.document.numberStyle", { defaultValue: "Number style" })}</span><select value={format.style} onChange={event => setFormat({ ...format, style: event.target.value as PageNumberFormat["style"] })} className={input}><option value="decimal">1, 2, 3</option><option value="roman">I, II, III</option><option value="alpha">A, B, C</option></select></label>
      <label className="space-y-1 text-xs text-white/65"><span className="block">{t("editor.document.start", { defaultValue: "Start at" })}</span><input type="number" min={1} max={9999} value={format.start} onChange={event => setFormat({ ...format, start: Number(event.target.value) })} className={input + " w-24"} /></label>
      <label className="space-y-1 text-xs text-white/65"><span className="block">{t("editor.document.size", { defaultValue: "Text size" })}</span><input type="number" min={6} max={200} value={fontSize} onChange={event => setFontSize(Number(event.target.value))} className={input + " w-24"} /></label>
      <input type="color" value={colour} onChange={event => setColour(event.target.value)} aria-label={t("editor.document.colour", { defaultValue: "Page number colour" })} className="h-9 w-12 bg-transparent" />
      <input value={format.prefix} maxLength={40} onChange={event => setFormat({ ...format, prefix: event.target.value })} aria-label={t("editor.document.prefix", { defaultValue: "Prefix" })} placeholder={t("editor.document.prefix", { defaultValue: "Prefix" })} className={input + " w-28"} />
      <input value={format.suffix} maxLength={40} onChange={event => setFormat({ ...format, suffix: event.target.value })} aria-label={t("editor.document.suffix", { defaultValue: "Suffix" })} placeholder={t("editor.document.suffix", { defaultValue: "Suffix" })} className={input + " w-28"} />
    </div>
    <div className="flex flex-wrap items-center gap-4 text-xs text-white/65"><label className="flex min-h-9 items-center gap-2"><input type="checkbox" checked={format.total} onChange={event => setFormat({ ...format, total: event.target.checked })} />{t("editor.document.total", { defaultValue: "Show total pages" })}</label><label className="flex min-h-9 items-center gap-2"><input type="checkbox" checked={skipFirst} onChange={event => setSkipFirst(event.target.checked)} />{t("editor.document.skipCover", { defaultValue: "Hide on first page" })}</label>
      <button type="button" onClick={() => apply(project => putPageNumbers(project, { format, position, skipFirst, colour, fontSize }, nanoid), t("editor.document.numbersApplied", { defaultValue: "Page numbers applied" }))} className="min-h-9 rounded-lg bg-white px-3 font-medium text-black">{t("editor.document.applyNumbers", { defaultValue: "Apply page numbers" })}</button>
      <button type="button" disabled={!clips.some(clip => clip.kind === "text" && clip.pageNumber && !clip.locked)} onClick={() => apply(removePageNumbers, t("editor.document.numbersRemoved", { defaultValue: "Unlocked page numbers removed" }))} className="min-h-9 rounded-lg border border-white/20 px-3 disabled:opacity-35">{t("editor.document.removeNumbers", { defaultValue: "Remove page numbers" })}</button>
    </div>
    <RepeatPageScopeControls value={repeatScope} sections={designPageSections(useEditorStore.getState().toSnapshot())} onChange={setRepeatScope} />
    <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-3"><p className="max-w-lg text-xs text-white/55">{t("editor.document.repeatHint", { defaultValue: "Select a header, footer, logo, or still artwork to copy it to the same position on chosen pages. Each copy stays independently editable." })}</p><button type="button" disabled={!ids.length || count < 2} onClick={() => apply(project => repeatPageElements(project, useEditorStore.getState().selectedClipIds, useEditorStore.getState().currentTime, nanoid, resolveRepeatPageScope(project, repeatScope)).project, t("editor.document.repeated", { defaultValue: "Selected elements copied to the chosen pages" }))} className="min-h-9 rounded-lg border border-white/20 px-3 text-xs text-white disabled:opacity-35">{t("editor.document.repeat", { defaultValue: "Copy selection to other pages" })}</button></div>
    {message && <p role="status" className="text-xs text-cyan-100">{message}</p>}
  </div>;
}
