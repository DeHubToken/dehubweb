import type { MediaClip } from "./types";
import { validVideoMatte, validVideoMattePageOutput, type VideoMattePage, type VideoMattePageSink, type VideoMatteProgress, type VideoMatteResult } from "./videoMatte";
import { VIDEO_MATTE_RUNTIME } from "./videoMatteRuntime";

/** A separate decoder keeps the timeline's video and audio untouched while masks are made. */
export function processVideoMatte(url: string, clip: MediaClip, fps: number, onProgress: (p: VideoMatteProgress) => void, signal?: AbortSignal, storePage?: VideoMattePageSink): Promise<VideoMatteResult> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe"); frame.hidden = true; frame.setAttribute("aria-hidden", "true");
    const key = crypto.randomUUID(); let started = false, finished = false, storing = false;
    const pages: VideoMattePage[] = [];
    let planKey: string | undefined;
    let timer: ReturnType<typeof setTimeout>;
    const cleanup = () => { finished = true; frame.contentWindow?.postMessage({ key, type: "cancel" }, "*"); clearTimeout(timer); window.removeEventListener("message", message); signal?.removeEventListener("abort", abort); frame.remove(); };
    const fail = (error: Error) => { if (finished) return; cleanup(); reject(error); };
    const abort = () => fail(new DOMException("Background removal cancelled", "AbortError"));
    const deadline = () => { clearTimeout(timer); timer = setTimeout(() => fail(new Error("Background removal stopped responding")), 200000); };
    const message = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow || event.data?.key !== key || finished) return;
      const data = event.data; deadline();
      if (data.type === "ready" && !started) { started = true; frame.contentWindow?.postMessage({ key, url, clip, fps, ...(storePage ? { paged: true } : {}) }, "*"); }
      else if (data.type === "progress") onProgress(data.progress);
      else if (data.type === "page") {
        if (!storePage || storing || data.pageIndex !== pages.length || data.plan?.fps !== fps || !validVideoMattePageOutput(clip, data.plan, data.page, data.pageIndex) || (planKey !== undefined && planKey !== JSON.stringify(data.plan))) { fail(new Error("Invalid background page")); return; }
        planKey = JSON.stringify(data.plan); storing = true;
        void storePage(data.page, data.plan, data.pageIndex).then(id => {
          if (finished) return;
          if (typeof id !== "string" || !id.length || pages.some(p => p.mediaId === id)) throw new Error("Invalid background page ID");
          const { dataUrl: _dataUrl, ...page } = data.page;
          pages.push({ ...page, mediaId: id }); storing = false; deadline();
          frame.contentWindow?.postMessage({ key, type: "pageSaved", pageIndex: data.pageIndex, mediaId: id }, "*");
        }).catch(error => fail(error instanceof Error ? error : new Error(String(error))));
      }
      else if (data.type === "done") {
        const r = data.result;
        const complete = storePage
          ? r?.matte && !storing && planKey === JSON.stringify(r.plan) && JSON.stringify(r.matte) === JSON.stringify({ ...r.plan, mediaId: pages[0]?.mediaId, pages }) && validVideoMatte({ ...clip, videoMatte: r.matte })
          : r && typeof r.dataUrl === "string" && r.dataUrl.startsWith("data:image/png;base64,") && validVideoMatte({ ...clip, videoMatte: { ...r.plan, mediaId: "pending" } });
        if (!complete) { fail(new Error("Invalid background frames")); return; }
        cleanup(); resolve(r);
      }
      else if (data.type === "error") fail(new Error(data.error));
    };
    window.addEventListener("message", message); signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    deadline();
    const source = VIDEO_MATTE_RUNTIME + "; var key = " + JSON.stringify(key) + ";" + String.raw`
      var busy = false, abort = new AbortController(), pendingPage = null;
      function storePage(page, plan, pageIndex) {
        return new Promise(function(resolve, reject) {
          function cancelled() { pendingPage = null; reject(new DOMException('Background removal cancelled', 'AbortError')); }
          if (abort.signal.aborted) { cancelled(); return; }
          abort.signal.addEventListener('abort', cancelled, { once: true });
          pendingPage = { pageIndex: pageIndex, resolve: function(id) { abort.signal.removeEventListener('abort', cancelled); pendingPage = null; resolve(id); } };
          parent.postMessage({key:key,type:'page',page:page,plan:plan,pageIndex:pageIndex},'*');
        });
      }
      window.addEventListener('message', function(e) {
        if(e.source !== parent || !e.data || e.data.key !== key) return;
        var d = e.data;
        if(d.type === 'cancel') { abort.abort(); return; }
        if(d.type === 'pageSaved') { if(pendingPage && d.pageIndex === pendingPage.pageIndex) pendingPage.resolve(d.mediaId); return; }
        if(busy) return; busy = true;
        createVideoMatte(d.url,d.clip,d.fps,function(progress){ parent.postMessage({key:key,type:'progress',progress:progress},'*'); },abort.signal,d.paged ? storePage : null).then(function(result){parent.postMessage({key:key,type:'done',result:result},'*');},function(error){parent.postMessage({key:key,type:'error',error:String(error.message || error)},'*');});
      });
      parent.postMessage({key:key,type:'ready'},'*');`;
    frame.srcdoc = "<!doctype html><html><body><script>" + source.replace(/<\/script/gi, "<\\/script") + "</script></body></html>";
    document.body.appendChild(frame);
  });
}
