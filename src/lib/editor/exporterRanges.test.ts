import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportProject } from "./exporter";
import type { ProjectSnapshot } from "./types";

const calls = vi.hoisted(() => ({ draw: vi.fn(), outro: vi.fn(), frame: vi.fn(), close: vi.fn() }));
vi.mock("./render", () => ({ drawClip: calls.draw }));
vi.mock("./brandOutro", async () => ({ ...await vi.importActual<typeof import("./brandOutro")>("./brandOutro"), drawBrandOutro: calls.outro }));
vi.mock("./gif", async () => ({ ...await vi.importActual<typeof import("./gif")>("./gif"), gifWorkerSession: () => ({
  ready: Promise.resolve(), frame: calls.frame, finish: async () => new ArrayBuffer(6), close: calls.close,
}) }));

const snapshot = {
  title: "Range", settings: { width: 16, height: 16, fps: 15, background: "black" },
  tracks: [{ id: "video", kind: "video", hidden: false }, { id: "captions", kind: "text", hidden: false }],
  clips: [
    { id: "video", trackId: "video", kind: "video", mediaId: "source", start: 4, duration: 1, trimIn: 6, speed: 2 },
    { id: "caption", trackId: "captions", kind: "text", start: 4.1, duration: 0.5, trimIn: 0, text: "Keep timing" },
    { id: "later", trackId: "captions", kind: "text", start: 99, duration: 1, trimIn: 0, text: "Later" },
  ],
} as ProjectSnapshot;
let seeks: number[];
beforeEach(() => {
  vi.clearAllMocks(); seeks = [];
  calls.frame.mockResolvedValue(undefined);
  vi.stubGlobal("Image", class {
    onload?: () => void;
    set src(_: string) { queueMicrotask(() => this.onload?.()); }
  });
  const video = {
    duration: 20, readyState: 4, onloadeddata: null as null | (() => void), onerror: null,
    addEventListener: (_: string, cb: () => void) => { handler = cb; }, removeEventListener: () => { handler = undefined; },
    pause: vi.fn(), load: vi.fn(), removeAttribute: vi.fn(),
    set src(_: string) { queueMicrotask(() => this.onloadeddata?.()); },
    get currentTime() { return time; }, set currentTime(value: number) { time = value; seeks.push(value); queueMicrotask(() => handler?.()); },
  };
  let handler: (() => void) | undefined, time = 0;
  const context = { clearRect: vi.fn(), fillRect: vi.fn(), save: vi.fn(), restore: vi.fn(), getImageData: () => ({ data: new Uint8ClampedArray(16 * 16 * 4) }) };
  vi.spyOn(document, "createElement").mockImplementation(((name: string) => name === "video" ? video : { getContext: () => context }) as typeof document.createElement);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("range rendering", () => {
  it("renders a one-second cut from a long project at its original source and caption times", async () => {
    const before = JSON.stringify(snapshot);
    await exportProject({ snapshot, media: [{ id: "source", kind: "video", url: "blob:source", name: "source", size: 1, mimeType: "video/mp4", createdAt: 0 }], format: "gif", scale: 1, videoBitrate: 0, range: { start: 4, end: 5 }, username: "creator" });
    const content = calls.draw.mock.calls.filter(c => c[3].id === "video");
    expect(content).toHaveLength(15); expect(content[0][4]).toBe(4); expect(content.at(-1)![4]).toBeCloseTo(4 + 14 / 15);
    expect(seeks[0]).toBe(6); expect(seeks.at(-1)).toBeCloseTo(6 + 28 / 15);
    const captions = calls.draw.mock.calls.filter(c => c[3].id === "caption");
    expect(captions.length).toBeGreaterThan(0); expect(captions.every(c => c[4] >= 4.1 && c[4] < 4.6)).toBe(true);
    expect(calls.draw.mock.calls.some(c => c[3].id === "later")).toBe(false);
    expect(calls.outro.mock.calls[0][3]).toBe(0); expect(calls.outro.mock.calls[0][4]).toBe("creator");
    expect(calls.frame).toHaveBeenCalledTimes(48); expect(calls.close).toHaveBeenCalled();
    expect(JSON.stringify(snapshot)).toBe(before);
  });
  it("stops rendering subsequent frames after cancellation", async () => {
    const ctl = new AbortController(); calls.frame.mockImplementationOnce(async () => { ctl.abort(); });
    await expect(exportProject({ snapshot, media: [], format: "gif", scale: 1, videoBitrate: 0, range: { start: 4, end: 5 }, signal: ctl.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(calls.frame).toHaveBeenCalledTimes(1); expect(calls.close).toHaveBeenCalled();
  });
});
