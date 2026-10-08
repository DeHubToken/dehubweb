import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "./editorStore";
import { subtitleLayers } from "@/lib/editor/subtitles";
import { DEFAULT_SETTINGS } from "@/lib/editor/types";

describe("caption track fitting history", () => {
  beforeEach(() => {
    let id = 0;
    const captions = subtitleLayers([{ start: 1, end: 3, text: "First caption." }, { start: 4, end: 6, text: "Second caption." }], () => String(++id));
    useEditorStore.getState().loadSnapshot({ id: "11111111-1111-4111-8111-111111111111", title: "Older project", updatedAt: 1,
      settings: { ...DEFAULT_SETTINGS }, tracks: [captions.track], clips: captions.clips.map(clip => ({ ...clip, maxWidth: undefined, maxHeight: undefined })) });
  });

  it("fits the complete caption track in one undo step and restores the exact old layout", () => {
    const original = useEditorStore.getState().clips, trackId = useEditorStore.getState().tracks[0].id;
    useEditorStore.getState().fitCaptionTrack(trackId);
    const fitted = useEditorStore.getState().clips;
    expect(useEditorStore.getState().past).toHaveLength(1);
    fitted.forEach(clip => expect(clip).toMatchObject({ maxWidth: 0.9, maxHeight: 0.28 }));
    useEditorStore.getState().fitCaptionTrack(trackId);
    expect(useEditorStore.getState().past).toHaveLength(1);
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().clips).toEqual(original);
    useEditorStore.getState().redo();
    expect(useEditorStore.getState().clips).toEqual(fitted);
  });
});
