import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "@/store/editorStore";
import { applyOps } from "./agent";
import { beginEditorCommand } from "./editorCommand";
import { applyTemplate, type EditorTemplate } from "./templates";
import type { FreeAssetSearch } from "./freeAssets";
import type { ProjectSnapshot, MediaClip } from "./types";

const bridges = vi.hoisted(() => ({ search: vi.fn(), download: vi.fn(), importFile: vi.fn(), sound: vi.fn(), media: vi.fn() }));
vi.mock("./freeAssets", () => ({ searchFreeAssets: bridges.search, downloadFreeAsset: bridges.download, provenanceForAsset: () => undefined }));
vi.mock("./importFiles", () => ({ importOneFile: bridges.importFile }));
vi.mock("./processClipSound", () => ({ processClipSound: bridges.sound }));
vi.mock("./mediaStore", () => ({ getMedia: bridges.media, deleteMedia: vi.fn() }));
const fixture = (): ProjectSnapshot => ({ id: "request-project", title: "Commands", updatedAt: 1,
  settings: { width: 1920, height: 1080, fps: 30, aspectPreset: "16:9", background: "#000000" },
  tracks: [{ id: "v", kind: "video", name: "Video", muted: false, hidden: false }],
  clips: ["a", "b"].map((id, index) => ({ id, kind: "video" as const, trackId: "v", mediaId: "source", start: index * 5, trimIn: 0, duration: 5, sourceDuration: 20 })) });
const stock: FreeAssetSearch = { items: [{ id: "asset", source: "Pixabay", kind: "video", title: "Ocean", creator: "Creator", thumbnailUrl: "https://example.com/thumbnail", downloadUrl: "https://example.com/video", landingUrl: "https://example.com/asset", mimeType: "video/mp4", license: "CC0", attributionRequired: false, attributionText: "" }], page: 1, providers: ["Pixabay"], hasMore: false };
const clip = (id: string) => useEditorStore.getState().clips.find(item => item.id === id)! as MediaClip;
beforeEach(() => {
  vi.clearAllMocks(); useEditorStore.getState().loadSnapshot(fixture()); useEditorStore.getState().setMedia([]);
  bridges.download.mockResolvedValue(new File(["fixture"], "stock.mp4", { type: "video/mp4" }));
  bridges.importFile.mockImplementation(async (file: File) => {
    useEditorStore.getState().addMedia({ id: "imported", name: file.name, kind: file.type.startsWith("audio") ? "audio" : "video", mimeType: file.type, size: file.size, duration: 5, createdAt: 1, url: "blob:imported" }); return "imported";
  });
  bridges.media.mockResolvedValue({ id: "source", name: "source.mp4", kind: "video", mimeType: "video/mp4", size: 7, createdAt: 1, duration: 20, blob: new Blob(["fixture"]) });
});
function deferredStock() {
  let finish!: (value: FreeAssetSearch) => void, fail!: (error: Error) => void;
  const pending = new Promise<FreeAssetSearch>((resolve, reject) => { finish = resolve; fail = reject; });
  bridges.search.mockReturnValue(pending); return { finish: () => finish(stock), fail };
}

describe("the real command executor while providers are pending", () => {
  it("keeps one request Undo separate from an independent edit during stock search", async () => {
    const pending = deferredStock();
    const execution = applyOps([{ op: "effects", id: "a", brightness: 1.2 }, { op: "add_stock", kind: "video", query: "ocean" }, { op: "effects", id: "a", contrast: 1.3 }]);
    await vi.waitFor(() => expect(bridges.search).toHaveBeenCalled());
    useEditorStore.getState().patchClip("b", { duration: 3 }); pending.finish();
    expect(await execution).toMatchObject({ applied: 3, failed: 0 }); expect(useEditorStore.getState().past).toHaveLength(2);
    useEditorStore.getState().undo(); expect(clip("a").effects).toBeUndefined(); expect(clip("b").duration).toBe(3); expect(useEditorStore.getState().clips).toHaveLength(2);
    useEditorStore.getState().undo(); expect(clip("b").duration).toBe(5);
    useEditorStore.getState().redo(); useEditorStore.getState().redo(); expect(clip("a").effects).toMatchObject({ brightness: 1.2, contrast: 1.3 }); expect(useEditorStore.getState().clips).toHaveLength(3);
    expect(useEditorStore.getState().editing).toBe(false);
  });
  it("does not download or import a result after the command was undone", async () => {
    const pending = deferredStock(); const execution = applyOps([{ op: "effects", id: "a", brightness: 1.2 }, { op: "add_stock", kind: "video", query: "ocean" }]);
    await vi.waitFor(() => expect(bridges.search).toHaveBeenCalled()); useEditorStore.getState().undo(); pending.finish();
    expect(await execution).toMatchObject({ applied: 1, failed: 1 }); expect(bridges.download).not.toHaveBeenCalled(); expect(bridges.importFile).not.toHaveBeenCalled();
    expect(clip("a").effects).toBeUndefined(); expect(useEditorStore.getState().future).toHaveLength(1); expect(useEditorStore.getState().editing).toBe(false);
  });
  it("rejects an old same-ID completion without releasing a newer command", async () => {
    const pending = deferredStock(); const execution = applyOps([{ op: "add_stock", kind: "video", query: "ocean" }]);
    await vi.waitFor(() => expect(bridges.search).toHaveBeenCalled()); useEditorStore.getState().loadSnapshot(fixture()); const fresh = beginEditorCommand(); pending.finish();
    expect(await execution).toMatchObject({ failed: 1 }); expect(bridges.importFile).not.toHaveBeenCalled(); expect(fresh.isCurrent()).toBe(true); expect(useEditorStore.getState().editing).toBe(true);
    fresh.release(); expect(useEditorStore.getState().past).toHaveLength(0);
  });
  it("leaves the independent edit as the latest Undo when stock fails", async () => {
    const pending = deferredStock(); const execution = applyOps([{ op: "effects", id: "a", brightness: 1.2 }, { op: "add_stock", kind: "video", query: "ocean" }]);
    await vi.waitFor(() => expect(bridges.search).toHaveBeenCalled()); useEditorStore.getState().patchClip("b", { duration: 3 }); pending.fail(new Error("offline"));
    expect(await execution).toMatchObject({ applied: 1, failed: 1, missingStock: ["ocean"] });
    useEditorStore.getState().undo(); expect(clip("b").duration).toBe(5); expect(clip("a").effects).toMatchObject({ brightness: 1.2 });
    useEditorStore.getState().undo(); expect(clip("a").effects).toBeUndefined(); expect(useEditorStore.getState().editing).toBe(false);
  });
  it("keeps a canvas edit while undoing a template with delayed stock", async () => {
    const pending = deferredStock();
    const template: EditorTemplate = { id: "pending", kind: "video", aspect: "16:9", preview: { bg: "#000000", fg: "#ffffff", font: "Inter" }, titleKey: "pending", ops: () => [{ op: "add_stock", kind: "video", query: "ocean" }] };
    const execution = applyTemplate(template, ((key: string) => key) as unknown as import("i18next").TFunction);
    await vi.waitFor(() => expect(bridges.search).toHaveBeenCalled()); useEditorStore.getState().updateSettings({ background: "#112233" }); pending.finish(); await execution;
    useEditorStore.getState().undo(); expect(useEditorStore.getState().clips.map(item => item.id)).toEqual(["a", "b"]); expect(useEditorStore.getState().settings.background).toBe("#112233");
    useEditorStore.getState().undo(); expect(useEditorStore.getState().settings.background).toBe("#000000"); expect(useEditorStore.getState().editing).toBe(false);
  });
  it("includes a real delayed audio-tool commit in the command Undo", async () => {
    let finish!: (value: { wav: Uint8Array }) => void;
    bridges.sound.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const execution = applyOps([{ op: "effects", id: "a", brightness: 1.2 }, { op: "process_audio", id: "a", mode: "voice" }]);
    await vi.waitFor(() => expect(bridges.sound).toHaveBeenCalled()); useEditorStore.getState().patchClip("b", { duration: 3 }); finish({ wav: new Uint8Array(32) });
    expect(await execution).toMatchObject({ applied: 2, failed: 0 }); expect(useEditorStore.getState().clips.some(item => item.kind === "audio")).toBe(true);
    useEditorStore.getState().undo(); expect(clip("a").effects).toBeUndefined(); expect(clip("a").audio).toBeUndefined(); expect(clip("b").duration).toBe(3); expect(useEditorStore.getState().clips).toHaveLength(2);
    useEditorStore.getState().undo(); expect(clip("b").duration).toBe(5); expect(useEditorStore.getState().editing).toBe(false);
  });
});
