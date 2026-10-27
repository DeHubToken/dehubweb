import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { useEditorStore } from "@/store/editorStore";
import { clipAudio } from "@/lib/editor/captions";
import { wavFromSamples } from "@/lib/editor/speakers";
import { editorErrorText } from "@/lib/editor/editorErrorText";
import { fetchVoiceCloneStatus, purchaseStageVoice, releaseStageVoice, VoiceCloneError, type VoiceCloneStatus } from "@/lib/stage-voice-clone";

/** Longest sample we take from a clip: ElevenLabs wants one to two minutes of clean speech. */
const SAMPLE_SECONDS = 120;

/**
 * Clone the creator's own voice for voiceovers. Paid once per account through
 * the same route the Stage voice uses, so a voice bought there works here and
 * nobody pays twice. Dubbing on Stages is left exactly as it was.
 */
export function VoiceCloneDialog({ open, onOpenChange, onCloned }: { open: boolean; onOpenChange: (open: boolean) => void; onCloned: (voiceId: string) => void }) {
  const { t } = useTranslation();
  const { walletAddress } = useAuth() as { walletAddress: string | null };
  const library = useEditorStore(s => s.media);
  const media = library.filter(m => m.kind === "audio" || m.kind === "video");
  const [status, setStatus] = useState<VoiceCloneStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [sample, setSample] = useState<File | null>(null);
  const [sampleLabel, setSampleLabel] = useState("");
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);

  useEffect(() => {
    if (!open || !walletAddress) return;
    let active = true;
    setLoading(true);
    void fetchVoiceCloneStatus(walletAddress).then(next => { if (active) setStatus(next); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, walletAddress]);

  useEffect(() => () => recorder.current?.stream.getTracks().forEach(track => track.stop()), []);

  const record = async () => {
    if (recording) { recorder.current?.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const next = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      next.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      next.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
        const type = next.mimeType || "audio/webm";
        setSample(new File(chunks, `voice-sample.${type.includes("mp4") ? "m4a" : "webm"}`, { type }));
        setSampleLabel(t("editor.voiceClone.recorded"));
        setRecording(false);
      };
      recorder.current = next;
      next.start();
      setRecording(true);
    } catch {
      toast.error(t("editor.voiceClone.noMic"));
    }
  };

  const fromMedia = async (id: string) => {
    const item = useEditorStore.getState().media.find(m => m.id === id);
    if (!item) return;
    setBusy(true);
    try {
      const seconds = Math.min(SAMPLE_SECONDS, item.duration || SAMPLE_SECONDS);
      const samples = await clipAudio(item.url, 0, seconds);
      setSample(new File([wavFromSamples(samples)], "voice-sample.wav", { type: "audio/wav" }));
      setSampleLabel(item.name);
    } catch (error) {
      toast.error(editorErrorText(error, t("editor.voiceClone.sampleFailed")));
    } finally { setBusy(false); }
  };

  const clone = async () => {
    if (!walletAddress || !status) return;
    // A voice already on the account speaks in voiceovers for free; buying the
    // Stage route again would only charge for dubbing.
    if (status.owned) { onCloned(""); onOpenChange(false); return; }
    setBusy(true);
    try {
      const result = await purchaseStageVoice(walletAddress, sample, name.trim() || t("editor.voiceClone.defaultName"), status);
      // The Stage route switches dubbing on; put it back the way the creator had it.
      if (!status.enabled) await releaseStageVoice(walletAddress);
      toast.success(t("editor.voiceClone.ready", { name: result.name }));
      onCloned(result.voiceId);
      onOpenChange(false);
    } catch (error) {
      const paid = error instanceof VoiceCloneError && error.paid;
      toast.error(paid ? t("editor.voiceClone.paidFailed") : editorErrorText(error, t("editor.voiceClone.failed")));
    } finally { setBusy(false); }
  };

  const free = !!status && (status.entitled || status.creditedRetry);
  const ready = !!status && (status.owned || !!sample) && !recording && !busy;
  const pill = "rounded-lg border border-white/15 px-3 py-2 text-left text-xs text-white/85 transition hover:bg-white/10 disabled:opacity-40";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm border-white/10 bg-black/90 text-white backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle>{t("editor.voiceClone.title")}</DialogTitle>
          <DialogDescription className="text-white/60">{t("editor.voiceClone.description")}</DialogDescription>
        </DialogHeader>
        {!walletAddress ? <p className="text-sm text-white/70">{t("editor.signInToGenerate")}</p> : loading || !status ? (
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-white/60" aria-label={t("common.loading")} />
        ) : (
          <div className="space-y-3">
            {status.owned ? (
              <p className="text-sm text-white/75">{t("editor.voiceClone.owned", { name: status.voiceName ?? "" })}</p>
            ) : (
              <>
                <Input value={name} onChange={e => setName(e.target.value)} maxLength={40} placeholder={t("editor.voiceClone.defaultName")} className="border-white/15 bg-white/5 text-white" />
                <div className="grid gap-1.5">
                  <button type="button" className={pill} onClick={() => void record()} disabled={busy}>
                    {recording ? t("editor.voiceClone.stop") : t("editor.voiceClone.record")}
                  </button>
                  {media.length > 0 && (
                    <select aria-label={t("editor.voiceClone.fromMedia")} className={`${pill} bg-transparent`} disabled={busy || recording} value="" onChange={e => void fromMedia(e.target.value)}>
                      <option value="" className="bg-black">{t("editor.voiceClone.fromMedia")}</option>
                      {media.map(m => <option key={m.id} value={m.id} className="bg-black">{m.name}</option>)}
                    </select>
                  )}
                </div>
                <p className="text-[11px] text-white/50">{sample ? t("editor.voiceClone.sample", { name: sampleLabel }) : t("editor.voiceClone.hint")}</p>
              </>
            )}
            <Button onClick={() => void clone()} disabled={!ready} className="w-full bg-white text-black hover:bg-white/90">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : status.owned
                ? t("editor.voiceClone.useOwned")
                : free ? t("editor.voiceClone.useFree")
                : t("editor.voiceClone.pay", { amount: Math.ceil(status.priceDhb).toLocaleString() })}
            </Button>
            <p className="text-[11px] leading-snug text-white/45">{t("editor.voiceClone.consent")}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
