import { PageSectionControls } from "./PageSectionControls";
import { PageDurationBatchControls } from "./PageDurationBatchControls";
import { PageLayerTransferControls } from "./PageLayerTransferControls";
import { PageRangeSelection } from "./PageRangeSelection";
import { PageNamingControls } from "./PageNamingControls";
import { setPagesPresentationHidden } from "@/lib/editor/pageDetails";
import { usePagePreviewImages } from "@/lib/editor/usePagePreviewImages";
import { useMemo, useState } from "react";
import { nanoid } from "nanoid";
import { useTranslation } from "react-i18next";
import { useEditorStore } from "@/store/editorStore";
import { pageAt } from "@/lib/editor/pages";
import { designPageOverview, manageDesignPages, moveDesignPagesBefore, type PageManagementAction } from "@/lib/editor/pageManagement";

export function PagesManagerPanel() {
  const { t } = useTranslation();
  const clips = useEditorStore(store => store.clips), settings = useEditorStore(store => store.settings), tracks = useEditorStore(store => store.tracks), time = useEditorStore(store => store.currentTime);
  const projectId = useEditorStore(store => store.projectId);
  const project = useMemo(() => useEditorStore.getState().toSnapshot(), [clips, settings, tracks, projectId]);
  const pages = useMemo(() => designPageOverview({ ...useEditorStore.getState().toSnapshot(), clips, settings, tracks }), [clips, settings, tracks]);
  const current = pageAt(pages, time);
  const [picked, setPicked] = useState<number[]>([current.index]), [query, setQuery] = useState(""), [offset, setOffset] = useState(Math.floor(current.index / 12) * 12);
  const [destination, setDestination] = useState("1");
  const [message, setMessage] = useState(""), [error, setError] = useState("");
  const selected = picked.filter(index => !!pages[index]);
  const needle = query.trim().toLowerCase(), filtered = needle ? pages.filter(page => `${page.index + 1} ${page.title} ${page.section ?? ""} ${page.headline}`.toLowerCase().includes(needle)) : pages;
  const first = Math.min(offset, Math.max(0, Math.floor((filtered.length - 1) / 12) * 12));
  const [previews, setPreviews] = useState(true);
  const preview = usePagePreviewImages(project, filtered.slice(first, first + 12), previews);
  const apply = (action: PageManagementAction | "before") => {
    try {
      const store = useEditorStore.getState(), before = store.toSnapshot(); if (before.id !== project.id) return;
      const result = action === "before" ? moveDesignPagesBefore(before, selected, Number(destination) - 1, () => nanoid(10)) : manageDesignPages(before, selected, action, () => nanoid(10));
      if (result.project !== before && store.applyDesignEdit(before, result.project)) { store.setIsPlaying(false); store.selectClip(null); store.setCurrentTime(result.time); }
      setPicked(result.selected); setQuery(""); setOffset(Math.floor(result.selected[0] / 12) * 12); setError("");
      setMessage(t(`editor.pageManager.result.${action}`, { defaultValue: ({ duplicate: "Duplicated {{count}} pages", delete: "Deleted {{count}} pages", first: "Moved {{count}} pages", last: "Moved {{count}} pages", before: "Moved {{count}} pages" })[action], count: result.count }));
    } catch (value) { setError(value instanceof Error ? value.message : "Could not change these pages"); }
  };
  const visibility = (hidden: boolean) => { try { const store = useEditorStore.getState(), before = store.toSnapshot(); if (before.id !== project.id) return; const next = setPagesPresentationHidden(before, selected, hidden); if (next !== before) store.applyDesignEdit(before, next); setError(""); setMessage(t(hidden ? "editor.pages.hiddenResult" : "editor.pages.shownResult", { defaultValue: hidden ? "Selected pages are hidden in presentations" : "Selected pages are visible in presentations" })); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not change page visibility"); } };
  const button = "min-h-9 rounded-lg border border-white/20 px-3 text-xs text-white/75 disabled:opacity-35";
  return <div className="space-y-3">
    <input type="search" value={query} onChange={event => { setQuery(event.target.value); setOffset(0); }} aria-label={t("editor.pageManager.search", { defaultValue: "Find pages by name, number, or headline" })} placeholder={t("editor.pageManager.search", { defaultValue: "Find pages by name, number, or headline" })} className="min-h-9 w-full rounded-lg border border-white/20 bg-white/5 px-3 text-sm text-white" />
    <div className="flex flex-wrap items-center gap-2"><span className="text-xs text-white/60">{t("editor.pageManager.selected", { defaultValue: "{{count}} pages selected", count: selected.length })}</span><button type="button" className={button} onClick={() => setPicked(filtered.map(page => page.index))}>{t("editor.pageManager.selectMatches", { defaultValue: "Select matching pages" })}</button><button type="button" className={button} onClick={() => setPicked([])}>{t("editor.pageManager.clear", { defaultValue: "Clear selection" })}</button></div>
    <div className="flex flex-wrap gap-2">{(["duplicate", "delete", "first", "last"] as const).map(action => <button type="button" key={action} disabled={!selected.length || (action !== "duplicate" && selected.length >= pages.length)} onClick={() => apply(action)} className={`${button} ${action === "delete" ? "text-red-300" : ""}`}>{t(`editor.pageManager.action.${action}`, { defaultValue: ({ duplicate: "Duplicate selected", delete: "Delete selected", first: "Move to start", last: "Move to end" })[action] })}</button>)}</div>
    <div className="flex flex-wrap items-center gap-2"><button type="button" disabled={!selected.length} onClick={() => visibility(true)} className={button}>{t("editor.pages.hidePresentation", { defaultValue: "Hide in presentation" })}</button><button type="button" disabled={!selected.length} onClick={() => visibility(false)} className={button}>{t("editor.pages.showPresentation", { defaultValue: "Show in presentation" })}</button><span className="text-xs text-white/45">{t("editor.pages.visibilityHint", { defaultValue: "Hidden pages stay editable and remain available for downloads." })}</span></div>
    <PageLayerTransferControls />
    <PageRangeSelection count={pages.length} selected={selected} onChange={setPicked} />
    <PageDurationBatchControls projectId={projectId} selected={selected} />
    <PageSectionControls onSelectPages={indexes => { setPicked(indexes); setQuery(""); setOffset(Math.floor((indexes[0] ?? 0) / 12) * 12); }} projectId={projectId} selected={selected} />
    <PageNamingControls projectId={projectId} selected={selected} />
    <div className="flex flex-wrap items-center gap-2"><label className="text-xs text-white/65">{t("editor.pageManager.destination", { defaultValue: "Move before page" })}<input type="number" min={1} max={pages.length + 1} value={destination} onChange={event => setDestination(event.target.value)} className="ml-2 min-h-9 w-24 rounded-lg border border-white/20 bg-neutral-900 px-3 text-xs text-white" /></label><button type="button" className={button} disabled={!selected.length || !Number.isInteger(Number(destination)) || Number(destination) < 1 || Number(destination) > pages.length + 1 || selected.includes(Number(destination) - 1)} onClick={() => apply("before")}>{t("editor.pageManager.moveHere", { defaultValue: "Move selection" })}</button><span className="text-xs text-white/45">{t("editor.pageManager.endDestination", { defaultValue: "Use {{number}} to move to the end.", number: pages.length + 1 })}</span></div>
    <div className="flex flex-wrap items-center gap-3"><label className="flex min-h-9 items-center gap-2 text-xs text-white/65"><input type="checkbox" checked={previews} onChange={event => setPreviews(event.target.checked)} />{t("editor.pageManager.showPreviews", { defaultValue: "Show page previews" })}</label><button type="button" className={button} disabled={!previews || preview.loading} onClick={preview.refresh}>{t("editor.pageManager.refreshPreviews", { defaultValue: "Refresh previews" })}</button>{preview.failed && <span className="text-xs text-white/45">{t("editor.pageManager.previewFailed", { defaultValue: "Some previews are unavailable. Pages can still be opened." })}</span>}</div>
    <div className="grid gap-2 sm:grid-cols-2">{filtered.slice(first, first + 12).map(page => <div key={page.index} className={`flex items-center gap-2 rounded-lg border p-2 ${current.index === page.index ? "border-sky-400/70 bg-sky-400/5" : "border-white/15"}`}><label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3"><input type="checkbox" checked={selected.includes(page.index)} onChange={event => setPicked(previous => event.target.checked ? [...new Set([...previous, page.index])] : previous.filter(index => index !== page.index))} />{previews && <span className="flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded border border-white/10 bg-white/5">{preview.images[page.index] ? <img src={preview.images[page.index]} alt="" className="h-full w-full object-contain" /> : <span className="text-xs text-white/35">{page.index + 1}</span>}</span>}<span className="min-w-0"><span className="block truncate text-xs text-white/85">{page.index + 1}. {page.title || page.headline || t("editor.pages.page", { number: page.index + 1 })}</span><span className="block truncate text-[10px] text-white/45">{page.section ? `${page.section} · ` : ""}{Number((page.end - page.start).toFixed(2))}s{page.presentationHidden ? ` · ${t("editor.pages.hiddenBadge", { defaultValue: "Hidden in presentation" })}` : ""}{page.locked ? ` · ${t("editor.pageManager.locked", { defaultValue: "Contains locked layers" })}` : ""}{page.title && page.headline ? ` · ${page.headline}` : ""}</span></span></label><button type="button" onClick={() => { const store = useEditorStore.getState(); store.setIsPlaying(false); store.selectClip(null); store.setCurrentTime(page.start + Math.min(0.6, (page.end - page.start) / 2)); }} aria-label={t("editor.pageManager.openPage", { defaultValue: "Open page {{number}}", number: page.index + 1 })} className={button}>{t("editor.pageManager.open", { defaultValue: "Open" })}</button></div>)}</div>
    {!filtered.length && <p className="text-xs text-white/50">{t("editor.pages.noResults", { defaultValue: "No matching pages" })}</p>}
    {filtered.length > 12 && <div className="flex items-center gap-3"><button type="button" className={button} disabled={first === 0} onClick={() => setOffset(first - 12)}>{t("editor.pages.previousSet", { defaultValue: "Previous pages" })}</button><span className="text-xs text-white/45">{first + 1}–{Math.min(filtered.length, first + 12)} / {filtered.length}</span><button type="button" className={button} disabled={first + 12 >= filtered.length} onClick={() => setOffset(first + 12)}>{t("editor.pages.nextSet", { defaultValue: "Next pages" })}</button></div>}
    {message && <p role="status" className="text-xs text-white/60">{message}</p>}{error && <p role="alert" className="text-xs text-red-300">{error}</p>}
  </div>;
}
