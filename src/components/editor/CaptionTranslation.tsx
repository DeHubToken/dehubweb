import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SUPPORTED_LANGUAGES } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { useEditorStore } from "@/store/editorStore";
import { applyCaptionTranslation, captionTranslationKey, planCaptionTranslation, translateCaptionPlan } from "@/lib/editor/captionTranslation";
import { subtitleClips } from "@/lib/editor/subtitles";
import type { ProjectEditLease } from "@/lib/editor/projectEditGate";
import { EditorError } from "@/lib/editor/editorError";

export function CaptionTranslation({ disabled, onBusyChange }: { disabled: boolean; onBusyChange: (busy: boolean) => void }) {
  const { t, i18n } = useTranslation();
  const [language, setLanguage] = useState(() => SUPPORTED_LANGUAGES.find(item => item.code === i18n.language?.split(/[-_]/)[0])?.code ?? "en");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const active = useRef<{ controller: AbortController; lease: ProjectEditLease; sourceKey: string; projectId: string; applying: boolean } | null>(null);
  const mounted = useRef(true);
  const clips = useEditorStore(state => state.clips), tracks = useEditorStore(state => state.tracks);
  const captions = subtitleClips(clips, tracks);
  const count = captions.filter(clip => !clip.locked && clip.text.trim()).length;
  const cancel = () => {
    const job = active.current;
    if (!job) return;
    active.current = null;
    job.controller.abort(); job.lease.release();
    if (mounted.current) { setProgress(null); onBusyChange(false); }
  };
  useEffect(() => {
    mounted.current = true;
    const unsubscribe = useEditorStore.subscribe(state => {
      const job = active.current;
      if (job && !job.applying && (!job.lease.isCurrent() || state.projectId !== job.projectId || captionTranslationKey(state) !== job.sourceKey)) cancel();
    });
    return () => { mounted.current = false; unsubscribe(); cancel(); };
  }, []);
  const start = async () => {
    const state = useEditorStore.getState();
    if (disabled || active.current || !count || !state.isHistorySettled() || state.editing) return;
    let plan;
    try { plan = planCaptionTranslation(state); }
    catch { toast.error(t("editor.captions.translationFailed", { defaultValue: "Caption translation failed. Your captions are unchanged." })); return; }
    const controller = new AbortController(), lease = state.holdEdits();
    const job = { controller, lease, sourceKey: plan.sourceKey, projectId: state.projectId, applying: false };
    active.current = job; onBusyChange(true); setProgress({ done: 0, total: plan.cues.length });
    try {
      const updates = await translateCaptionPlan(plan, language, {
        signal: controller.signal,
        translate: async (text, targetLang) => {
          const { data, error } = await supabase.functions.invoke("translate-text", { body: { text, targetLang, public: false } });
          if (error) throw new EditorError("copy.619a45e92146", "Caption translation unavailable");
          return data?.translatedText;
        },
        onProgress: (done, total) => { if (active.current === job) setProgress({ done, total }); },
      });
      const current = useEditorStore.getState();
      if (active.current !== job || controller.signal.aborted || !lease.isCurrent() || current.projectId !== job.projectId || !current.isHistorySettled()) return;
      const next = applyCaptionTranslation(current, plan, updates);
      job.applying = true;
      if (next !== current) await current.runAsOneStep(() => { useEditorStore.setState({ clips: next.clips }); });
      if (mounted.current) toast.success(t("editor.captions.translationDone", { defaultValue: "Translated {{count}} captions", count: updates.length }));
    } catch {
      if (active.current === job && !controller.signal.aborted) toast.error(t("editor.captions.translationFailed", { defaultValue: "Caption translation failed. Your captions are unchanged." }));
    } finally {
      lease.release();
      if (active.current === job) { active.current = null; if (mounted.current) { setProgress(null); onBusyChange(false); } }
    }
  };
  return <div className="space-y-2 border-t border-white/10 pt-3">
    <label className="block text-[11px] text-white/70">
      {t("editor.captions.targetLanguage", { defaultValue: "Caption language" })}
      <select aria-label={t("editor.captions.targetLanguage", { defaultValue: "Caption language" })} value={language} disabled={disabled || !!progress} onChange={event => setLanguage(event.target.value)} className="mt-1 h-8 w-full rounded border border-white/10 bg-black px-2 text-xs text-white">
        {SUPPORTED_LANGUAGES.map(item => <option key={item.code} value={item.code}>{item.nativeName} · {item.name}</option>)}
      </select>
    </label>
    <Button size="sm" variant="ghost" disabled={disabled || !count || !!progress} onClick={() => { void start(); }} className="h-8 w-full border border-white/10 text-[11px]">
      {t("editor.captions.translateCount", { defaultValue: "Translate {{count}} captions", count })}
    </Button>
    {captions.some(clip => clip.locked) && <p className="text-[10px] text-white/50">{t("editor.captions.lockedTranslation", { defaultValue: "Unlock locked captions to include them." })}</p>}
    {progress && <div className="flex items-center justify-between gap-2">
      <span role="status" className="text-[11px] text-white/70">{progress.done} / {progress.total}</span>
      <Button size="sm" variant="ghost" onClick={cancel} className="h-7 text-[11px]">{t("common.cancel")}</Button>
    </div>}
  </div>;
}
