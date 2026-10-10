import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import { Mic, Camera, Monitor, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEditorStore } from "@/store/editorStore";
import { useEditorQuota } from "@/hooks/use-editor-quota";
import { importOneFile } from "@/lib/editor/importFiles";
import { projectTask } from "@/lib/editor/projectTask";
import { recordStream, recordingExtension, type RecordingKind } from "@/lib/editor/recording";

type Take = { task: NonNullable<ReturnType<typeof projectTask>>; recorder: ReturnType<typeof recordStream> | null };

export function RecordingPanel() {
  const { t } = useTranslation();
  const quota = useEditorQuota();
  const take = useRef<Take | null>(null);
  const wallet = useRef(quota.walletAddress); wallet.current = quota.walletAddress;
  const capturedStream = useRef<MediaStream | null>(null);
  const preview = useRef<HTMLVideoElement>(null);
  const mounted = useRef(true);
  const [kind, setKind] = useState<RecordingKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const release = (owner: Take) => {
    const current = take.current === owner;
    if (current) { take.current = null; capturedStream.current = null; if (preview.current) preview.current.srcObject = null; }
    owner.task.release(); owner.recorder?.stop(true); owner.recorder = null;
    if (current && mounted.current) { setKind(null); setBusy(false); }
  };
  const discard = useRef(() => {});
  discard.current = () => { if (take.current) release(take.current); };
  useEffect(() => {
    mounted.current = true;
    const unsubscribe = useEditorStore.subscribe(() => { if (take.current && !take.current.task.isCurrent()) discard.current(); });
    return () => { mounted.current = false; unsubscribe(); discard.current(); };
  }, []);
  useEffect(() => { if (take.current && !take.current.task.isCurrent()) discard.current(); }, [quota.walletAddress]);
  useEffect(() => {
    if (!kind) return;
    const start = Date.now(); setSeconds(0);
    const timer = setInterval(() => setSeconds((Date.now() - start) / 1000), 250);
    return () => clearInterval(timer);
  }, [kind]);
  useEffect(() => { if (preview.current) preview.current.srcObject = capturedStream.current; }, [kind]);
  const start = async (mode: RecordingKind) => {
    if (take.current) return;
    const anchor = useEditorStore.getState(), captureWallet = wallet.current;
    const at = anchor.currentTime, projectId = anchor.projectId, scope = anchor.scopeVersion;
    anchor.setIsPlaying(false);
    const task = projectTask(anchor.holdEdits(), () => mounted.current && wallet.current === captureWallet && useEditorStore.getState().scopeVersion === scope && useEditorStore.getState().projectId === projectId)!;
    const owner: Take = { task, recorder: null }; take.current = owner;
    setBusy(true);
    try {
      const stream = mode === "screen"
        ? await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true })
        : await navigator.mediaDevices.getUserMedia({ audio: true, video: mode === "camera" ? { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: 30 } : false });
      if (!task.isCurrent()) { stream.getTracks().forEach(track => track.stop()); release(owner); return; }
      capturedStream.current = stream;
      owner.recorder = recordStream(stream, mode, async (blob, duration) => {
        owner.recorder = null;
        if (!task.isCurrent()) { release(owner); return; }
        capturedStream.current = null; setKind(null); setBusy(true);
        try {
          if (duration < 0.25 || !blob.size) return;
          const file = new File([blob], `${mode}-${Date.now()}.${recordingExtension(blob.type)}`, { type: blob.type });
          const id = await importOneFile(file, { wallet: captureWallet, duration });
          const state = useEditorStore.getState();
          if (!id || !task.isCurrent()) return;
          await state.runAsOneStep(() => {
            if (!task.isCurrent()) return;
            const trackId = nanoid(8);
            useEditorStore.setState(s => ({ tracks: [...s.tracks, { id: trackId, kind: mode === "audio" ? "audio" : "video", name: file.name, hidden: false, muted: false }] }));
            useEditorStore.getState().addClipFromMedia(id, trackId, at);
          });
          if (task.isCurrent()) void quota.refetchUsage().catch(() => {});
        } catch { if (task.isCurrent()) toast.error(t("common.somethingWentWrong")); }
        finally { release(owner); }
      }, () => { if (task.isCurrent()) toast.error(t("common.somethingWentWrong")); release(owner); });
      if (task.isCurrent()) { setKind(mode); setBusy(false); }
      else release(owner);
    } catch { if (task.isCurrent()) toast.error(t("common.somethingWentWrong")); release(owner); }
  };
  return <div className="space-y-2 border-b border-white/10 px-3 pb-3">
    <p className="text-[10px] font-semibold uppercase tracking-wide text-white/50">{t("prompt.record")}</p>
    {kind && kind !== "audio" && <video ref={preview} autoPlay muted playsInline className="w-full rounded-md" />}
    {kind ? <div className="flex items-center gap-2">
      <span className="text-xs tabular-nums text-white/80">{Math.floor(seconds / 60)}:{String(Math.floor(seconds) % 60).padStart(2, "0")}</span>
      <Button size="sm" onClick={() => take.current?.recorder?.stop()}><Square className="mr-1 h-3 w-3" />{t("common.save")}</Button>
      <Button size="sm" variant="ghost" onClick={() => discard.current()}>{t("common.cancel")}</Button>
    </div> : <div className="grid grid-cols-3 gap-1">
      {(["audio", "camera", "screen"] as RecordingKind[]).map(mode => {
        const Icon = mode === "audio" ? Mic : mode === "camera" ? Camera : Monitor;
        const label = t(mode === "audio" ? "creator.navAudio" : mode === "camera" ? "goLive.sourceCamera" : "goLive.sourceScreen");
        return <Button key={mode} size="sm" variant="ghost" disabled={busy || quota.overQuota || typeof MediaRecorder === "undefined" || !navigator.mediaDevices || (mode === "screen" && !navigator.mediaDevices.getDisplayMedia)} onClick={() => { void start(mode); }} className="h-auto flex-col gap-1 rounded-md border border-white/10 py-2 text-[10px]" title={label}>
          <Icon className="h-4 w-4" />{label}
        </Button>;
      })}
    </div>}
  </div>;
}
