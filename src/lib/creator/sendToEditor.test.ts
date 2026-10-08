import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendJobToEditor } from "./sendToEditor";
import type { GenerationJob } from "@/store/generationStore";

const mocks = vi.hoisted(() => ({ download: vi.fn(), import: vi.fn(), add: vi.fn(), error: vi.fn(), info: vi.fn(), state: { projectId: "original", currentTime: 2 } }));
vi.mock("./generationEngine", () => ({ assetToFile: mocks.download }));
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
  it("uses the downloaded format and requested playhead through the existing importer", async () => {
    expect(await sendJobToEditor(job, { wallet: "creator" })).toBe("media-1");
    const [file, context] = mocks.import.mock.calls[0];
    expect(file.name).toBe("a-moving-cat-result-1.webm"); expect(file.type).toBe("video/webm");
    expect(context).toEqual({ wallet: "creator" });
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
    expect(await sendJobToEditor({ ...job, kind: "model3d" })).toBeNull();
    expect(await sendJobToEditor({ ...job, url: undefined })).toBeNull();
    expect(await sendJobToEditor({ ...job, url: "javascript:alert(1)" })).toBeNull();
    expect(mocks.import).not.toHaveBeenCalled(); expect(mocks.add).not.toHaveBeenCalled();
  });
});
