import { useEffect, useRef, type FocusEvent, type FormEvent } from "react";
import { useEditorStore } from "@/store/editorStore";
import { projectTask } from "@/lib/editor/projectTask";

function editable(target: EventTarget | null): target is HTMLInputElement | HTMLTextAreaElement {
  return target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement && ["text", "number", "color", "email", "url", "tel"].includes(target.type));
}

/** A focused draft owns editing even before it has changed the document. */
export function useEditorDraftFocus(scope: string, selectionScoped = true) {
  const projectId = useEditorStore(s => s.projectId);
  const selection = useEditorStore(s => s.selectedClipIds.join(","));
  const clips = useEditorStore(s => s.clips), tracks = useEditorStore(s => s.tracks), settings = useEditorStore(s => s.settings);
  const rendered = useRef({ projectId, clips, tracks, settings });
  rendered.current = { projectId, clips, tracks, settings };
  const active = useRef<{ target: HTMLElement | null; scope: string; task: NonNullable<ReturnType<typeof projectTask>> } | null>(null);
  const key = `${projectId}:${scope}:${selectionScoped ? selection : ""}`;
  const finish = () => { const previous = active.current; active.current = null; previous?.task.release(); };
  const begin = (target: HTMLElement | null = null) => {
    if (target && !target.isConnected) return false;
    const store = useEditorStore.getState();
    const currentKey = `${store.projectId}:${scope}:${selectionScoped ? store.selectedClipIds.join(",") : ""}`;
    const previous = active.current;
    if (previous && previous.scope === currentKey && (!target || !previous.target || previous.target === target)) {
      if (target && !previous.target) previous.target = target;
      return previous.task.isCurrent();
    }
    finish();
    const before = rendered.current;
    if (store.projectId !== before.projectId || store.clips !== before.clips || store.tracks !== before.tracks || store.settings !== before.settings) return false;
    active.current = { target, scope: currentKey, task: projectTask(store.holdEdits())! };
    return true;
  };
  useEffect(() => () => { const previous = active.current; active.current = null; previous?.task.release(); }, []);
  useEffect(() => {
    if (active.current && (active.current.scope !== key || !active.current.target?.isConnected)) finish();
  });
  const onFocusCapture = (event: FocusEvent<HTMLElement>) => { if (editable(event.target) && !begin(event.target)) event.stopPropagation(); };
  const onChangeCapture = (event: FormEvent<HTMLElement>) => {
    if (editable(event.target) && active.current?.target && active.current.target !== event.target) { event.preventDefault(); event.stopPropagation(); return; }
    if (editable(event.target) && !begin(event.target)) { event.preventDefault(); event.stopPropagation(); }
  };
  const onBlurCapture = (event: FocusEvent<HTMLElement>) => {
    if (editable(event.target) && active.current?.target && active.current.target !== event.target) { event.stopPropagation(); return; }
    if (editable(event.target) && (!active.current || active.current.target !== event.target || !active.current.task.isCurrent())) {
      finish(); event.stopPropagation();
    }
  };
  const onBlur = (event: FocusEvent<HTMLElement>) => { if (active.current?.target === event.target) finish(); };
  return { begin, finish, props: { onFocusCapture, onChangeCapture, onBlurCapture, onBlur } };
}
