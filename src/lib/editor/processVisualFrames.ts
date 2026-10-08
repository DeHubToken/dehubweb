import { VISUAL_FRAME_RUNTIME } from "./visualFrameRuntime";
import { VIDEO_FRAME_RUNTIME } from "./videoFrame";
import { validVisualFrames, validVisualWindows, type VisualFrame, type VisualWindow } from "./visualHighlightContract";
import type { MediaClip } from "./types";

export function visualFrameDocument(key: string): string {
  return `<!doctype html><script>${VIDEO_FRAME_RUNTIME}\n${VISUAL_FRAME_RUNTIME}\nvar abort; window.addEventListener('message', async function(event) { if(event.source !== parent) return; var m = event.data; if(m.type === 'cancel') { if(abort) abort.abort(); return; } if(m.type !== 'sample' || abort) return; abort = new AbortController(); try { var result = await sampleVisualFrames(m.src, m.clip, m.windows, abort.signal, function(fraction) { parent.postMessage({key:m.key,type:'progress',fraction:fraction},'*'); }); parent.postMessage({key:m.key,type:'done',result:result},'*'); } catch(error) { parent.postMessage({key:m.key,type:'error',error:String(error.message||error)},'*'); } }); parent.postMessage({type:'ready',key:${JSON.stringify(key)}},'*');</script>`;
}

export function processVisualFrames(blob: Blob, clip: MediaClip, windows: VisualWindow[], signal: AbortSignal, progress: (fraction: number) => void): Promise<VisualFrame[]> {
  if (!validVisualWindows(windows, clip.duration)) return Promise.reject(new Error("highlight_limit"));
  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe"); frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;left:0;bottom:0;width:1px;height:1px;opacity:0;pointer-events:none;border:0";
    const source = URL.createObjectURL(blob), key = crypto.randomUUID(); let finished = false;
    const finish = (error?: Error, result?: VisualFrame[]) => {
      if (finished) return; finished = true;
      clearTimeout(timer); clearTimeout(startup); signal.removeEventListener("abort", cancel); window.removeEventListener("message", message);
      frame.contentWindow?.postMessage({ type: "cancel" }, "*"); frame.remove(); URL.revokeObjectURL(source);
      if (error) reject(error); else if (result) resolve(result);
    };
    const cancel = () => finish(new DOMException("Cancelled", "AbortError"));
    const startup = setTimeout(() => finish(new Error("visual decoder did not start")), 20000);
    const timer = setTimeout(() => finish(new Error("visual decoder timed out")), 180000);
    const message = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow || event.data?.key !== key || finished) return;
      const data = event.data;
      if (data.type === "ready") { clearTimeout(startup); frame.contentWindow?.postMessage({ type: "sample", key, src: source, clip, windows }, "*"); }
      else if (data.type === "progress") progress(Math.max(0, Math.min(1, Number(data.fraction) || 0)));
      else if (data.type === "error") finish(new Error(String(data.error)));
      else if (data.type === "done") validVisualFrames(data.result, windows) ? finish(undefined, data.result) : finish(new Error("visual_frames_invalid"));
    };
    window.addEventListener("message", message); signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) { cancel(); return; }
    frame.srcdoc = visualFrameDocument(key); document.body.appendChild(frame);
  });
}
