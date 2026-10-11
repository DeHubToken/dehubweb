import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { renderVideoDownload } from "../downloadVideo";
import { endingBytes } from "../endingFile";
const mocks = vi.hoisted(() => ({ render: vi.fn(), supported: vi.fn(), legacy: vi.fn(), artwork: vi.fn() }));
vi.mock("../exporter", () => ({ exportProject: mocks.render, isExportSupported: mocks.supported }));
vi.mock("../endingVisual", () => ({ legacyEndingBoundary: mocks.legacy }));
vi.mock("../brandOutroArtwork", () => ({ loadBrandOutroArtwork: mocks.artwork }));

describe("feed export integration", () => {
  let tail: Uint8Array;
  let duration: number;
  let loaded: boolean;
  const create = vi.fn(), revoke = vi.fn(), pause = vi.fn(), remove = vi.fn();
  beforeEach(() => {
    tail = new Uint8Array(); duration = 5; loaded = true;
    mocks.render.mockReset().mockResolvedValue({ blob: new Blob(), filename: "creator.mp4" });
    mocks.supported.mockReset().mockReturnValue(true);
    mocks.legacy.mockReset().mockResolvedValue(null);
    mocks.artwork.mockReset().mockResolvedValue({ logo: {} });
    create.mockReset().mockReturnValue("blob:source"); revoke.mockReset(); pause.mockReset(); remove.mockReset();
    const video = {
      onloadeddata: null as (() => void) | null, onerror: null,
      get duration() { return duration; }, videoWidth: 1080, videoHeight: 1920,
      pause, removeAttribute: remove, load: vi.fn(),
      set src(_url: string) { if (loaded) queueMicrotask(() => video.onloadeddata?.()); },
    };
    vi.stubGlobal("document", { createElement: () => video });
    vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: revoke });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, blob: async () => ({
      size: 500, type: "video/mp4", slice: () => ({ arrayBuffer: async () => tail.buffer }),
    }) }));
  });
  afterEach(() => vi.unstubAllGlobals());
  it("keeps all content, passes creator credit and releases the decoder and URL", async () => {
    const controller = new AbortController(), progress = vi.fn();
    await renderVideoDownload({ url: "https://cdn/video.mp4", username: "creator" }, controller.signal, progress);
    expect(mocks.render.mock.calls[0][0]).toMatchObject({
      username: "creator", signal: controller.signal, format: "mp4",
      snapshot: { clips: [{ duration: 5, trimIn: 0, speed: 1 }], settings: { width: 1080, height: 1920 } },
    });
    mocks.render.mock.calls[0][0].onProgress(0.5);
    expect(progress).toHaveBeenCalledWith(0.5);
    mocks.render.mock.calls[0][0].onProgress(0.75, "Encoding frame 440 / 970");
    expect(progress).toHaveBeenCalledWith(0.75, "Encoding frame 440 / 970");
    expect(revoke).toHaveBeenCalledWith("blob:source"); expect(pause).toHaveBeenCalled();
  });
  it("replaces tagged and visually recognised endings without extending the content", async () => {
    duration = 12.2; tail = endingBytes(10, "mp4");
    await renderVideoDownload({ url: "https://cdn/video.mp4", username: "owner" }, new AbortController().signal);
    expect(mocks.render.mock.calls[0][0].snapshot.clips[0].duration).toBe(10);
    expect(mocks.legacy).not.toHaveBeenCalled();
    tail = new Uint8Array(); mocks.legacy.mockResolvedValue(10);
    await renderVideoDownload({ url: "https://cdn/legacy.mp4" }, new AbortController().signal);
    expect(mocks.render.mock.calls[1][0].snapshot.clips[0].duration).toBe(10);
  });
  it("cancels loading, releases resources and never falls back to a raw download", async () => {
    loaded = false;
    const controller = new AbortController();
    const pending = renderVideoDownload({ url: "https://cdn/video.mp4" }, controller.signal);
    await vi.waitFor(() => expect(create).toHaveBeenCalled());
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(mocks.render).not.toHaveBeenCalled(); expect(revoke).toHaveBeenCalledWith("blob:source");
  });
  it("rejects failed source requests and unsupported encoding before rendering", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 403 } as Response);
    await expect(renderVideoDownload({ url: "https://cdn/video.mp4" }, new AbortController().signal)).rejects.toThrow("403");
    mocks.supported.mockReturnValue(false);
    await expect(renderVideoDownload({ url: "https://cdn/video.mp4" }, new AbortController().signal)).rejects.toThrow("unavailable");
    expect(mocks.render).not.toHaveBeenCalled();
  });
});
