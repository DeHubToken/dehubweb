import type { ProjectSnapshot } from "./types";
import { EditorError } from "./editorError";
type Renderer = (snapshot: ProjectSnapshot, time: number, maxEdge: number) => Promise<string>;
const renderers = new Map<string, { render: Renderer; tail: Promise<unknown> }>();
function cancelled(): Error { const error = new EditorError("copy.b6465bf8939a", "Page preview cancelled"); error.name = "AbortError"; return error; }
export function registerDesignPagePreview(projectId: string, render: Renderer): () => void {
  const entry = { render, tail: Promise.resolve() as Promise<unknown> }; renderers.set(projectId, entry);
  return () => { if (renderers.get(projectId) === entry) renderers.delete(projectId); };
}
/** Preview work is serialized so a page grid cannot run simultaneous canvas captures. */
export function requestDesignPagePreview(snapshot: ProjectSnapshot, time: number, maxEdge: number, signal: AbortSignal): Promise<string> {
  const entry = renderers.get(snapshot.id);
  if (!entry) return Promise.reject(new EditorError("copy.0121cd12bdce", "The design canvas is not ready"));
  const check = () => { if (signal.aborted || renderers.get(snapshot.id) !== entry) throw cancelled(); };
  const result = entry.tail.then(async () => { check(); const image = await entry.render(snapshot, time, Math.max(64, Math.min(512, maxEdge))); check(); return image; });
  entry.tail = result.catch(() => {}); return result;
}
