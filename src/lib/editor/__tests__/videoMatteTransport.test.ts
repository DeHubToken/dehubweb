import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { processVideoMatte } from "../processVideoMatte";
import { videoMattePlan, videoMattePagePlan } from "../videoMatte";
import type { MediaClip } from "../types";
const clip: MediaClip = { id: "v", mediaId: "source", trackId: "t", kind: "video", start: 0, trimIn: 2, duration: 1 };
describe("video mask decoder transport", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal("crypto", { randomUUID: () => "mask-key" }); });
  afterEach(() => { document.querySelectorAll("iframe").forEach(frame => frame.remove()); vi.useRealTimers(); vi.unstubAllGlobals(); });
  function message(frame: HTMLIFrameElement, data: Record<string, unknown>, source = frame.contentWindow) {
    window.dispatchEvent(new MessageEvent("message", { source, data: { key: "mask-key", ...data } }));
  }
  it("compiles the inline decoder, isolates its source and returns complete saved masks", async () => {
    const progress = vi.fn(), pending = processVideoMatte("blob:source", clip, 30, progress);
    const frame = document.querySelector("iframe")!;
    const script = new DOMParser().parseFromString(frame.srcdoc, "text/html").querySelector("script")!.textContent!;
    expect(() => new Function(script)).not.toThrow();
    const post = vi.spyOn(frame.contentWindow!, "postMessage");
    message(frame, { type: "ready" }, window); expect(post).not.toHaveBeenCalled();
    message(frame, { type: "ready" }); expect(post).toHaveBeenCalledWith({ key: "mask-key", url: "blob:source", clip, fps: 30 }, "*");
    message(frame, { type: "progress", progress: { stage: "frames", completed: 15, total: 30, fraction: 0.5 } }); expect(progress).toHaveBeenCalledOnce();
    const result = { plan: videoMattePlan(clip, 640, 360, 5, 30), dataUrl: "data:image/png;base64,AAAA" };
    message(frame, { type: "done", result }); await expect(pending).resolves.toEqual(result); expect(frame.isConnected).toBe(false);
  });
  it("cancels immediately and does not accept malformed source-clock metadata", async () => {
    const controller = new AbortController(), pending = processVideoMatte("blob:source", clip, 30, vi.fn(), controller.signal);
    const failure = expect(pending).rejects.toMatchObject({ name: "AbortError" }); controller.abort(); await failure;
    expect(document.querySelector("iframe")).toBeNull();
    const invalid = processVideoMatte("blob:source", clip, 30, vi.fn()); const rejected = expect(invalid).rejects.toThrow("Invalid background frames");
    message(document.querySelector("iframe")!, { type: "done", result: { plan: { frames: 30 }, dataUrl: "data:image/png;base64,AAAA" } }); await rejected;
  });
  it("releases a decoder that stops reporting progress", async () => {
    const pending = processVideoMatte("blob:source", clip, 30, vi.fn()), failure = expect(pending).rejects.toThrow("stopped responding");
    await vi.advanceTimersByTimeAsync(200000); await failure; expect(document.querySelector("iframe")).toBeNull();
  });
});

describe("paged mask transport", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal("crypto", { randomUUID: () => "mask-key" }); });
  afterEach(() => { document.querySelectorAll("iframe").forEach(frame => frame.remove()); vi.useRealTimers(); vi.unstubAllGlobals(); });
it("acknowledges durable pages in order and refuses completion before storage", async () => {
  const long={...clip,duration:21},plan=videoMattePlan(long,640,360,40,30);
  const controller=new AbortController();let release!:(id:string)=>void;
  const sink=vi.fn(()=>new Promise<string>(resolve=>{release=resolve;}));
  const pending=processVideoMatte("blob:source",long,30,vi.fn(),controller.signal,sink);
  const frame=document.querySelector("iframe")!,post=vi.spyOn(frame.contentWindow!,"postMessage");
  const key="mask-key";
  const send=(data:Record<string,unknown>)=>window.dispatchEvent(new MessageEvent("message",{source:frame.contentWindow,data:{key,...data}}));
  send({type:"ready"});
  send({type:"page",plan,pageIndex:0,page:{...videoMattePagePlan(plan,0),dataUrl:"data:image/png;base64,AAAA"}});
  expect(sink).toHaveBeenCalledOnce();expect(post.mock.calls.some(([data])=>data.type==="pageSaved")).toBe(false);
  release("page-0");await Promise.resolve();expect(post).toHaveBeenLastCalledWith({key,type:"pageSaved",pageIndex:0,mediaId:"page-0"},"*");
  const rejected=expect(pending).rejects.toThrow("Invalid background page");
  send({type:"page",plan,pageIndex:2,page:{...videoMattePagePlan(plan,1),dataUrl:"data:image/png;base64,AAAA"}});await rejected;
});

});
