import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useEditorStore } from "@/store/editorStore";
import { askSceneAgent } from "@/lib/editor/agent";
import { transcribeClipWords } from "@/lib/editor/captions";
import { createHighlightEdit } from "@/lib/editor/applyHighlights";
import { findHighlights, highlightCaptionWords, sameHighlightSource, type HighlightRange } from "@/lib/editor/highlights";
import { shotTime } from "@/lib/editor/shots";
import type { MediaClip, ProjectSnapshot } from "@/lib/editor/types";

export function HighlightTools({ clip }: { clip: MediaClip }) {
  const { t } = useTranslation();
  const controller = useRef<AbortController | null>(null), source = useRef<ProjectSnapshot | null>(null);
  const previewEnd = useRef<number | null>(null);
  const [seconds, setSeconds] = useState(30), [focus, setFocus] = useState("");
  const [useCaptions, setUseCaptions] = useState(false), [progress, setProgress] = useState<string | null>(null);
  const [ranges, setRanges] = useState<HighlightRange[] | null>(null), [chosen, setChosen] = useState<number[]>([]), [applying, setApplying] = useState(false);
  const hasCaptions = useEditorStore(s => highlightCaptionWords(s.toSnapshot(), clip).length > 0);
  useEffect(() => { setRanges(null); setChosen([]); source.current = null; return () => controller.current?.abort(); }, [clip, seconds, focus, useCaptions]);
  useEffect(() => {
    const unsubscribe = useEditorStore.subscribe(state => {
      if (previewEnd.current !== null && state.currentTime >= previewEnd.current) {
        const end = previewEnd.current; previewEnd.current = null;
        state.setIsPlaying(false); state.setCurrentTime(end);
      }
    });
    return () => { unsubscribe(); if (previewEnd.current !== null) useEditorStore.getState().setIsPlaying(false); previewEnd.current = null; };
  }, []);
  const run = async () => {
    if (controller.current) return;
    const original = useEditorStore.getState().toSnapshot();
    const media = useEditorStore.getState().media.find(m => m.id === clip.mediaId);
    if (!media) { toast.error(t("common.somethingWentWrong")); return; }
    const abort = new AbortController(); controller.current = abort; source.current = original; setRanges(null); setProgress(t("common.loading"));
    useEditorStore.getState().setIsPlaying(false);
    try {
      const words = useCaptions ? highlightCaptionWords(original, clip) : await transcribeClipWords(clip, media.url, p => {
        const fraction = p.stage === "download" ? p.loaded / Math.max(1, p.total) : p.done / Math.max(1, p.total);
        setProgress(t(p.stage === "download" ? "editor.captions.downloading" : "editor.captions.working", { percent: Math.round(fraction * 100) }));
      }, abort.signal);
      if (abort.signal.aborted || !sameHighlightSource(original, useEditorStore.getState().toSnapshot())) return;
      setProgress(t("editor.highlights.ranking"));
      const result = await findHighlights(clip, words, { seconds, focus }, askSceneAgent, abort.signal);
      if (!abort.signal.aborted && sameHighlightSource(original, useEditorStore.getState().toSnapshot())) { setRanges(result); setChosen(result.map((_, i) => i)); }
    } catch (error) {
      if (!abort.signal.aborted) { console.warn("[editor] highlights failed", error); toast.error(t(error instanceof Error && error.message === "highlight_limit" ? "editor.highlights.limit" : "common.somethingWentWrong")); }
    } finally { if (controller.current === abort) { controller.current = null; setProgress(null); } }
  };
  const apply = async () => {
    if (!source.current || !ranges || applying) return;
    setApplying(true);
    try {
      if (!await createHighlightEdit(source.current, clip.id, ranges.filter((_, i) => chosen.includes(i)), t("editor.highlights.projectTitle", { title: source.current.title }))) toast.error(t("editor.highlights.changed"));
      else toast.success(t("editor.highlights.created"));
    } catch { toast.error(t("common.somethingWentWrong")); }
    finally { setApplying(false); }
  };
  return <div className="space-y-2 border-t border-white/10 pt-3">
    <p className="text-[11px] font-medium">{t("editor.highlights.title")}</p>
    <p className="text-[10px] text-white/60">{t("editor.highlights.privacy")}</p>
    <div className="grid grid-cols-3 gap-1">{[15, 30, 60].map(value => <Button key={value} size="sm" variant={seconds === value ? "secondary" : "ghost"} disabled={progress !== null} onClick={() => setSeconds(value)}>{value}s</Button>)}</div>
    <input className="h-8 w-full rounded border border-white/15 bg-transparent px-2 text-xs" maxLength={240} aria-label={t("editor.highlights.focus")} placeholder={t("editor.highlights.focus")} value={focus} disabled={progress !== null} onChange={event => setFocus(event.target.value)} />
    {hasCaptions && <label className="flex gap-2 text-xs"><input type="checkbox" checked={useCaptions} disabled={progress !== null} onChange={event => setUseCaptions(event.target.checked)} />{t("editor.highlights.useCaptions")}</label>}
    {hasCaptions && useCaptions && <p className="text-[10px] text-white/50">{t("editor.highlights.captionHint")}</p>}
    <Button size="sm" variant="ghost" className="w-full border border-white/10" disabled={progress !== null || applying || !!clip.locked || !!clip.hidden || clip.duration * (clip.speed ?? 1) > 600 || clip.duration < 1} onClick={() => void run()}>{t("editor.highlights.find")}</Button>
    {progress !== null && <div className="flex items-center justify-between gap-2"><span className="text-xs text-white/70">{progress}</span><Button size="sm" variant="ghost" onClick={() => controller.current?.abort()}>{t("common.cancel")}</Button></div>}
    {ranges && !ranges.length && <p className="text-xs text-white/70">{t("editor.highlights.none")}</p>}
    {!!ranges?.length && <><div className="max-h-64 space-y-2 overflow-auto">{ranges.map((range, i) => <div key={`${range.start}-${range.end}`} className="rounded border border-white/10 p-2">
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" aria-label={`${shotTime(range.start)}–${shotTime(range.end)}`} checked={chosen.includes(i)} onChange={event => setChosen(old => event.target.checked ? [...old, i] : old.filter(value => value !== i))} />{shotTime(range.start)}–{shotTime(range.end)}</label>
      <p className="mt-1 line-clamp-3 text-[11px] text-white/60">{range.text}</p>
      <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => { const s = useEditorStore.getState(); previewEnd.current = null; s.setCurrentTime(clip.start + range.start); previewEnd.current = clip.start + range.end; s.setIsPlaying(true); }}>{t("editor.shots.preview")}</Button>
    </div>)}</div><Button size="sm" className="w-full" disabled={!chosen.length || applying} onClick={() => void apply()}>{t("editor.highlights.create")} ({chosen.length})</Button></>}
  </div>;
}
