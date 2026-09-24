/**
 * Remove an image layer's background on the user's device.
 *
 * The heavy lifting happens in public/editor/bg-remove-worker.js: no server,
 * no upload, no charge. The cut-out is imported as a new library item and
 * swapped into the same layer, so placement, filters and animation stay put,
 * and undo brings the original back.
 */
import { useEditorStore } from "@/store/editorStore";
import { importOneFile } from "./importFiles";

export type BgRemovalProgress =
  | { stage: "download"; loaded: number; total: number }
  | { stage: "running" };

type Mode = "hd" | "lite";

/** Set once a GPU run has failed on this browser, so it goes straight to the CPU model next time. */
const NO_GPU_KEY = "dehub.editor.bgRemove.noGpu";

function gpuAllowed(): boolean {
  if (typeof navigator === "undefined" || !("gpu" in navigator)) return false;
  try {
    return localStorage.getItem(NO_GPU_KEY) !== "1";
  } catch {
    return true;
  }
}

function rememberNoGpu() {
  try {
    localStorage.setItem(NO_GPU_KEY, "1");
  } catch {
    /* private mode: we just retry the GPU next session */
  }
}

let seq = 0;

/**
 * One job in a fresh or reused worker. Workers are per mode: after a WebGPU
 * failure the ONNX runtime in that worker stays tied to WebGPU, so the CPU
 * model must run in a different worker.
 */
const workers: Partial<Record<Mode, Worker>> = {};

function runIn(mode: Mode, blob: Blob, onProgress?: (p: BgRemovalProgress) => void): Promise<Blob> {
  const worker = (workers[mode] ??= new Worker("/editor/bg-remove-worker.js", { type: "module" }));
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent) => {
      const d = e.data ?? {};
      if (d.id !== id) return;
      if (d.type === "progress") onProgress?.({ stage: "download", loaded: d.loaded, total: d.total });
      else if (d.type === "running") onProgress?.({ stage: "running" });
      else if (d.type === "done") { cleanup(); resolve(d.blob as Blob); }
      else if (d.type === "error") { cleanup(); reject(new Error(String(d.message))); }
    };
    const onError = (e: ErrorEvent) => { cleanup(); reject(new Error(e.message || "worker failed")); };
    const cleanup = () => {
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
    };
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    worker.postMessage({ id, blob, mode });
  });
}

/** Cut the subject out of an image. Resolves with a PNG with transparency. */
export async function cutOutImage(blob: Blob, onProgress?: (p: BgRemovalProgress) => void): Promise<Blob> {
  if (gpuAllowed()) {
    try {
      return await runIn("hd", blob, onProgress);
    } catch (e) {
      console.warn("[editor] GPU background removal failed, using the CPU model", e);
      rememberNoGpu();
      workers.hd?.terminate();
      delete workers.hd;
    }
  }
  return runIn("lite", blob, onProgress);
}

/**
 * Replace an image layer's picture with a background-free cut-out.
 * Returns false when the clip is not an image or the import failed.
 */
export async function removeLayerBackground(
  clipId: string,
  opts: { wallet?: string | null; onProgress?: (p: BgRemovalProgress) => void } = {},
): Promise<boolean> {
  const s = useEditorStore.getState();
  const clip = s.clips.find((c) => c.id === clipId);
  if (!clip || clip.kind !== "image") return false;
  const media = s.media.find((m) => m.id === clip.mediaId);
  if (!media) return false;

  const source = await (await fetch(media.url)).blob();
  const png = await cutOutImage(source, opts.onProgress);
  const base = media.name.replace(/\.[a-z0-9]+$/i, "");
  const file = new File([png], `${base}-cutout.png`, { type: "image/png" });
  const newId = await importOneFile(file, { wallet: opts.wallet });
  if (!newId) return false;
  useEditorStore.getState().patchClip(clipId, { mediaId: newId });
  return true;
}
