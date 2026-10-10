import { useEditorStore } from "@/store/editorStore";
import { autoEnhanceEffects } from "./autoEnhance";
import { projectTask } from "./projectTask";

export async function applyAutoEnhance(id: string): Promise<boolean> {
  const before = useEditorStore.getState(), clip = before.clips.find(c => c.id === id);
  if (!clip || clip.kind !== "image" || clip.locked) return false;
  const media = before.media.find(m => m.id === clip.mediaId);
  if (!media) return false;
  const task = projectTask(before.holdEdits());
  try {
    const effects = await autoEnhanceEffects(media.url, clip.effects);
    const now = useEditorStore.getState();
    if (!task!.isCurrent() || now.projectId !== before.projectId || now.clips.find(c => c.id === id) !== clip) return false;
    now.updateMediaClip(id, { effects });
    return true;
  } finally { task!.release(); }
}
