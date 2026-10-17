import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { designLayerChoices } from "@/lib/editor/layerChoices";
import type { ProjectSnapshot } from "@/lib/editor/types";

export function OverlapLayerPicker({ project, ids, selectedId, onSelect, onClose }: { project: Pick<ProjectSnapshot, "clips" | "tracks">; ids: string[]; selectedId: string | null; onSelect: (id: string) => void; onClose: () => void }) {
  const { t } = useTranslation(), [query, setQuery] = useState(""), [offset, setOffset] = useState(0);
  const choices = designLayerChoices(project, ids).filter(item => item.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const first = Math.min(offset, Math.max(0, Math.floor((choices.length - 1) / 20) * 20));
  const button = "min-h-9 rounded-lg border border-white/20 px-3 text-xs text-white/75 disabled:opacity-35";
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="border-white/15 bg-neutral-950 text-white sm:max-w-md"><DialogHeader><DialogTitle>{t("editor.layers.overlapping", { defaultValue: "Overlapping layers" })}</DialogTitle><DialogDescription className="text-white/55">{t("editor.layers.overlapHint", { defaultValue: "Choose the layer underneath. The frontmost layer appears first." })}</DialogDescription></DialogHeader>
    <input autoFocus type="search" value={query} onChange={event => { setQuery(event.target.value); setOffset(0); }} aria-label={t("editor.layers.searchOverlap", { defaultValue: "Search overlapping layers" })} placeholder={t("editor.layers.searchOverlap", { defaultValue: "Search overlapping layers" })} className="min-h-10 rounded-lg border border-white/20 bg-white/5 px-3 text-sm" />
    <div className="max-h-[50vh] space-y-1 overflow-y-auto">{choices.slice(first, first + 20).map(item => <button key={item.id} type="button" aria-pressed={selectedId === item.id} onClick={() => { onSelect(item.id); onClose(); }} className={`flex min-h-11 w-full items-center gap-3 rounded-lg border px-3 py-2 text-left ${selectedId === item.id ? "border-cyan-300 bg-cyan-300/10" : "border-white/10 hover:bg-white/5"}`}><span className="min-w-0 flex-1 truncate text-sm">{item.label}</span><span className="shrink-0 text-xs text-white/45">{t(`editor.layers.kind.${item.kind}`, { defaultValue: item.kind })}{item.grouped ? ` · ${t("editor.layers.grouped", { defaultValue: "Grouped" })}` : ""}</span></button>)}{!choices.length && <p className="py-4 text-center text-sm text-white/45">{t("editor.layers.noOverlapMatches", { defaultValue: "No matching layers at this position" })}</p>}</div>
    {choices.length > 20 && <div className="flex items-center justify-between gap-2"><button type="button" disabled={!first} className={button} onClick={() => setOffset(first - 20)}>{t("common.previous", { defaultValue: "Previous" })}</button><span className="text-xs text-white/45">{Math.floor(first / 20) + 1} / {Math.ceil(choices.length / 20)}</span><button type="button" disabled={first + 20 >= choices.length} className={button} onClick={() => setOffset(first + 20)}>{t("common.next", { defaultValue: "Next" })}</button></div>}
  </DialogContent></Dialog>;
}
