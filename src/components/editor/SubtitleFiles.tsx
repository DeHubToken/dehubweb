import { useTranslation as _useCopy } from 'react-i18next';
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useEditorStore } from "@/store/editorStore";
import { loadGoogleFont } from "@/lib/editor/googleFonts";
import { exportSubtitles, parseSubtitles, subtitleClips, subtitleLayers, SUBTITLE_FORMATS, type SubtitleFormat } from "@/lib/editor/subtitles";

export function SubtitleFiles() {
  const { t: _copy } = _useCopy();
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const clips = useEditorStore(s => s.clips);
  const tracks = useEditorStore(s => s.tracks);
  const captions = subtitleClips(clips, tracks);
  const importFile = async (file: File) => {
    if (busy) return;
    const projectId = useEditorStore.getState().projectId;
    setBusy(true);
    try {
      if (file.size > 2_000_000) throw new Error("subtitle file too large");
      const cues = parseSubtitles(await file.text());
      if (!cues.length) throw new Error("no subtitle cues");
      await loadGoogleFont("Montserrat", [800]);
      const store = useEditorStore.getState();
      if (store.projectId !== projectId) return;
      const result = subtitleLayers(cues, () => nanoid(8));
      await store.runAsOneStep(() => {
        useEditorStore.setState(state => ({ tracks: [...state.tracks, result.track], clips: [...state.clips, ...result.clips] }));
      });
      toast.success(t("editor.captions.done", { count: cues.length }));
    } catch { toast.error(t("editor.captions.failed")); }
    finally { setBusy(false); }
  };
  const download = (format: SubtitleFormat) => {
    const state = useEditorStore.getState();
    const text = exportSubtitles(subtitleClips(state.clips, state.tracks), format);
    const url = URL.createObjectURL(new Blob([text], { type: format === "vtt" ? "text/vtt;charset=utf-8" : "application/x-subrip;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(state.projectTitle || "subtitles").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").slice(0, 100)}.${format}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="space-y-2 border-b border-white/10 p-3">
    <h3 className="text-[11px] font-semibold uppercase tracking-wide text-white/50">{_copy("copy.00c90f4b707a", { defaultValue: "SRT / VTT" })}</h3>
    <input ref={input} type="file" accept=".srt,.vtt,text/vtt,application/x-subrip" className="hidden" onChange={event => {
      const file = event.target.files?.[0]; event.target.value = "";
      if (file) void importFile(file);
    }} />
    <Button size="sm" variant="ghost" disabled={busy} onClick={() => input.current?.click()} className="h-7 w-full border border-white/10 text-[11px]">
      {t(busy ? "common.loading" : "editor.design.importMedia")}{_copy("copy.450683b66da4", { defaultValue: " SRT / VTT" })}</Button>
    <div className="grid grid-cols-2 gap-1">
      {SUBTITLE_FORMATS.map(format => <Button key={format} size="sm" variant="ghost" disabled={!captions.length || busy} onClick={() => download(format)} className="h-7 border border-white/10 text-[11px]">
        {t("common.save")} {format.toUpperCase()}
      </Button>)}
    </div>
  </section>;
}
