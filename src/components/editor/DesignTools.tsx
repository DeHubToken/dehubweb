import { DesignToolSearch } from "./DesignToolSearch";
import { DocumentElementsPanel } from "./DocumentElementsPanel";
import { PagesManagerPanel } from "./PagesManagerPanel";
import { ResizeDesignPanel } from "./ResizeDesignPanel";
import { DESIGN_PANEL_NAMES, designSelectionAction } from "@/lib/editor/designPanels";
import { VectorSymbolsPanel } from "./VectorSymbolsPanel";
import { DesignClipboardControls } from "./DesignClipboardControls";
import { ConnectorsPanel } from "./ConnectorsPanel";
import { PageAnimationPanel } from "./PageAnimationPanel";
import { BulkCreatePanel } from "./BulkCreatePanel";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Paintbrush, Palette, Scaling, Search, Plus } from "lucide-react";
import { useEditorStore } from "@/store/editorStore";
import type { ProjectSnapshot } from "@/lib/editor/types";
import { applyDesignPalette, applyDesignStyle, copyDesignStyle, designColours, DESIGN_PALETTES, replaceDesignColour, type DesignStyle } from "@/lib/editor/designTools";
import { DesignTextSearch } from "./DesignTextSearch";
import { DataVisualPanel } from "./DataVisualPanel";
import { FillPanel } from "./FillPanel";
import { QrPanel } from "./QrPanel";
import { TextCompositionsPanel } from "./TextCompositionsPanel";
import { PhotoGridPanel } from "./PhotoGridPanel";
import { DesignLayoutPanel } from "./DesignLayoutPanel";
import { DesignLinkPanel } from "./DesignLinkPanel";
import { PageNotesPanel } from "./PageNotesPanel";
import { GuidesPanel } from "./GuidesPanel";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useCloseOnSurfaceSwitch, useSurfaceEpoch } from "@/hooks/use-surface-switch";
import { useEditorDraftFocus } from "./useEditorDraftFocus";

/** Contextual design actions stay within reach while the canvas remains visible. */
export function DesignTools() {
  const draftFocus = useEditorDraftFocus("design-tools", false);
  const finishDraft = useRef(draftFocus.finish); finishDraft.current = draftFocus.finish;
  const { t } = useTranslation();
  const clips = useEditorStore(s => s.clips);
  const ids = useEditorStore(s => s.selectedClipIds);
  const settings = useEditorStore(s => s.settings);
  const projectId = useEditorStore(s => s.projectId);
  const [clipboard, setClipboard] = useState<{ projectId: string; style: DesignStyle } | null>(null);
  const [panel, setPanel] = useState<"colours" | "resize" | "search" | "data" | "fill" | "qr" | "grid" | "guides" | "layout" | "notes" | "link" | "compositions" | "bulk" | "animate" | "connectors" | "symbols" | "pages" | "document" | null>(null);
  const [insertOpen, setInsertOpen] = useState(false);
  const surfaceEpoch = useSurfaceEpoch();
  useCloseOnSurfaceSwitch(useCallback(() => { setInsertOpen(false); setPanel(null); finishDraft.current(); }, []));
  const [colour, setColour] = useState<string | null>(null);
  const [replacement, setReplacement] = useState("#ffffff");
  const style = clipboard?.projectId === projectId ? clipboard.style : null;
  const selected = clips.filter(c => ids.includes(c.id) && c.kind !== "audio");
  const contextual = selected.length === 1 ? designSelectionAction(selected[0]) : null;
  const panelTitle = panel ? t(`editor.designTools.panel.${panel}`, { defaultValue: DESIGN_PANEL_NAMES[panel] }) : "";
  const editSelected = () => {
    if (!contextual || selected.length !== 1 || selected[0].locked) return;
    draftFocus.finish();
    if (contextual.panel) { setPanel(contextual.panel); return; }
    setPanel(null);
    if (contextual.edit === "text" || contextual.edit === "crop") window.dispatchEvent(new CustomEvent(contextual.edit === "text" ? "editor:edit-text" : "editor:crop-photo", { detail: { id: selected[0].id } }));
    else window.dispatchEvent(new Event("editor:open-inspector"));
  };
  const copy = () => {
    if (selected.length !== 1) return;
    const value = copyDesignStyle(selected[0]);
    if (value) setClipboard({ projectId, style: value });
  };
  const apply = (operation: (project: ProjectSnapshot) => ProjectSnapshot) => {
    const store = useEditorStore.getState();
    const before = store.toSnapshot(), next = operation(before);
    if (next === before) return;
    store.applyDesignEdit(before, next);
  };
  const button = "flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs text-white/80 transition hover:bg-white/10 disabled:opacity-35 disabled:hover:bg-transparent";
  return <div {...draftFocus.props} className="relative z-10 shrink-0 border-b border-white/10 bg-neutral-950/95">
    <div role="toolbar" aria-label={t("editor.designTools.toolbar", { defaultValue: "Design tools" })} className="flex min-h-11 items-center gap-1 overflow-x-auto px-2">
      <DesignToolSearch onChoose={id => { draftFocus.finish(); useEditorStore.getState().setIsPlaying(false); setInsertOpen(false); setPanel(id); }} />
      <DropdownMenu key={surfaceEpoch} open={insertOpen} onOpenChange={setInsertOpen}>
        <DropdownMenuTrigger asChild><button type="button" className={button + " bg-white/10 font-medium"}><Plus size={15} />{t("editor.designTools.insert", { defaultValue: "Insert" })}</button></DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="border-white/15 bg-neutral-950 text-white">
          <DropdownMenuItem onSelect={() => setPanel("document")}>{t("editor.document.title", { defaultValue: "Page numbers and repeated elements" })}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setPanel("symbols")}>{t("editor.symbols.title", { defaultValue: "Vector symbols" })}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setPanel("connectors")}>{t("editor.connectors.title", { defaultValue: "Lines and connectors" })}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setPanel("bulk")}>{t("editor.bulk.title", { defaultValue: "Bulk create" })}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setPanel("data")}>{t("editor.dataVisual.title", { defaultValue: "Charts and tables" })}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setPanel("fill")}>{t("editor.fills.heading", { defaultValue: "Fills and backgrounds" })}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setPanel("guides")}>{t("editor.guides.title", { defaultValue: "Guides and margins" })}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setPanel("compositions")}>{t("editor.compositions.title", { defaultValue: "Text combinations" })}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setPanel("grid")}>{t("editor.grids.title", { defaultValue: "Photo grids" })}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setPanel("qr")}>{t("editor.qr.title", { defaultValue: "QR code" })}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <button type="button" className={button} aria-expanded={panel === "resize"} onClick={() => setPanel(panel === "resize" ? null : "resize")}><Scaling size={15} />{t("editor.designTools.resize", { defaultValue: "Resize" })}<span className="hidden text-white/40 xl:inline">{settings.width} × {settings.height}</span></button>
      <button type="button" className={button} aria-expanded={panel === "colours"} onClick={() => setPanel(panel === "colours" ? null : "colours")}><Palette size={15} />{t("editor.designTools.colours", { defaultValue: "Document colours" })}</button>
      <button type="button" className={button} aria-expanded={panel === "layout"} onClick={() => setPanel(panel === "layout" ? null : "layout")}>{t("editor.layout.title", { defaultValue: "Position and spacing" })}</button>
      <span className="mx-1 h-4 w-px shrink-0 bg-white/15" />
      {contextual && <button type="button" disabled={selected[0].locked} onClick={editSelected} className={button + " bg-white/10 font-medium"}>{t(`editor.selectionAction.${contextual.id}`, { defaultValue: contextual.label })}</button>}
      <DesignClipboardControls />
      <button type="button" className={button} disabled={selected.length !== 1} onClick={copy}><Copy size={15} />{t("editor.designTools.copyStyle", { defaultValue: "Copy style" })}</button>
      <button type="button" className={button} disabled={!style || !selected.some(c => !c.locked)} onClick={() => style && apply(p => applyDesignStyle(p, ids, style))}><Paintbrush size={15} />{t("editor.designTools.pasteStyle", { defaultValue: "Paste style" })}</button>
      <button type="button" className={button} aria-expanded={panel === "search"} onClick={() => setPanel(panel === "search" ? null : "search")}><Search size={15} />{t("editor.designTools.findReplace", { defaultValue: "Find and replace" })}</button>
      <button type="button" className={button} aria-expanded={panel === "animate"} onClick={() => setPanel(panel === "animate" ? null : "animate")}>{t("editor.pageAnimation.title", { defaultValue: "Animate page" })}</button>
      <button type="button" className={button} aria-expanded={panel === "pages"} onClick={() => { useEditorStore.getState().setIsPlaying(false); setPanel(panel === "pages" ? null : "pages"); }}>{t("editor.pageManager.title", { defaultValue: "Manage pages" })}</button>
      <button type="button" className={button} aria-expanded={panel === "notes"} onClick={() => setPanel(panel === "notes" ? null : "notes")}>{t("editor.notes.title", { defaultValue: "Page notes" })}</button>
      <button type="button" className={button} disabled={!selected.length} aria-expanded={panel === "link"} onClick={() => setPanel(panel === "link" ? null : "link")}>{t("editor.links.title", { defaultValue: "Link" })}</button>
      {style && <span role="status" className="sr-only">{t("editor.designTools.styleReady", { defaultValue: "Style ready to apply" })}</span>}
      {selected.length > 1 && <button type="button" className={button} onClick={() => useEditorStore.getState().groupSelected()}>{t("editor.groups.group", { defaultValue: "Group" })}</button>}
      {selected.some(c => c.groupId) && <button type="button" className={button} onClick={() => useEditorStore.getState().ungroupSelected()}>{t("editor.groups.ungroup", { defaultValue: "Ungroup" })}</button>}
    </div>
    {panel && <section aria-label={panelTitle} className="max-h-64 overflow-y-auto border-t border-white/10 p-3">
      <header className="sticky -top-3 z-10 -mx-3 -mt-3 mb-3 flex items-center justify-between gap-3 border-b border-white/10 bg-neutral-950 px-3 py-2"><h3 className="text-xs font-medium text-white/75">{panelTitle}</h3><button type="button" onClick={() => { draftFocus.finish(); setPanel(null); }} className="min-h-8 rounded-lg px-3 text-xs text-white/50 hover:bg-white/10">{t("editor.designTools.closePanel", { defaultValue: "Close panel" })}</button></header>
      {panel === "document" ? <DocumentElementsPanel key={projectId} /> : panel === "pages" ? <PagesManagerPanel key={projectId} /> : panel === "symbols" ? <VectorSymbolsPanel key={projectId} /> : panel === "connectors" ? <ConnectorsPanel key={projectId} /> : panel === "animate" ? <PageAnimationPanel key={projectId} /> : panel === "bulk" ? <BulkCreatePanel key={projectId} /> : panel === "compositions" ? <TextCompositionsPanel /> : panel === "link" ? <DesignLinkPanel /> : panel === "notes" ? <PageNotesPanel /> : panel === "layout" ? <DesignLayoutPanel /> : panel === "guides" ? <GuidesPanel /> : panel === "grid" ? <PhotoGridPanel /> : panel === "qr" ? <QrPanel /> : panel === "fill" ? <FillPanel /> : panel === "data" ? <DataVisualPanel /> : panel === "search" ? <DesignTextSearch project={useEditorStore.getState().toSnapshot()} apply={apply} seek={(id, time) => { const s = useEditorStore.getState(); s.setIsPlaying(false); s.setCurrentTime(time + 0.01); s.selectClip(id); }} /> : panel === "resize" ? <ResizeDesignPanel key={projectId} /> : <div className="space-y-3">
        <p className="text-xs text-white/55">{t("editor.designTools.colourHint", { defaultValue: "Choose a colour to replace across this design. Locked layers are preserved." })}</p>
        <div className="flex flex-wrap gap-2">{designColours(useEditorStore.getState().toSnapshot()).map(value => <button key={value} type="button" aria-label={value} aria-pressed={colour === value} onClick={() => { setColour(value); setReplacement(value); }} className={`h-8 w-8 rounded-full border-2 ${colour === value ? "border-white ring-2 ring-sky-400" : "border-white/25"}`} style={{ background: value }} />)}</div>
        {colour && <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-white/65">{colour} →</span>
          <input type="color" value={replacement} onChange={e => setReplacement(e.target.value)} aria-label={t("editor.designTools.replacement", { defaultValue: "Replacement colour" })} className="h-8 w-12 cursor-pointer rounded bg-transparent" />
          <button type="button" disabled={colour === replacement} className="min-h-9 rounded-lg bg-white px-3 text-xs font-medium text-black disabled:opacity-40" onClick={() => { apply(p => replaceDesignColour(p, colour, replacement)); setColour(replacement); }}>{t("editor.designTools.changeAll", { defaultValue: "Change all" })}</button>
        </div>}
        <div className="flex flex-wrap gap-2">{DESIGN_PALETTES.map(palette => <button type="button" key={palette.id} onClick={() => apply(p => applyDesignPalette(p, palette.colours))} className="flex min-h-10 items-center gap-2 rounded-lg border border-white/15 px-3 text-xs hover:bg-white/10">
          <span className="flex overflow-hidden rounded">{palette.colours.map(value => <span key={value} className="h-5 w-4" style={{ background: value }} />)}</span>{t(`editor.designTools.palette.${palette.id}`, { defaultValue: palette.label })}
        </button>)}</div>
      </div>}
    </section>}
  </div>;
}
