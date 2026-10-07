import { nanoid } from "nanoid";
import { useEditorStore } from "@/store/editorStore";
import { getMedia } from "./mediaStore";
import { importOneFile, type ImportContext } from "./importFiles";
import { audioToolLayers, type AudioToolMode } from "./audioTools";
import { processClipSound } from "./processClipSound";

export async function applyAudioTool(clipId: string, mode: AudioToolMode, ctx: ImportContext = {}, signal?: AbortSignal, onProgress?: (fraction: number) => void): Promise<boolean> {
  const before = useEditorStore.getState();
  const clip = before.clips.find(c => c.id === clipId);
  if (!clip || clip.locked || (clip.kind !== "audio" && clip.kind !== "video")) return false;
  const source = await getMedia(clip.mediaId);
  if (!source) throw new Error("sound unavailable");
  const result = await processClipSound(source.blob, clip, mode, signal, onProgress);
  if (signal?.aborted) return false;
  const current = useEditorStore.getState();
  if (current.projectId !== before.projectId || current.clips.find(c => c.id === clip.id) !== clip) return false;
  const file = new File([result.wav], source.name.replace(/\.[^.]+$/, "") + "-" + mode + ".wav", { type: "audio/wav" });
  const mediaId = await importOneFile(file, { ...ctx, provenance: source.provenance });
  if (!mediaId || signal?.aborted) return false;
  const store = useEditorStore.getState();
  if (store.projectId !== before.projectId || store.clips.find(c => c.id === clip.id) !== clip) return false;
  const layers = audioToolLayers(clip, mediaId, () => nanoid(10), store.tracks.find(track => track.id === clip.trackId));
  await store.runAsOneStep(() => {
    useEditorStore.setState(state => ({
      clips: [...state.clips.map(c => c.id === clip.id ? layers.clip : c), ...(layers.added ? [layers.added] : [])],
      tracks: layers.track ? [...state.tracks, layers.track] : state.tracks,
    }));
  });
  return true;
}
