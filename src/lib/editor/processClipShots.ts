import { SHOT_RUNTIME } from "./shotRuntime";
import { validShotAnalysis, type ShotAnalysis } from "./shots";
import type { MediaClip } from "./types";

export function shotScanDocument(key: string): string {
  return `<!doctype html><script>${SHOT_RUNTIME}\nvar abort; window.addEventListener('message', async function(event) { if(event.source !== parent) return; var m = event.data; if(m.type === 'cancel') { if(abort) abort.abort(); return; } if(m.type !== 'scan' || abort) return; abort = new AbortController(); try { var result = await scanVideoShots(m.src, m.clip, abort.signal, function(fraction) { parent.postMessage({key:m.key,type:'progress',fraction:fraction},'*'); }); parent.postMessage({key:m.key,type:'done',result:result},'*'); } catch(error) { parent.postMessage({key:m.key,type:'error',error:String(error.message||error)},'*'); } }); parent.postMessage({type:'ready',key:${JSON.stringify(key)}},'*');</script>`;
}

/** A separate decoder lets analysis seek without disturbing timeline playback. */
export function processClipShots(blob: Blob, clip: MediaClip, signal?: AbortSignal, progress?: (fraction: number) => void): Promise<ShotAnalysis> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe"); frame.hidden = true; frame.setAttribute("aria-hidden", "true");
    const source = URL.createObjectURL(blob), controllerKey = crypto.randomUUID();
    const documentUrl = URL.createObjectURL(new Blob([shotScanDocument(controllerKey)], { type: "text/html" }));
    let finished = false;
    const finish = (error?: Error, result?: ShotAnalysis) => {
      if (finished) return; finished = true;
      clearTimeout(timer); clearTimeout(startupTimer); signal?.removeEventListener("abort", cancel); window.removeEventListener("message", message);
      frame.contentWindow?.postMessage({ type: "cancel" }, "*"); frame.remove(); URL.revokeObjectURL(source); URL.revokeObjectURL(documentUrl);
      if (error) reject(error); else if (result) resolve(result);
    };
    const cancel = () => finish(new DOMException("Cancelled", "AbortError"));
    const startupTimer = setTimeout(() => finish(new Error("scene scanner did not start")), 20000);
    const timer = setTimeout(() => finish(new Error("scene scan timed out")), 10 * 60 * 1000);
    const message = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow || event.data?.key !== controllerKey || finished) return;
      const data = event.data;
      if (data.type === "ready") { clearTimeout(startupTimer); frame.contentWindow?.postMessage({ type: "scan", key: controllerKey, src: source, clip }, "*"); }
      else if (data.type === "progress") progress?.(Math.max(0, Math.min(1, Number(data.fraction) || 0)));
      else if (data.type === "error") finish(new Error(String(data.error)));
      else if (data.type === "done") validShotAnalysis(data.result, clip) ? finish(undefined, data.result) : finish(new Error("invalid scene scan"));
    };
    window.addEventListener("message", message); signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) { cancel(); return; }
    frame.src = documentUrl; document.body.appendChild(frame);
  });
}
