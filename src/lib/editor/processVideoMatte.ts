import type { MediaClip } from "./types";
import { validVideoMatte, type VideoMattePlan, type VideoMatteProgress } from "./videoMatte";
import { VIDEO_MATTE_RUNTIME } from "./videoMatteRuntime";

/** A separate decoder keeps the timeline's video and audio untouched while masks are made. */
export function processVideoMatte(url: string, clip: MediaClip, fps: number, onProgress: (p: VideoMatteProgress) => void, signal?: AbortSignal): Promise<{ plan: VideoMattePlan; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe"); frame.hidden = true; frame.setAttribute("aria-hidden", "true");
    const key = crypto.randomUUID(); let started = false, finished = false;
    let timer: ReturnType<typeof setTimeout>;
    const cleanup = () => { finished = true; frame.contentWindow?.postMessage({ key, type: "cancel" }, "*"); clearTimeout(timer); window.removeEventListener("message", message); signal?.removeEventListener("abort", abort); frame.remove(); };
    const fail = (error: Error) => { cleanup(); reject(error); };
    const abort = () => fail(new DOMException("Background removal cancelled", "AbortError"));
    const deadline = () => { clearTimeout(timer); timer = setTimeout(() => fail(new Error("Background removal stopped responding")), 200000); };
    const message = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow || event.data?.key !== key || finished) return;
      const data = event.data; deadline();
      if (data.type === "ready" && !started) { started = true; frame.contentWindow?.postMessage({ key, url, clip, fps }, "*"); }
      else if (data.type === "progress") onProgress(data.progress);
      else if (data.type === "done") { const r = data.result; if (!r || typeof r.dataUrl !== "string" || !r.dataUrl.startsWith("data:image/png;base64,") || !validVideoMatte({ ...clip, videoMatte: { ...r.plan, mediaId: "pending" } })) { fail(new Error("Invalid background frames")); return; } cleanup(); resolve(r); }
      else if (data.type === "error") fail(new Error(data.error));
    };
    window.addEventListener("message", message); signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    deadline();
    const source = VIDEO_MATTE_RUNTIME + "; var key = " + JSON.stringify(key) + "; var busy = false; var abort = new AbortController(); window.addEventListener('message', function(e) { if(e.source !== parent || !e.data || e.data.key !== key) return; if(e.data.type === 'cancel') { abort.abort(); return; } if(busy) return; busy = true; var d=e.data; createVideoMatte(d.url,d.clip,d.fps,function(progress){ parent.postMessage({key:key,type:'progress',progress:progress},'*'); },abort.signal).then(function(result){parent.postMessage({key:key,type:'done',result:result},'*');},function(error){parent.postMessage({key:key,type:'error',error:String(error.message || error)},'*');}); }); parent.postMessage({key:key,type:'ready'},'*');";
    frame.srcdoc = "<!doctype html><html><body><script>" + source.replace(/<\/script/gi, "<\\/script") + "</script></body></html>";
    document.body.appendChild(frame);
  });
}
