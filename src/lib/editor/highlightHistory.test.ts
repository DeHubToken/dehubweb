import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "@/store/editorStore";
import { createHighlightEdit } from "./applyHighlights";
import { saveProject, setLastProjectId } from "./projectStore";
import type { ProjectSnapshot } from "./types";

vi.mock("./projectStore", () => ({ saveProject: vi.fn(async () => {}), setLastProjectId: vi.fn() }));

describe("highlight project persistence and history", () => {
  beforeEach(() => { vi.clearAllMocks(); useEditorStore.getState().newProject(); useEditorStore.setState({ clips: [{ id: "v", trackId: "track", kind: "video", mediaId: "source", duration: 30, start: 0, trimIn: 3, speed: 2 }], tracks: [{ id: "track", kind: "video", name: "Video", hidden: false, muted: false }] }); });
  it("durably retains the original, saves a separate edit, and restores all footage in one Undo/Redo", async () => {
    const original = useEditorStore.getState().toSnapshot();
    const chosen = [{ start: 2, end: 6, text: "A strong moment.", score: 0.9 }, { start: 12, end: 16, text: "Another moment.", score: 0.8 }];
    expect(await createHighlightEdit(original, "v", chosen, "Source highlights")).toBe(true);
    const calls = vi.mocked(saveProject).mock.calls.map(args => args[0]);
    expect(calls[0]).toBe(original); expect(calls[1].id).not.toBe(original.id);
    const next = useEditorStore.getState().toSnapshot();
    expect(next.id).toBe(calls[1].id); expect(setLastProjectId).toHaveBeenCalledWith(next.id);
    expect(next.clips.map(c => c.trimIn)).toEqual([7, 27]);
    useEditorStore.getState().undo(); expect(useEditorStore.getState().clips).toEqual(original.clips);
    useEditorStore.getState().redo(); expect(useEditorStore.getState().clips).toEqual(next.clips);
    expect(original.clips).toHaveLength(1);
  });
  it("refuses to switch projects when the source changes during persistence", async () => {
    const original: ProjectSnapshot = useEditorStore.getState().toSnapshot();
    vi.mocked(saveProject).mockImplementationOnce(async () => { useEditorStore.getState().patchClip("v", { duration: 20 }); });
    expect(await createHighlightEdit(original, "v", [{ start: 2, end: 6, text: "Moment.", score: 0.9 }], "Highlights")).toBe(false);
    expect(useEditorStore.getState().projectId).toBe(original.id);
    expect(useEditorStore.getState().clips[0].duration).toBe(20);
    expect(saveProject).toHaveBeenCalledTimes(1);
  });
});
