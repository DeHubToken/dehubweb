import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useEditorStore } from "@/store/editorStore";
import { getPages, pageAt } from "@/lib/editor/pages";
import { pageDetails, setPageDetails } from "@/lib/editor/pageDetails";
import type { ProjectSnapshot } from "@/lib/editor/types";

function NotesDraft({ project, index, start }: { project: ProjectSnapshot; index: number; start: number }) {
  const { t } = useTranslation();
  const [original, setOriginal] = useState(() => pageDetails(project, index));
  const [title, setTitle] = useState(original.title), [notes, setNotes] = useState(original.notes);
  const [message, setMessage] = useState("");
  const save = () => {
    const store = useEditorStore.getState(), latest = store.toSnapshot(), current = pageDetails(latest, index);
    if (latest.id !== project.id || getPages(latest.settings, latest.clips)[index]?.start !== start || current.title !== original.title || current.notes !== original.notes) {
      setMessage(t("editor.notes.changed", { defaultValue: "This page changed. Reopen Notes before saving." })); return;
    }
    const next = setPageDetails(latest, index, { title, notes });
    store.applyDesignEdit(latest, next);
    setOriginal(pageDetails(next, index));
    setMessage(t("editor.notes.saved", { defaultValue: "Page notes saved" }));
  };
  return <div className="space-y-2">
    <label className="block text-xs text-white/65">{t("editor.notes.name", { defaultValue: "Page name" })}<input value={title} onChange={e => { setTitle(e.target.value); setMessage(""); }} maxLength={200} placeholder={t("editor.pages.page", { number: index + 1 })} className="mt-1 min-h-9 w-full rounded-lg border border-white/20 bg-white/5 px-3 text-sm text-white" /></label>
    <label className="block text-xs text-white/65">{t("editor.notes.presenter", { defaultValue: "Presenter notes" })}<textarea value={notes} onChange={e => { setNotes(e.target.value); setMessage(""); }} maxLength={10000} rows={3} className="mt-1 w-full resize-y rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white" /></label>
    <div className="flex items-center gap-3"><button type="button" onClick={save} className="min-h-9 rounded-lg bg-white px-3 text-xs font-medium text-black">{t("editor.notes.save", { defaultValue: "Save page notes" })}</button><span role="status" className="text-xs text-white/60">{message}</span></div>
    <p className="text-xs text-white/45">{t("editor.notes.hint", { defaultValue: "Names and notes are saved with this design. They do not appear in image, video, or PDF exports." })}</p>
  </div>;
}

export function PageNotesPanel() {
  const settings = useEditorStore(s => s.settings);
  const clips = useEditorStore(s => s.clips);
  const time = useEditorStore(s => s.currentTime);
  const project = useEditorStore.getState().toSnapshot();
  const page = pageAt(getPages(settings, clips), time);
  return <NotesDraft key={`${project.id}:${page.index}:${page.start}`} project={project} index={page.index} start={page.start} />;
}
