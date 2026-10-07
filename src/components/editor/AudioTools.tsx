import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useEditorQuota } from "@/hooks/use-editor-quota";
import { applyAudioTool } from "@/lib/editor/applyAudioTool";
import { AUDIO_TOOL_MODES, type AudioToolMode } from "@/lib/editor/audioTools";
import { applyBeatTool } from "@/lib/editor/applyBeatTool";
import type { MediaClip } from "@/lib/editor/types";

export function AudioTools({ clip }: { clip: MediaClip }) {
  const { t } = useTranslation();
  const quota = useEditorQuota();
  const controller = useRef<AbortController | null>(null);
  const [mode, setMode] = useState<AudioToolMode | "beats" | null>(null);
  const [progress, setProgress] = useState(0);
  useEffect(() => () => controller.current?.abort(), [clip.id]);
  const run = async (next: AudioToolMode) => {
    if (controller.current || clip.locked) return;
    const abort = new AbortController(); controller.current = abort; setMode(next); setProgress(0);
    try {
      const ok = await applyAudioTool(clip.id, next, { wallet: quota.walletAddress }, abort.signal, setProgress);
      if (!abort.signal.aborted) toast[ok ? "success" : "error"](t(ok ? "editor.audioTools.done" : "editor.audioTools.failed"));
    } catch { if (!abort.signal.aborted) toast.error(t("editor.audioTools.failed")); }
    finally { if (controller.current === abort) controller.current = null; setMode(null); }
  };
  const runBeats = async (align: boolean) => {
    if (controller.current || clip.locked) return;
    const abort = new AbortController(); controller.current = abort; setMode("beats"); setProgress(0);
    try {
      const result = await applyBeatTool(clip.id, align, abort.signal, setProgress);
      if (!abort.signal.aborted) {
        if (!result) toast.error(t("editor.audioTools.failed"));
        else if (!result.beats) toast.message(t("editor.beats.none"));
        else if (align && !result.changed) toast.message(t("editor.beats.unchanged"));
        else toast.success(t("editor.audioTools.done"));
      }
    } catch { if (!abort.signal.aborted) toast.error(t("editor.audioTools.failed")); }
    finally { if (controller.current === abort) controller.current = null; setMode(null); }
  };
  return <div className="space-y-1.5">
    {AUDIO_TOOL_MODES.map(value => <Button key={value} size="sm" variant="ghost" disabled={!!mode || !!clip.locked || clip.duration > 600} className="h-7 w-full border border-white/10 text-[11px]" onClick={() => void run(value)}>{t(`editor.audioTools.${value}`)}</Button>)}
    <Button size="sm" variant="ghost" disabled={!!mode || !!clip.locked || clip.duration > 600} className="h-7 w-full border border-white/10 text-[11px]" onClick={() => void runBeats(false)}>{t("editor.beats.markers")}</Button>
    <Button size="sm" variant="ghost" disabled={!!mode || !!clip.locked || clip.duration > 600} className="h-7 w-full border border-white/10 text-[11px]" onClick={() => void runBeats(true)}>{t("editor.beats.sync")}</Button>
    <p className="text-[10px] text-white/50">{t("editor.video.speed")} · 0.25–4×</p>
    {mode && <div className="flex items-center justify-between gap-2"><span className="text-xs text-white/70">{t("editor.audioTools.working", { percent: Math.round(progress * 100) })}</span><Button size="sm" variant="ghost" onClick={() => controller.current?.abort()}>{t("common.cancel")}</Button></div>}
    <p className="text-[10px] text-white/50">{t("editor.audioTools.hint")}</p>
  </div>;
}
