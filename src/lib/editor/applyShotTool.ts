import { commitCommand, type CommandCommit } from "./editorCommand";
import { nanoid } from "nanoid";
import { useEditorStore } from "@/store/editorStore";
import { getMedia } from "./mediaStore";
import { processClipShots } from "./processClipShots";
import { applyTimelineOp } from "./timelineAgent";
import type { MediaClip } from "./types";

export async function detectClipShots(id: string, signal?: AbortSignal, progress?: (fraction: number) => void) {
  const before = useEditorStore.getState(), clip = before.clips.find(c => c.id === id);
  if (!clip || clip.kind !== "video" || clip.locked || clip.hidden) throw new Error("video unavailable");
  const source = await getMedia(clip.mediaId);
  if (!source) throw new Error("source unavailable");
  const analysis = await processClipShots(source.blob, clip, signal, progress), now = useEditorStore.getState();
  if (signal?.aborted || now.projectId !== before.projectId || now.clips !== before.clips || now.tracks !== before.tracks) throw new Error("design changed");
  return { clip, analysis };
}
export async function splitShotClip(clip: MediaClip, times: number[], command?: CommandCommit): Promise<boolean> {
  const now = useEditorStore.getState();
  if (now.clips.find(c => c.id === clip.id) !== clip) return false;
  let committed = false;
  await commitCommand(command, () => now.runAsOneStep(() => {
    const latest = useEditorStore.getState();
    if (latest.clips.find(c => c.id === clip.id) !== clip) return;
    const result = applyTimelineOp(latest, { op: "split_points", id: clip.id, times }, () => nanoid(10));
    if (!result) return;
    useEditorStore.setState({ clips: result.clips, selectedClipIds: [clip.id, ...result.created] }); committed = true;
  }));
  return committed;
}
