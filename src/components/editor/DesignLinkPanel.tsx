import { groupedSelection } from "@/lib/editor/designGroups";
import { QrContentBuilder } from "./QrContentBuilder";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useEditorStore } from "@/store/editorStore";
import { applyDesignLink, designPageLinkIndex, normaliseDesignLink } from "@/lib/editor/designLinks";
import { getPages } from "@/lib/editor/pages";

export function DesignLinkPanel() {
  const ids = useEditorStore(s => s.selectedClipIds), clips = useEditorStore(s => s.clips);
  const time = useEditorStore(store => store.currentTime), expanded = groupedSelection(clips, ids, time);
  const selected = clips.filter(c => expanded.includes(c.id) && c.kind !== "audio");
  const mixed = new Set(selected.map(clip => clip.href || "")).size > 1;
  return <LinkDraft mixed={mixed} key={`${useEditorStore.getState().projectId}:${expanded.join(",")}`} initial={mixed ? "" : selected[0]?.href ?? ""} disabled={!selected.length || selected.some(c => c.locked)} />;
}
function LinkDraft({ initial, disabled, mixed }: { initial: string; disabled: boolean; mixed: boolean }) {
  const { t } = useTranslation();
  const [value, setValue] = useState(initial);
  const [mode, setMode] = useState<"url" | "page">(designPageLinkIndex(initial) === null ? "url" : "page");
  const [pageNumber, setPageNumber] = useState(String((designPageLinkIndex(initial) ?? 0) + 1));
  const settings = useEditorStore(s => s.settings), clips = useEditorStore(s => s.clips);
  const pages = getPages(settings, clips);
  const apply = (href: string | null) => {
    const store = useEditorStore.getState(), before = store.toSnapshot();
    store.applyDesignEdit(before, applyDesignLink(before, groupedSelection(before.clips, store.selectedClipIds, store.currentTime), href));
    if (href === null) setValue("");
  };
  const target = Number(pageNumber) - 1;
  const valid = mode === "page" ? Number.isInteger(target) && pages[target] ? `#page=${target + 1}` : null : normaliseDesignLink(value);
  const [copyMessage, setCopyMessage] = useState(""), [copyError, setCopyError] = useState(""), generation = useRef(0);
  useEffect(() => { generation.current++; setCopyMessage(""); setCopyError(""); return () => { generation.current++; }; }, [valid]);
  const copy = async () => { if (!valid) return; const request = ++generation.current; try { if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable"); await navigator.clipboard.writeText(valid); if (request === generation.current) { setCopyMessage(t("editor.links.copied", { defaultValue: "Link destination copied" })); setCopyError(""); } } catch { if (request === generation.current) { setCopyMessage(""); setCopyError(t("editor.links.copyFailed", { defaultValue: "Could not copy link destination" })); } } };
  return <form className="space-y-3" onSubmit={e => { e.preventDefault(); if (valid && !disabled) apply(valid); }}>
    <div className="flex gap-2">{(["url", "page"] as const).map(kind => <button key={kind} type="button" aria-pressed={mode === kind} onClick={() => setMode(kind)} className={`min-h-9 rounded-lg border px-3 text-xs ${mode === kind ? "border-cyan-300 bg-cyan-300/10 text-white" : "border-white/20 text-white/60"}`}>{t(kind === "url" ? "editor.links.mode.contactUrl" : "editor.links.mode.page", { defaultValue: kind === "url" ? "Website or contact link" : "Page in this design" })}</button>)}</div>
    {mixed && <p role="status" className="text-xs text-white/55">{t("editor.links.mixed", { defaultValue: "Selected artwork has mixed link destinations. Apply a destination to give it the same link." })}</p>}
    <QrContentBuilder kinds={["email", "phone", "sms"]} title={t("editor.links.contactBuilder", { defaultValue: "Build email, phone or SMS link" })} onUse={next => { setValue(next); setMode("url"); }} />
    {mode === "url" ? <label className="block text-xs text-white/65">{t("editor.links.destination", { defaultValue: "Link destination" })}<input value={value} onChange={e => setValue(e.target.value)} maxLength={2048} placeholder="https://" inputMode="url" autoCapitalize="none" autoCorrect="off" className="mt-1 min-h-9 w-full rounded-lg border border-white/20 bg-white/5 px-3 text-sm text-white" /></label> : <label className="block text-xs text-white/65">{t("editor.links.targetPage", { defaultValue: "Destination page" })}<select value={pageNumber} onChange={event => setPageNumber(event.target.value)} className="mt-1 min-h-9 w-full rounded-lg border border-white/20 bg-neutral-900 px-3 text-sm text-white">{pages.map(page => <option key={page.index} value={page.index + 1}>{page.index + 1}{settings.pageDetails?.[page.index]?.title ? ` · ${settings.pageDetails[page.index].title}` : ""}</option>)}</select></label>}
    <div className="flex gap-2"><button type="submit" disabled={disabled || !valid} className="min-h-9 rounded-lg bg-white px-3 text-xs font-medium text-black disabled:opacity-35">{t("editor.links.apply", { defaultValue: "Apply link" })}</button><button type="button" disabled={disabled} onClick={() => apply(null)} className="min-h-9 rounded-lg border border-white/20 px-3 text-xs disabled:opacity-35">{t("editor.links.remove", { defaultValue: "Remove link" })}</button></div>
    <div className="flex flex-wrap items-center gap-2"><button type="button" disabled={!valid} onClick={() => { void copy(); }} className="min-h-9 rounded-lg border border-white/20 px-3 text-xs text-white/75 disabled:opacity-35">{t("editor.links.copyDestination", { defaultValue: "Copy destination" })}</button>{copyMessage && <p role="status" className="text-xs text-cyan-200">{copyMessage}</p>}{copyError && <p role="alert" className="text-xs text-red-300">{copyError}</p>}</div>
    <p className="text-xs text-white/50">{t("editor.links.hint", { defaultValue: "PDF downloads preserve web, email, phone, SMS and page links. Contact-link handling depends on the viewer and device. Export destination pages to keep internal links active." })}</p>
  </form>;
}
