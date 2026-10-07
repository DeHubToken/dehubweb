import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useEditorStore } from "@/store/editorStore";
import { detectClipShots, splitShotClip } from "@/lib/editor/applyShotTool";
import { shotTime } from "@/lib/editor/shots";
import type { MediaClip } from "@/lib/editor/types";

export function ShotTools({ clip }: { clip: MediaClip }) {
  const { t } = useTranslation();
  const controller = useRef<AbortController | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [times, setTimes] = useState<number[] | null>(null), [chosen, setChosen] = useState<number[]>([]);
  useEffect(() => { setTimes(null); setChosen([]); return () => controller.current?.abort(); }, [clip]);
  const detect = async () => {
    if (controller.current) return;
    const abort = new AbortController(); controller.current = abort; setProgress(0); setTimes(null);
    useEditorStore.getState().setIsPlaying(false);
    try {
      const result = await detectClipShots(clip.id, abort.signal, setProgress);
      if (!abort.signal.aborted) { setTimes(result.analysis.times); setChosen(result.analysis.times); }
    } catch (error) { if (!abort.signal.aborted) { console.warn("[editor] scene analysis failed", error); toast.error(t("common.somethingWentWrong")); } }
    finally { if (controller.current === abort) { controller.current = null; setProgress(null); } }
  };
  return <div className="space-y-2 pt-2">
    <Button size="sm" variant="ghost" className="h-8 w-full border border-white/10 text-[11px]" disabled={progress !== null || !!clip.locked || !!clip.hidden || clip.duration > 600 || clip.duration < 0.8} onClick={() => void detect()}>{t("editor.shots.detect")}</Button>
    <p className="text-[10px] text-white/50">{t("editor.shots.hint")}</p>
    {progress !== null && <div className="flex items-center justify-between"><span className="text-xs text-white/70">{t("common.loading")} {Math.round(progress * 100)}%</span><Button variant="ghost" size="sm" onClick={() => controller.current?.abort()}>{t("common.cancel")}</Button></div>}
    {times && !times.length && <p className="text-xs text-white/70">{t("editor.shots.none")}</p>}
    {!!times?.length && <><div className="grid max-h-48 grid-cols-2 gap-1 overflow-auto">{times.map(at => <label key={at} className="flex items-center gap-1.5 rounded border border-white/10 px-2"><input type="checkbox" aria-label={shotTime(at)} checked={chosen.includes(at)} onChange={event => setChosen(old => event.target.checked ? [...old, at].sort((a,b) => a-b) : old.filter(time => time !== at))} /><button type="button" className="py-1 text-[11px] tabular-nums text-white/80" onClick={() => { const s = useEditorStore.getState(); s.setIsPlaying(false); s.setCurrentTime(clip.start + at); }}>{shotTime(at)}</button></label>)}</div><Button size="sm" className="w-full" disabled={!chosen.length || !!clip.locked} onClick={() => void splitShotClip(clip, chosen).then(ok => { if (!ok) toast.error(t("common.somethingWentWrong")); })}>{t("editor.shots.split")} ({chosen.length})</Button></>}
  </div>;
}
