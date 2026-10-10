import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { FreeAssetPreview } from "./FreeAssetPreview";
import type { FreeAsset } from "@/lib/editor/freeAssets";

const source: FreeAsset = { id: "one", source: "Wikimedia Commons", kind: "video", title: "Ocean", creator: "Creator", thumbnailUrl: "https://media/thumb.jpg", downloadUrl: "https://media/ocean.webm", landingUrl: "https://media/source", mimeType: "video/webm", license: "CC0", attributionRequired: false, attributionText: "Ocean" };
const pause = vi.fn();
beforeEach(() => { pause.mockClear(); vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(pause); vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("stock media preview", () => {
  it("plays the selected video with phone playback controls and its actual source", () => {
    const view = render(<FreeAssetPreview asset={source} onClose={() => {}} />);
    const video = view.container.querySelector("video")!;
    expect(video.src).toBe(source.downloadUrl); expect(video.controls).toBe(true); expect(video.playsInline).toBe(true);
  });
  it("stops and unloads video when the preview closes", () => {
    const view = render(<FreeAssetPreview asset={source} onClose={() => {}} />), video = view.container.querySelector("video")!;
    view.unmount(); expect(pause).toHaveBeenCalled(); expect(video.getAttribute("src")).toBeNull();
  });
  it("stops the previous audio source before previewing a different asset", () => {
    const audio = { ...source, kind: "audio" as const, mimeType: "audio/ogg", downloadUrl: "https://media/audio.ogg" };
    const view = render(<FreeAssetPreview asset={audio} onClose={() => {}} />), element = view.container.querySelector("audio")!;
    view.rerender(<FreeAssetPreview asset={source} onClose={() => {}} />);
    expect(pause).toHaveBeenCalled(); expect(element.getAttribute("src")).toBeNull(); expect(view.container.querySelector("video")!.src).toBe(source.downloadUrl);
  });
  it("pauses playback when the editor is backgrounded", () => {
    render(<FreeAssetPreview asset={source} onClose={() => {}} />);
    vi.spyOn(document, "hidden", "get").mockReturnValue(true); fireEvent(document, new Event("visibilitychange")); expect(pause).toHaveBeenCalled();
  });
  it("stops a failing media preview and leaves its close action available", () => {
    const close = vi.fn(), view = render(<FreeAssetPreview asset={source} onClose={close} />);
    fireEvent.error(view.container.querySelector("video")!); expect(view.getByText(/preview could not load/)).toBeTruthy(); expect(pause).toHaveBeenCalled();
    fireEvent.click(view.getByRole("button", { name: "Close preview" })); expect(close).toHaveBeenCalledTimes(1);
  });
});
