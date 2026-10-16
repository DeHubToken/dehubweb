import { useState } from "react";
import { useTranslation } from "react-i18next";
import { findDesignText, replaceDesignText } from "@/lib/editor/designTools";
import type { ProjectSnapshot } from "@/lib/editor/types";

export function DesignTextSearch({ project, apply, seek }: { project: ProjectSnapshot;
  apply: (operation: (p: ProjectSnapshot) => ProjectSnapshot) => void; seek: (id: string, time: number) => void }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const results = findDesignText(project, query, matchCase);
  const label = t("editor.designTools.find", { defaultValue: "Find text" });
  const input = "min-h-9 min-w-0 rounded-lg border border-white/20 bg-white/5 px-3 text-sm outline-none focus:border-white/60";
  return <div className="space-y-3">
    <div className="flex flex-wrap gap-2">
      <input aria-label={label} placeholder={label} value={query} onChange={e => setQuery(e.target.value)} className={input + " flex-1"} />
      <input aria-label={t("editor.designTools.replaceWith", { defaultValue: "Replace with" })} placeholder={t("editor.designTools.replaceWith", { defaultValue: "Replace with" })} value={replacement} onChange={e => setReplacement(e.target.value)} className={input + " flex-1"} />
      <label className="flex items-center gap-2 text-xs text-white/65"><input type="checkbox" checked={matchCase} onChange={e => setMatchCase(e.target.checked)} />{t("editor.designTools.matchCase", { defaultValue: "Match case" })}</label>
      <button type="button" disabled={!results.some(c => !c.locked)} onClick={() => apply(p => replaceDesignText(p, query, replacement, matchCase))} className="min-h-9 rounded-lg bg-white px-3 text-xs font-medium text-black disabled:opacity-35">{t("editor.designTools.replaceAll", { defaultValue: "Replace all" })}</button>
    </div>
    {query && <p role="status" className="text-xs text-white/55">{t("editor.designTools.matches", { defaultValue: "{{count}} text layers found", count: results.length })}</p>}
    <div className="flex flex-wrap gap-2">{results.map(clip => <div key={clip.id} className="flex max-w-full items-center rounded-lg border border-white/15">
      <button type="button" onClick={() => seek(clip.id, clip.start)} className="min-h-9 max-w-56 truncate px-3 text-left text-xs text-white/80">{clip.text}</button>
      <button type="button" disabled={clip.locked} onClick={() => apply(p => replaceDesignText(p, query, replacement, matchCase, [clip.id]))} className="min-h-9 border-l border-white/15 px-3 text-xs text-white/65 hover:bg-white/10 disabled:opacity-35">{t("editor.designTools.replace", { defaultValue: "Replace" })}</button>
    </div>)}</div>
  </div>;
}
