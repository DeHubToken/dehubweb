import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { processClipShots, shotScanDocument } from "../processClipShots";
import { SHOT_RUNTIME } from "../shotRuntime";
import type { MediaClip } from "../types";
describe("scene decoder page", () => {
  it("closes the HTML script and compiles the complete handshake and scanner", () => {
    const html = shotScanDocument("scan-key");
    expect(html).toContain(SHOT_RUNTIME);
    expect(html.endsWith("</script>")).toBe(true);
    const document = new DOMParser().parseFromString(html, "text/html");
    const script = document.querySelector("script")!.textContent!;
    expect(script).not.toContain("</script>");
    expect(script).toContain("scan-key");
    expect(() => new Function(script)).not.toThrow();
  });
});

describe("scene decoder transport", () => {
  const clip = { kind: "video", duration: 6, trimIn: 0, speed: 1 } as MediaClip;
  const create = vi.fn(), revoke = vi.fn();
  beforeEach(() => {
    vi.useFakeTimers();
    create.mockReset().mockReturnValue("blob:media"); revoke.mockReset();
    vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: revoke });
    vi.stubGlobal("crypto", { randomUUID: () => "scan-key" });
  });
  afterEach(() => { document.querySelectorAll("iframe").forEach(frame => frame.remove()); vi.useRealTimers(); vi.unstubAllGlobals(); });
  function message(frame: HTMLIFrameElement, data: Record<string, unknown>, source = frame.contentWindow) {
    window.dispatchEvent(new MessageEvent("message", { source, data: { key: "scan-key", ...data } }));
  }
  it("loads the scanner inline, isolates its handshake and releases only the source URL", async () => {
    const progress = vi.fn(), result = { times: [2, 4], sampled: 25, precision: 0.016 };
    const pending = processClipShots(new Blob(), clip, undefined, progress);
    const frame = document.querySelector("iframe")!;
    expect(frame.srcdoc).toContain(SHOT_RUNTIME);
    expect(frame.getAttribute("src")).toBeNull();
    expect(create).toHaveBeenCalledTimes(1);
    const post = vi.spyOn(frame.contentWindow!, "postMessage");
    message(frame, { type: "ready" }, window);
    expect(post).not.toHaveBeenCalled();
    message(frame, { type: "ready" });
    expect(post).toHaveBeenCalledWith({ type: "scan", key: "scan-key", src: "blob:media", clip }, "*");
    message(frame, { type: "progress", fraction: 0.5 });
    expect(progress).toHaveBeenCalledWith(0.5);
    message(frame, { type: "done", result });
    await expect(pending).resolves.toEqual(result);
    expect(frame.isConnected).toBe(false);
    expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:media");
  });
  it("cleans up when the frame never starts", async () => {
    const pending = processClipShots(new Blob(), clip);
    const failure = expect(pending).rejects.toThrow("scene scanner did not start");
    await vi.advanceTimersByTimeAsync(20000); await failure;
    expect(document.querySelector("iframe")).toBeNull();
    expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:media");
  });
  it("cancels startup without waiting for the timeout", async () => {
    const controller = new AbortController(), pending = processClipShots(new Blob(), clip, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(document.querySelector("iframe")).toBeNull();
    expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:media");
  });
});
