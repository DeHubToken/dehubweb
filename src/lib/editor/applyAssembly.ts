import { nanoid } from "nanoid";
import { useEditorStore } from "@/store/editorStore";
import { saveProject, setLastProjectId } from "./projectStore";
import { assemblyProject, persistAssembly, type AssemblyPlan } from "./assembly";
import type { ProjectSnapshot } from "./types";
import type { AssemblyAsset } from "./assemblyLibrary";

export async function createAssemblyEdit(original: ProjectSnapshot, plan: AssemblyPlan, title: string, signal?: AbortSignal, library: readonly AssemblyAsset[] = []): Promise<boolean> {
  const next = assemblyProject(original, plan, { id: nanoid(10), title }, () => nanoid(10), library);
  return persistAssembly(original, next, { current: () => useEditorStore.getState().toSnapshot(), save: saveProject, commit: async (source, copy) => {
    useEditorStore.getState().loadSnapshot({ ...source, id: copy.id, title: copy.title });
    await useEditorStore.getState().runAsOneStep(() => { useEditorStore.setState({ tracks: copy.tracks, clips: copy.clips, settings: copy.settings }); });
    setLastProjectId(copy.id);
  } }, signal);
}
