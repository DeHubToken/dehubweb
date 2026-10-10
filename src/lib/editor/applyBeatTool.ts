import { projectTask } from "./projectTask";
import { useEditorStore } from "@/store/editorStore";
import { getMedia } from "./mediaStore";
import { processClipSound } from "./processClipSound";
import { alignBeatCuts, clipBeatMap, clipBeatTimes } from "./beats";

export async function applyBeatTool(id: string, align: boolean, signal?: AbortSignal, onProgress?: (fraction: number) => void): Promise<{ beats: number; changed: number } | null> {
  const before = useEditorStore.getState(), clip = before.clips.find(c => c.id === id);
  if (!clip || clip.locked || clip.hidden || (clip.kind !== "audio" && clip.kind !== "video")) return null;
  const task = projectTask(before.holdEdits());
  try {
  const source = await getMedia(clip.mediaId);
  if (!task!.isCurrent()) return null;
  if (!source) throw new Error("music unavailable");
  const result = await processClipSound(source.blob, clip, "beats", signal, onProgress);
  if (!task!.isCurrent() || signal?.aborted) return null;
  const now = useEditorStore.getState();
  if (now.projectId !== before.projectId || now.clips !== before.clips || now.tracks !== before.tracks) return null;
  const beats = clipBeatMap(clip, result), marked = { ...clip, beats };
  if (!beats.sourceTimes.length) return { beats: 0, changed: 0 };
  const clips = now.clips.map(c => c.id === id ? marked : c);
  const synced = align ? alignBeatCuts(clips, now.tracks, clipBeatTimes(marked)) : { clips, changed: 0 };
  await now.runAsOneStep(() => { useEditorStore.setState({ clips: synced.clips }); });
  return { beats: beats.sourceTimes.length, changed: synced.changed };
  } finally { task!.release(); }
}
