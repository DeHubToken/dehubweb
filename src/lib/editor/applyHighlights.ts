import { nanoid } from "nanoid";
import { useEditorStore } from "@/store/editorStore";
import { saveProject, setLastProjectId } from "./projectStore";
import { highlightProject, sameHighlightSource, type HighlightRange } from "./highlights";
import type { ProjectSnapshot } from "./types";

export async function createHighlightEdit(original: ProjectSnapshot, clipId: string, ranges: HighlightRange[], title: string): Promise<boolean> {
  const current = () => useEditorStore.getState().toSnapshot();
  if (!sameHighlightSource(original, current())) return false;
  const next = highlightProject(original, clipId, ranges, { id: nanoid(10), title }, () => nanoid(10));
  await saveProject(original);
  if (!sameHighlightSource(original, current())) return false;
  await saveProject(next);
  if (!sameHighlightSource(original, current())) return false;
  // The original keeps its own durable identity. The copy begins with its
  // original contents so one Undo can restore everything within that copy.
  useEditorStore.getState().loadSnapshot({ ...original, id: next.id, title: next.title });
  await useEditorStore.getState().runAsOneStep(() => {
    useEditorStore.setState({ tracks: next.tracks, clips: next.clips, settings: next.settings });
  });
  setLastProjectId(next.id);
  return true;
}
