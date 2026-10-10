import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "@/store/editorStore";
import { applyAutoEnhance } from "./applyAutoEnhance";
import { applyAudioTool } from "./applyAudioTool";
import { applyBeatTool } from "./applyBeatTool";
import { autoEnhanceEffects } from "./autoEnhance";
import { projectReviewSnapshotKey } from "./cloudProjectReview";
import type { ClipEffects } from "./types";

const services = vi.hoisted(() => ({ sound: vi.fn(), getMedia: vi.fn(), importFile: vi.fn() }));
vi.mock("./autoEnhance", () => ({ autoEnhanceEffects: vi.fn() }));
vi.mock("./mediaStore", () => ({ getMedia: services.getMedia }));
vi.mock("./processClipSound", () => ({ processClipSound: services.sound }));
vi.mock("./importFiles", () => ({ importOneFile: services.importFile }));

beforeEach(() => {
  vi.resetAllMocks();
  useEditorStore.getState().newProject();
  useEditorStore.setState({
    tracks: [{ id: "v", kind: "video", name: "Video", hidden: false, muted: false }],
    clips: [
      { id: "image", kind: "image", trackId: "v", mediaId: "picture", start: 0, trimIn: 0, duration: 10 },
      { id: "video", kind: "video", trackId: "v", mediaId: "footage", start: 0, trimIn: 0, duration: 10 },
    ],
    media: [{ id: "picture", kind: "image", name: "Picture", mimeType: "image/png", width: 640, height: 360, size: 1, createdAt: 1, url: "blob:picture" }],
  });
  services.getMedia.mockResolvedValue({ id: "footage", kind: "video", name: "Film.mp4", blob: new Blob(), mimeType: "video/mp4", size: 1, createdAt: 1 });
  services.importFile.mockResolvedValue("processed");
});

function enhance() {
  let done!: (effects: ClipEffects) => void;
  vi.mocked(autoEnhanceEffects).mockImplementation(() => new Promise(resolve => { done = resolve; }));
  return { result: applyAutoEnhance("image"), done: () => done({ brightness: 1.2 }) };
}

describe("real processing tools and timeline ownership", () => {
  it("excludes receiving before the first enhancement result and creates one Undo", async () => {
    const before = useEditorStore.getState().toSnapshot();
    const run = enhance();
    expect(useEditorStore.getState().editing).toBe(true);
    expect(useEditorStore.getState().past).toHaveLength(0);
    expect(() => useEditorStore.getState().applySharedSnapshot(before, projectReviewSnapshotKey(before))).toThrow("project changed");
    run.done(); expect(await run.result).toBe(true);
    expect(useEditorStore.getState().editing).toBe(false);
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().clips[0]).not.toHaveProperty("effects");
    expect(useEditorStore.getState().past).toHaveLength(0);
  });

  it("keeps independent edits made while an image is being measured", async () => {
    const run = enhance();
    useEditorStore.getState().updateMediaClip("video", { duration: 7 });
    run.done(); expect(await run.result).toBe(true);
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().clips[1].duration).toBe(7);
    expect(useEditorStore.getState().clips[0]).not.toHaveProperty("effects");
  });

  it("discards a result after a same-ID reset and preserves newer ownership", async () => {
    const before = useEditorStore.getState().toSnapshot(), run = enhance();
    useEditorStore.getState().loadSnapshot(before);
    const next = useEditorStore.getState().holdEdits();
    run.done(); expect(await run.result).toBe(false);
    expect(next.isCurrent()).toBe(true);
    expect(useEditorStore.getState().past).toHaveLength(0);
    next.release();
  });

  it("discards a result if the source clip changes", async () => {
    const run = enhance(); useEditorStore.getState().updateMediaClip("image", { locked: true });
    run.done(); expect(await run.result).toBe(false);
    expect(useEditorStore.getState().clips[0]).toMatchObject({ locked: true });
    expect(useEditorStore.getState().clips[0]).not.toHaveProperty("effects");
    expect(useEditorStore.getState().editing).toBe(false);
  });

  it("releases a failed operation without clearing Redo", async () => {
    useEditorStore.getState().updateMediaClip("video", { duration: 7 }); useEditorStore.getState().undo();
    vi.mocked(autoEnhanceEffects).mockRejectedValue(new Error("decode failed"));
    await expect(applyAutoEnhance("image")).rejects.toThrow("decode failed");
    expect(useEditorStore.getState().editing).toBe(false);
    useEditorStore.getState().redo(); expect(useEditorStore.getState().clips[1].duration).toBe(7);
  });

  it("does not revive processing after the editor relinquishes ownership", async () => {
    const run = enhance(); useEditorStore.getState().cancelPendingEdits();
    run.done(); expect(await run.result).toBe(false);
    expect(useEditorStore.getState().past).toHaveLength(0);
    expect(useEditorStore.getState().editing).toBe(false);
  });

  it("holds audio processing until its single soundtrack edit is complete", async () => {
    let done!: (value: { wav: ArrayBuffer }) => void;
    services.sound.mockImplementation(() => new Promise(resolve => { done = resolve; }));
    const result = applyAudioTool("video", "normalize"); await Promise.resolve();
    expect(useEditorStore.getState().editing).toBe(true);
    done({ wav: new ArrayBuffer(44) }); expect(await result).toBe(true);
    expect(useEditorStore.getState().editing).toBe(false);
    useEditorStore.getState().undo(); expect(useEditorStore.getState().clips).toHaveLength(2);
    expect(useEditorStore.getState().past).toHaveLength(0);
  });

  it("discards old audio after reset without importing its result", async () => {
    let done!: (value: { wav: ArrayBuffer }) => void;
    services.sound.mockImplementation(() => new Promise(resolve => { done = resolve; }));
    const before = useEditorStore.getState().toSnapshot(), result = applyAudioTool("video", "voice"); await Promise.resolve();
    useEditorStore.getState().loadSnapshot(before); done({ wav: new ArrayBuffer(44) });
    expect(await result).toBe(false); expect(services.importFile).not.toHaveBeenCalled();
    expect(useEditorStore.getState().past).toHaveLength(0);
  });

  it("releases a failed beat analysis with the timeline untouched", async () => {
    services.sound.mockRejectedValue(new Error("decode failed"));
    await expect(applyBeatTool("video", true)).rejects.toThrow("decode failed");
    expect(useEditorStore.getState().editing).toBe(false); expect(useEditorStore.getState().past).toHaveLength(0);
  });
});
