import { useEditorStore } from "@/store/editorStore";
import { projectCommandHistory } from "./projectCommandHistory";
import { projectTask } from "./projectTask";
import type { ProjectSnapshot } from "./types";

export interface CommandCommit { capture<Result>(write: () => Result): Result; isCurrent(): boolean; ready?(): Promise<void> }
export const commitCommand = async <Result,>(command: CommandCommit | undefined, write: () => Result): Promise<Awaited<Result>> => {
  if (command?.ready) await command.ready();
  return await (command ? command.capture(write) : write());
};

const actions = new Set(["addTrack", "removeTrack", "moveTrack", "reorderTrack", "addClipFromMedia", "duplicateOnCanvas", "addTextClip", "addShapeClip", "moveClip", "trimClip", "setClipSpeed", "splitAtPlayhead", "rippleDelete", "duplicateSelected", "pasteFromClipboard", "updateTextClip", "fitCaptionTrack", "updateMediaClip", "setClipTransition", "updateSettings", "addPage", "deletePage", "patchClipLive", "patchClip"]);

export function beginEditorCommand() {
  const task = projectTask(useEditorStore.getState().holdEdits())!;
  type Entry = ReturnType<typeof useEditorStore.getState>["past"][number];
  const snapshot = (entry: Entry): ProjectSnapshot => ({ ...useEditorStore.getState().toSnapshot(), ...entry });
  const group = projectCommandHistory<Entry>({
    read: () => { const now = useEditorStore.getState(); return { current: now.toSnapshot(), past: now.past, future: now.future }; },
    snapshot,
    entry: value => ({ clips: value.clips, tracks: value.tracks, settings: value.settings }),
    write: value => useEditorStore.setState(value),
    isCurrent: task.isCurrent,
  });
  const unsubscribe = useEditorStore.subscribe((next, before) => { if (next.past !== before.past) group.isCurrent(); });
  const waiters = new Set<() => void>();
  const ready = () => {
    if (!group.isCurrent()) return Promise.reject(new Error("The pending command changed or was undone"));
    if (useEditorStore.getState().isHistorySettled()) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const cancel = () => { stop(); reject(new Error("The pending command changed or was undone")); };
      const stop = () => { off(); waiters.delete(cancel); };
      const off = useEditorStore.subscribe(() => {
        if (!group.isCurrent()) cancel();
        else if (useEditorStore.getState().isHistorySettled()) { stop(); resolve(); }
      });
      waiters.add(cancel);
    });
  };
  const capture = <Result,>(write: () => Result): Result => {
    if (!useEditorStore.getState().isHistorySettled()) throw new Error("Finish the active adjustment before applying this command");
    return group.capture(write);
  };
  const commit = (write: () => void) => { capture(write); };
  const store = () => {
    if (!group.isCurrent()) throw new Error("The pending command changed or was undone");
    return new Proxy(useEditorStore.getState(), {
      get(target, key, receiver) {
        const value = Reflect.get(target, key, receiver);
        return typeof key === "string" && actions.has(key) && typeof value === "function" ? (...args: unknown[]) => capture(() => value(...args)) : value;
      },
    });
  };
  return { store, commit, capture, ready, isCurrent: group.isCurrent, release: () => { for (const cancel of [...waiters]) cancel(); unsubscribe(); task.release(); } };
}
