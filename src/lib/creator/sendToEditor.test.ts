import { beforeEach, describe, expect, it, vi } from "vitest";
import { cancelEditorImport, getEditorImportIds, sendJobToEditor, subscribeToEditorImports } from "./sendToEditor";
import type { GenerationJob } from "@/store/generationStore";

const mocks = vi.hoisted(() => ({ turntable: vi.fn(), download: vi.fn(), import: vi.fn(), add: vi.fn(), error: vi.fn(), info: vi.fn(), state: { projectId: "original", currentTime: 2 } }));
vi.mock("./assetDownload", async importOriginal => ({ ...await importOriginal<typeof import('./assetDownload')>(), assetToFile: mocks.download }));
vi.mock("@/lib/editor/modelTurntable", () => ({ renderTurntable: mocks.turntable }));
vi.mock("@/lib/editor/importFiles", () => ({ importOneFile: mocks.import }));
vi.mock("@/store/editorStore", () => ({ useEditorStore: { getState: () => ({ ...mocks.state, addClipFromMedia: mocks.add }) } }));
vi.mock("sonner", () => ({ toast: { error: mocks.error, info: mocks.info } }));
vi.mock("@/i18n", () => ({ default: { t: (key: string) => key } }));

const job = { id: "result-1", kind: "video", url: "https://media.example/result.mp4", prompt: "A moving cat", resolvedPrompt: "", status: "done" } as GenerationJob;
beforeEach(() => {
  vi.clearAllMocks(); mocks.state = { projectId: "original", currentTime: 2 };
  mocks.download.mockResolvedValue(new File(["media"], "result.mp4", { type: "video/webm" }));
  mocks.import.mockResolvedValue("media-1"); mocks.add.mockReturnValue("clip-1");
});

describe("generated media import", () => {
  it('uses the actual balance and username for the shared storage quota', async () => {
    await sendJobToEditor(job, { wallet: 'creator', badgeBalance: 12000000, username: 'maldoteth' });
    expect(mocks.import.mock.calls[0][1]).toMatchObject({ wallet: 'creator', badgeBalance: 12000000, username: 'maldoteth' });
  });
  it('cancels the transfer without importing a late response or reporting failure', async () => {
    let finish!: (file: File) => void;
    mocks.download.mockImplementation(() => new Promise<File>(resolve => { finish = resolve; }));
    const listener = vi.fn(); const unsubscribe = subscribeToEditorImports(listener);
    const pending = sendJobToEditor(job);
    const signal = mocks.download.mock.calls[0][3].signal as AbortSignal;
    expect(getEditorImportIds()).toEqual([job.id]); cancelEditorImport(job.id); expect(signal.aborted).toBe(true);
    finish(new File(['late'], 'result.mp4', { type: 'video/mp4' }));
    expect(await pending).toBeNull(); expect(getEditorImportIds()).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(mocks.import).not.toHaveBeenCalled(); expect(mocks.add).not.toHaveBeenCalled();
    expect(mocks.error).not.toHaveBeenCalled(); unsubscribe();
  });
  it('prevents duplicate transfers after the import panel closes and reopens', async () => {
    let finish!: (file: File) => void;
    mocks.download.mockImplementation(() => new Promise<File>(resolve => { finish = resolve; }));
    const pending = sendJobToEditor(job);
    expect(await sendJobToEditor(job)).toBeNull(); expect(mocks.download).toHaveBeenCalledTimes(1);
    finish(new File(['asset'], 'result.mp4', { type: 'video/mp4' }));
    expect(await pending).toBe('media-1'); expect(mocks.import).toHaveBeenCalledTimes(1); expect(mocks.add).toHaveBeenCalledTimes(1);
  });
  it('does not start another transfer for an already cancelled caller', async () => {
    const controller = new AbortController(); controller.abort();
    expect(await sendJobToEditor(job, { signal: controller.signal })).toBeNull();
    expect(mocks.download).not.toHaveBeenCalled(); expect(getEditorImportIds()).toEqual([]);
  });
  it('cancels after asynchronous storage without adding a clip to the timeline', async () => {
    mocks.import.mockImplementation(async () => { cancelEditorImport(job.id); return 'media-1'; });
    expect(await sendJobToEditor(job)).toBeNull();
    expect(mocks.add).not.toHaveBeenCalled(); expect(mocks.error).not.toHaveBeenCalled();
  });
  it("uses the downloaded format and requested playhead through the existing importer", async () => {
    expect(await sendJobToEditor(job, { wallet: "creator" })).toBe("media-1");
    const [file, context] = mocks.import.mock.calls[0];
    expect(file.name).toBe("a-moving-cat-result-1.webm"); expect(file.type).toBe("video/webm");
    expect(context).toEqual({ wallet: "creator", badgeBalance: undefined, username: undefined, signal: expect.any(AbortSignal) });
    expect(mocks.add).toHaveBeenCalledWith("media-1", undefined, 2);
  });
  it("keeps an import in the library when a different design opens during download", async () => {
    mocks.download.mockImplementation(async () => {
      mocks.state.projectId = "different";
      return new File(["media"], "result.mp4", { type: "video/mp4" });
    });
    expect(await sendJobToEditor(job)).toBeNull();
    expect(mocks.import).toHaveBeenCalledTimes(1); expect(mocks.add).not.toHaveBeenCalled();
    expect(mocks.info).toHaveBeenCalledWith("creator.editorImportedToLibrary");
  });
  it("checks the project again after asynchronous media persistence", async () => {
    mocks.import.mockImplementation(async () => { mocks.state.projectId = "different"; return "media-1"; });
    expect(await sendJobToEditor(job)).toBeNull(); expect(mocks.add).not.toHaveBeenCalled();
  });
  it("uses the original playhead while retaining edits in the same design", async () => {
    mocks.download.mockImplementation(async () => {
      mocks.state.currentTime = 9;
      return new File(["media"], "result.mp4", { type: "video/mp4" });
    });
    await sendJobToEditor(job); expect(mocks.add).toHaveBeenCalledWith("media-1", undefined, 2);
  });
  it.each(["image", "audio"] as const)("imports a %s into the library without a timeline change", async kind => {
    const mime = kind === "image" ? "image/png" : "audio/wav";
    mocks.download.mockResolvedValue(new File(["media"], "output", { type: mime }));
    expect(await sendJobToEditor({ ...job, kind }, { addToTimeline: false })).toBe("media-1");
    expect(mocks.import.mock.calls[0][0].type).toBe(mime); expect(mocks.add).not.toHaveBeenCalled();
  });
  it.each(["text/html", "image/png"])("rejects a %s response for a video without importing it", async mime => {
    mocks.download.mockResolvedValue(new File(["wrong"], "output", { type: mime }));
    expect(await sendJobToEditor(job)).toBeNull(); expect(mocks.import).not.toHaveBeenCalled();
  });
  it("rejects empty responses and unsupported/missing results without editing footage", async () => {
    mocks.download.mockResolvedValue(new File([], "output", { type: "video/mp4" }));
    expect(await sendJobToEditor(job)).toBeNull();
    expect(await sendJobToEditor({ ...job, kind: "model3d", exportFormat: "fbx" } as GenerationJob)).toBeNull();
    expect(await sendJobToEditor({ ...job, url: undefined })).toBeNull();
    expect(await sendJobToEditor({ ...job, url: "javascript:alert(1)" })).toBeNull();
    expect(mocks.import).not.toHaveBeenCalled(); expect(mocks.add).not.toHaveBeenCalled();
  });
  it("brings a glTF mesh in as a turntable video clip", async () => {
    mocks.turntable.mockResolvedValue(new File(["webm"], "3d-turntable.webm", { type: "video/webm" }));
    const mesh = { ...job, kind: "model3d", url: "https://media.example/mesh.glb" } as GenerationJob;
    expect(await sendJobToEditor(mesh)).toBe("media-1");
    expect(mocks.turntable.mock.calls[0][0]).toBe("https://media.example/mesh.glb");
    expect(mocks.download).not.toHaveBeenCalled();
    expect((mocks.import.mock.calls[0][0] as File).type).toBe("video/webm");
    expect(mocks.add).toHaveBeenCalledWith("media-1", undefined, 2);
  });
});
