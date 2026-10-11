import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useVideoDownload } from "./use-video-download";

const mocks = vi.hoisted(() => ({
  render: vi.fn(), loading: vi.fn(), success: vi.fn(), info: vi.fn(), error: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: mocks }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/lib/editor/downloadVideo", () => ({ renderVideoDownload: mocks.render }));
const request = { url: "https://example.com/video.mp4", username: "creator" };
const output = () => ({ blob: new Blob(["video"], { type: "video/mp4" }), filename: "video.mp4" });
const terminal = { id: "branded-video-download", action: undefined, duration: 6000 };

beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers();
  const OriginalURL = URL;
  vi.stubGlobal("URL", class extends OriginalURL {
    static createObjectURL = vi.fn(() => "blob:download");
    static revokeObjectURL = vi.fn();
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("video download terminal notifications", () => {
  it("removes cancellation on success and ignores progress and Cancel from the finished job", async () => {
    let progress!: (fraction: number, label?: string) => void;
    let signal!: AbortSignal;
    mocks.render.mockImplementation(async (_request, currentSignal, onProgress) => {
      signal = currentSignal; progress = onProgress; progress(0.47, "Encoding frames"); return output();
    });
    const { result } = renderHook(useVideoDownload);
    await act(async () => { await result.current(request); });
    expect(mocks.success).toHaveBeenCalledWith("editor.export.done", terminal);
    expect(mocks.loading).toHaveBeenCalledTimes(2);
    const oldCancel = mocks.loading.mock.calls[0][1].action.onClick;
    oldCancel(); progress(0.9, "Late progress");
    expect(signal.aborted).toBe(false);
    expect(mocks.loading).toHaveBeenCalledTimes(2);
    await act(async () => { await result.current(request); });
    expect(mocks.render).toHaveBeenCalledTimes(2);
  });

  it("removes the action and pinned duration when the active export is cancelled", async () => {
    let progress!: (fraction: number) => void;
    mocks.render.mockImplementation((_request, signal: AbortSignal, onProgress) => {
      progress = onProgress;
      return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new DOMException("Cancelled", "AbortError")), { once: true }));
    });
    const { result } = renderHook(useVideoDownload);
    const pending = result.current(request);
    await vi.waitFor(() => expect(mocks.render).toHaveBeenCalledTimes(1));
    mocks.loading.mock.calls[0][1].action.onClick();
    await act(async () => { await pending; });
    expect(mocks.info).toHaveBeenCalledWith("editor.export.cancelled", terminal);
    const loadingCount = mocks.loading.mock.calls.length;
    progress(0.8);
    expect(mocks.loading).toHaveBeenCalledTimes(loadingCount);
    expect(mocks.success).not.toHaveBeenCalled(); expect(mocks.error).not.toHaveBeenCalled();
  });

  it("clears cancellation after failure, retains diagnostics and allows another download", async () => {
    mocks.render.mockImplementationOnce(async (_request, _signal, progress) => {
      progress(0.47, "Encoding frame 450"); throw new Error("Encoder stalled");
    }).mockResolvedValue(output());
    const { result } = renderHook(useVideoDownload);
    await act(async () => { await result.current(request); });
    expect(mocks.error).toHaveBeenCalledWith("editor.export.failed", terminal);
    expect(console.warn).toHaveBeenCalledWith("[Video download] Failed", expect.objectContaining({ stage: "Encoding frame 450", progress: 0.47 }));
    await act(async () => { await result.current(request); });
    expect(mocks.success).toHaveBeenCalledWith("editor.export.done", terminal);
  });
});
