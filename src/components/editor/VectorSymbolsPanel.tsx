import { useEditorLibrary } from "@/lib/editor/useEditorLibrary";
import { ColourPickerButton } from "./ColourPickerButton";
import { useEffect, useMemo, useState } from "react";
import { nanoid } from "nanoid";
import { useTranslation } from "react-i18next";
import { useEditorStore } from "@/store/editorStore";
import { VECTOR_SYMBOLS, putVectorSymbol, searchVectorSymbols, vectorSymbolSvg } from "@/lib/editor/vectorSymbols";

const CATEGORY_NAMES: Record<string, string> = { all: "All", saved: "Saved", recent: "Recent", essentials: "Essentials", communication: "Communication", media: "Media and games", people: "People", objects: "Objects", nature: "Nature", commerce: "Commerce", learning: "Learning", travel: "Travel", technology: "Technology", food: "Food and drink" };

export function VectorSymbolsPanel() {
  const { t } = useTranslation();
  const library = useEditorLibrary("symbols");
  const clips = useEditorStore(s => s.clips), ids = useEditorStore(s => s.selectedClipIds);
  const selected = clips.find(clip => ids.length === 1 && clip.id === ids[0]);
  const existing = selected?.kind === "shape" && selected.symbol ? selected : undefined;
  const [symbol, setSymbol] = useState("check-circle"), [query, setQuery] = useState(""), [category, setCategory] = useState("all"), [page, setPage] = useState(0);
  const [colour, setColour] = useState("#ffffff"), [weight, setWeight] = useState(8);
  useEffect(() => { if (existing) { setSymbol(existing.symbol!); setColour(existing.stroke?.color ?? "#ffffff"); setWeight(existing.stroke?.width ?? 8); } }, [existing?.id, existing?.symbol, existing?.stroke]);
  const matches = useMemo(() => searchVectorSymbols(query, category === "saved" || category === "recent" ? "all" : category)
    .filter(item => category !== "saved" && category !== "recent" || library[category].includes(item.id))
    .sort((a, b) => category === "recent" ? library.recent.indexOf(a.id) - library.recent.indexOf(b.id) : 0), [query, category, library.saved, library.recent]);
  const index = Math.min(page, Math.max(0, Math.ceil(matches.length / 24) - 1)), chosen = VECTOR_SYMBOLS.find(item => item.id === symbol);
  const button = "min-h-9 rounded-lg border border-white/20 px-3 text-xs text-white/75 disabled:opacity-35";
  return <div className="space-y-3">
    <ColourPickerButton projectId={useEditorStore.getState().projectId} onPick={setColour} />
    <input value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} type="search" aria-label={t("editor.symbols.search", { defaultValue: "Search vector symbols" })} placeholder={t("editor.symbols.search", { defaultValue: "Search vector symbols" })} className="min-h-9 w-full rounded-lg border border-white/20 bg-white/5 px-3 text-sm text-white" />
    <div className="flex flex-wrap gap-2">{Object.entries(CATEGORY_NAMES).map(([value, label]) => <button key={value} type="button" aria-pressed={category === value} onClick={() => { setCategory(value); setPage(0); }} className={`${button} ${category === value ? "border-white bg-white/15" : ""}`}>{t(`editor.symbols.category.${value}`, { defaultValue: label })}</button>)}</div>
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">{matches.slice(index * 24, index * 24 + 24).map(item => <button key={item.id} type="button" aria-pressed={symbol === item.id} title={t(`editor.symbols.item.${item.id}`, { defaultValue: item.label })} onClick={() => setSymbol(item.id)} className={`flex min-h-20 flex-col items-center justify-center gap-2 rounded-lg border p-2 text-white ${symbol === item.id ? "border-white bg-white/15" : "border-white/10 hover:bg-white/5"}`}><svg aria-hidden viewBox="-1 -1 26 26" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round"><path d={vectorSymbolSvg(item.id)} /></svg><span className="w-full truncate text-[10px]">{t(`editor.symbols.item.${item.id}`, { defaultValue: item.label })}</span></button>)}</div>
    {!matches.length && <p className="text-xs text-white/50">{t("editor.symbols.noResults", { defaultValue: "No matching symbols. Try another name or category." })}</p>}
    {matches.length > 24 && <div className="flex items-center gap-3"><button type="button" className={button} disabled={index === 0} onClick={() => setPage(index - 1)}>{t("editor.symbols.previous", { defaultValue: "Previous symbols" })}</button><span className="text-xs text-white/50">{index + 1} / {Math.ceil(matches.length / 24)}</span><button type="button" className={button} disabled={(index + 1) * 24 >= matches.length} onClick={() => setPage(index + 1)}>{t("editor.symbols.next", { defaultValue: "Next symbols" })}</button></div>}
    <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-3"><svg aria-hidden viewBox="-1 -1 26 26" className="h-10 w-10 shrink-0" fill="none" stroke={colour} strokeWidth={Math.max(0.5, weight / 6)} strokeLinecap="round" strokeLinejoin="round"><path d={vectorSymbolSvg(symbol)} /></svg><span className="text-xs text-white/75">{chosen && t(`editor.symbols.item.${chosen.id}`, { defaultValue: chosen.label })}</span><label className="flex items-center gap-2 text-xs text-white/60">{t("editor.symbols.colour", { defaultValue: "Colour" })}<input type="color" value={colour} onChange={event => setColour(event.target.value)} className="h-8 w-12 bg-transparent" /></label><label className="flex items-center gap-2 text-xs text-white/60">{t("editor.symbols.weight", { defaultValue: "Line weight" })}<input type="range" min={1} max={40} value={weight} onChange={event => setWeight(Number(event.target.value))} />{weight}</label></div>
    <button type="button" aria-pressed={library.saved.includes(symbol)} onClick={() => library.toggle(symbol)} className={button}>{t(library.saved.includes(symbol) ? "editor.symbols.unsave" : "editor.symbols.save", { defaultValue: library.saved.includes(symbol) ? "Remove from saved symbols" : "Save symbol" })}</button>
    <button type="button" disabled={!!existing?.locked} onClick={() => { const store = useEditorStore.getState(), before = store.toSnapshot(); const result = putVectorSymbol(before, store.currentTime, symbol, colour, weight, () => nanoid(10), existing?.id); if (result && store.applyDesignEdit(before, result.project)) { library.record(symbol); store.selectClip(result.id); } }} className="min-h-9 rounded-lg bg-white px-3 text-xs font-medium text-black disabled:opacity-35">{t(existing ? "editor.symbols.update" : "editor.symbols.insert", { defaultValue: existing ? "Update symbol" : "Insert symbol" })}</button>
    <p className="text-xs text-white/45">{t("editor.symbols.hint", { defaultValue: "Symbols stay editable. Recolour, resize, rotate, group, or add effects using the layer controls." })}</p>
  </div>;
}
