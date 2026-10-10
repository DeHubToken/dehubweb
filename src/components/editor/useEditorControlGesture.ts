import { useEffect, useRef } from "react";
import { projectControlGesture } from "@/lib/editor/projectControlGesture";
import { useEditorStore } from "@/store/editorStore";

export function useEditorControlGesture(scope: string = "") {
  const projectId = useEditorStore(s => s.projectId);
  const selection = useEditorStore(s => s.selectedClipIds.join(","));
  const clips = useEditorStore(s => s.clips);
  const tracks = useEditorStore(s => s.tracks);
  const settings = useEditorStore(s => s.settings);
  const rendered = useRef({ projectId, clips, tracks, settings });
  rendered.current = { projectId, clips, tracks, settings };
  const control = useRef<ReturnType<typeof projectControlGesture> | null>(null);
  if (!control.current) control.current = projectControlGesture(() => {
    const store = useEditorStore.getState(), before = rendered.current;
    if (store.projectId !== before.projectId || store.clips !== before.clips || store.tracks !== before.tracks || store.settings !== before.settings) return null;
    const lease = store.holdEdits();
    let resolve!: () => void;
    void store.runAsOneStep(() => new Promise<void>(done => { resolve = done; }));
    return { isCurrent: lease.isCurrent, release: () => { resolve(); lease.release(); } };
  }, () => {});
  const gesture = control.current;
  useEffect(() => {
    const finish = () => gesture.finish();
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    window.addEventListener("keyup", finish);
    window.addEventListener("blur", finish);
    return () => {
      gesture.finish();
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      window.removeEventListener("keyup", finish);
      window.removeEventListener("blur", finish);
    };
  }, [gesture, projectId, scope, selection]);
  return gesture;
}
