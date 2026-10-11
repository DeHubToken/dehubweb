import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useEditorStore } from "@/store/editorStore";
import { applyCaptionText, captionTime, type CaptionTextPlan } from "@/lib/editor/captionText";
import { useCaptionTextEditor } from "@/lib/editor/useCaptionTextEditor";

export function CaptionTextEditor({ disabled }: { disabled: boolean }) {
  const { t } = useTranslation();
  const clips = useEditorStore(state => state.clips), tracks = useEditorStore(state => state.tracks);
  const editing = useEditorStore(state => state.editing);
  const apply = async (plan: CaptionTextPlan) => {
    const state = useEditorStore.getState();
    if (state.editing || !state.isHistorySettled()) return false;
    const next = applyCaptionText(state, plan);
    if (next !== state) await state.runAsOneStep(() => { useEditorStore.setState({ clips: next.clips }); });
    return true;
  };
  const editor = useCaptionTextEditor({ clips, tracks }, disabled || editing, apply, clip => {
    const state = useEditorStore.getState(); state.setIsPlaying(false); state.setCurrentTime(clip.start); state.selectClip(clip.id);
  });
  const field = "w-full rounded border border-white/10 bg-black p-2 text-xs text-white";
  return <details className="border-t border-white/10 pt-3">
    <summary className="cursor-pointer text-[11px] font-semibold text-white/70">{t("editor.captions.textPanel", { defaultValue: "Edit captions" })} · {editor.captions.length}</summary>
    <div className="mt-3 space-y-2">
      <input aria-label={t("editor.captions.findText", { defaultValue: "Find in captions" })} placeholder={t("editor.captions.findText", { defaultValue: "Find in captions" })} value={editor.query} maxLength={20000} disabled={editor.blocked} onChange={event => editor.setQuery(event.target.value)} className={field} />
      <input aria-label={t("editor.captions.replaceText", { defaultValue: "Replace with" })} placeholder={t("editor.captions.replaceText", { defaultValue: "Replace with" })} value={editor.replacement} maxLength={20000} disabled={editor.blocked} onChange={event => editor.setReplacement(event.target.value)} className={field} />
      <label className="flex items-center gap-2 text-[11px] text-white/70"><input type="checkbox" checked={editor.matchCase} disabled={editor.blocked} onChange={event => editor.setMatchCase(event.target.checked)} />{t("editor.captions.matchCase", { defaultValue: "Match case" })}</label>
      <Button size="sm" variant="ghost" disabled={editor.blocked || !editor.replaceCount} onClick={editor.replace} className="h-8 w-full border border-white/10 text-[11px]">{t("editor.captions.replaceCount", { defaultValue: "Replace in {{total}} captions", total: editor.replaceCount })}</Button>
      {editor.rows.map(clip => <button key={clip.id} type="button" disabled={editor.blocked} onClick={() => editor.choose(clip)} className="block w-full rounded border border-white/10 p-2 text-start text-[11px] text-white/80">
        <span className="block tabular-nums text-white/40">{captionTime(clip.start)} – {captionTime(clip.start + clip.duration)}</span>
        <span className="line-clamp-2 whitespace-pre-wrap break-words">{clip.text || t("editor.captions.emptyText", { defaultValue: "Empty caption" })}</span>
      </button>)}
      {!editor.filtered.length && <p className="text-[11px] text-white/50">{t("editor.captions.noTextMatches", { defaultValue: "No editable captions match. Import captions or change your search." })}</p>}
      {editor.pages > 1 && <div className="flex items-center justify-between text-[11px] text-white/60">
        <Button size="sm" variant="ghost" disabled={editor.blocked || !editor.page} onClick={() => editor.setPage(editor.page - 1)}>{t("editor.captions.previousText", { defaultValue: "Previous" })}</Button>
        <span>{editor.page + 1} / {editor.pages}</span>
        <Button size="sm" variant="ghost" disabled={editor.blocked || editor.page + 1 >= editor.pages} onClick={() => editor.setPage(editor.page + 1)}>{t("editor.captions.nextText", { defaultValue: "Next" })}</Button>
      </div>}
      {editor.draft && <div className="space-y-2 border-t border-white/10 pt-2">
        <textarea aria-label={t("editor.captions.captionText", { defaultValue: "Caption text" })} value={editor.draft.text} maxLength={20000} rows={3} disabled={editor.blocked} onChange={event => editor.edit(event.target.value)} className={field} />
        {editor.stale && <p role="status" className="text-[11px] text-white/60">{t("editor.captions.textChanged", { defaultValue: "Captions changed. Reload the line before saving." })}</p>}
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="ghost" disabled={!editor.canSave} onClick={editor.save}>{t("editor.captions.saveText", { defaultValue: "Save caption" })}</Button>
          {editor.stale && <Button size="sm" variant="ghost" disabled={editor.blocked} onClick={editor.reload}>{t("editor.captions.reloadText", { defaultValue: "Reload caption" })}</Button>}
          <Button size="sm" variant="ghost" disabled={editor.blocked} onClick={editor.close}>{t("common.cancel")}</Button>
        </div>
      </div>}
      {editor.status && <p role="status" className="text-[11px] text-white/60">{t(`editor.captions.${editor.status}`, { defaultValue: editor.status === "textSaved" ? "Caption changes saved." : "Captions changed. Reload the line before saving." })}</p>}
    </div>
  </details>;
}
