import { useState } from "react";
import { useTranslation } from "react-i18next";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useEditorStore } from "@/store/editorStore";
import { clipAudio } from "@/lib/editor/captions";
import { removeRetakes } from "@/lib/editor/retakes";
import { applyTimelineOp } from "@/lib/editor/timelineAgent";
import { otherSpeakerRanges, speakerChangePoints, speakerTurns, summariseSpeakers, wavFromSamples, type SpeakerTurn } from "@/lib/editor/speakers";
import { editorErrorText } from "@/lib/editor/editorErrorText";
import type { MediaClip } from "@/lib/editor/types";

const SPEAKER_COLOURS = ["#7dd3fc", "#fca5a5", "#86efac", "#fcd34d", "#c4b5fd", "#f9a8d4"];

/** Who is talking: find the speakers in a clip, then keep one or cut at each change. */
export function SpeakerTools({ clip }: { clip: MediaClip }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState<SpeakerTurn[] | null>(null);
  const source = useEditorStore(s => s.media.find(m => m.id === clip.mediaId));
  const summary = turns ? summariseSpeakers(turns) : [];
  const names = new Map(summary.map((s, i) => [s.speaker, t("editor.speakers.name", { number: i + 1 })]));

  const find = async () => {
    if (!source) return;
    setBusy(true);
    try {
      const speed = clip.speed && clip.speed > 0 ? clip.speed : 1;
      const samples = await clipAudio(source.url, clip.trimIn, clip.duration * speed);
      const file = new File([wavFromSamples(samples)], "speakers.wav", { type: "audio/wav" });
      const { runAudioTask } = await import("@/lib/creator/generationEngine");
      const result = await runAudioTask({ task: "transcribe", file });
      const found = speakerTurns(result.segments ?? [], clip.duration, speed);
      setTurns(found);
      if (new Set(found.map(f => f.speaker)).size < 2) toast.message(t("editor.speakers.onlyOne"));
    } catch (error) {
      console.warn("[editor] speaker detection failed", error);
      toast.error(editorErrorText(error, t("editor.speakers.failed")));
    } finally { setBusy(false); }
  };

  const keep = (speaker: string) => {
    if (!turns) return;
    const now = useEditorStore.getState(), before = now.toSnapshot();
    const after = removeRetakes(before, clip.id, otherSpeakerRanges(turns, speaker), () => nanoid(8));
    if (after && now.applyDesignEdit(before, after)) { toast.success(t("editor.speakers.kept", { name: names.get(speaker) })); setTurns(null); }
    else toast.error(t("editor.speakers.editFailed"));
  };

  const split = () => {
    if (!turns) return;
    const points = speakerChangePoints(turns, clip.duration).filter((at, i, all) => i === 0 || at - all[i - 1] >= 0.25).slice(0, 99);
    if (!points.length) return;
    const now = useEditorStore.getState(), before = now.toSnapshot();
    const next = applyTimelineOp({ clips: before.clips, tracks: before.tracks }, { op: "split_points", id: clip.id, times: points }, () => nanoid(8));
    if (next && now.applyDesignEdit(before, { ...before, clips: next.clips, tracks: next.tracks })) { toast.success(t("editor.speakers.split", { count: points.length + 1 })); setTurns(null); }
    else toast.error(t("editor.speakers.editFailed"));
  };

  const button = "h-7 rounded-md border border-white/10 text-[11px] text-white/80 hover:bg-white/5 hover:text-white disabled:opacity-40";
  return (
    <div className="space-y-1.5 pt-1.5">
      <Button size="sm" variant="ghost" disabled={clip.locked || busy || !source} onClick={() => void find()} className={`${button} w-full`}>
        {busy ? t("editor.clipFix.listening") : t("editor.speakers.find")}
      </Button>
      {turns && summary.length > 1 && (
        <div className="space-y-1 rounded-lg border border-white/10 p-1.5" data-speaker-list>
          <div className="flex h-2 overflow-hidden rounded-full bg-white/5" aria-hidden>
            {turns.map((turn, i) => (
              <span key={i} style={{ width: `${((turn.to - turn.from) / clip.duration) * 100}%`, marginLeft: i === 0 ? `${(turn.from / clip.duration) * 100}%` : undefined,
                background: SPEAKER_COLOURS[summary.findIndex(s => s.speaker === turn.speaker) % SPEAKER_COLOURS.length] }} />
            ))}
          </div>
          {summary.map((s, i) => (
            <div key={s.speaker} className="flex items-center gap-1.5 text-[11px] text-white/80">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: SPEAKER_COLOURS[i % SPEAKER_COLOURS.length] }} />
              <span className="min-w-0 flex-1 truncate" title={s.firstLine}>{names.get(s.speaker)} · {Math.round(s.share * 100)}%</span>
              <button type="button" onClick={() => keep(s.speaker)} className="rounded border border-white/15 px-1.5 py-0.5 text-[10px] hover:bg-white/10">
                {t("editor.speakers.keepOnly")}
              </button>
            </div>
          ))}
          <Button size="sm" variant="ghost" onClick={split} className={`${button} w-full`}>
            {t("editor.speakers.splitAction")}
          </Button>
        </div>
      )}
    </div>
  );
}
