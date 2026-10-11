import { describe, expect, it } from "vitest";
import { useEditorStore } from "@/store/editorStore";
import { applyCaptionTranslation, planCaptionTranslation } from "./captionTranslation";
import { subtitleLayers } from "./subtitles";
import { DEFAULT_SETTINGS } from "./types";

describe("caption translation in web history", () => {
  it("replaces all caption wording in one real Undo and Redo step", async () => {
    let id = 0;
    const layers = subtitleLayers([{ start: 0, end: 1, text: "Hello" }, { start: 1, end: 2, text: "World" }], () => `c${++id}`);
    const snapshot = { id: "caption-history", title: "Captions", updatedAt: 1, settings: DEFAULT_SETTINGS, tracks: [layers.track], clips: layers.clips };
    useEditorStore.getState().loadSnapshot(snapshot);
    const state = useEditorStore.getState(), plan = planCaptionTranslation(state);
    const next = applyCaptionTranslation(state, plan, plan.cues.map(cue => ({ id: cue.id, text: `French ${cue.text}` })));
    await state.runAsOneStep(() => { useEditorStore.setState({ clips: next.clips }); });
    expect(useEditorStore.getState().past).toHaveLength(1);
    expect(useEditorStore.getState().clips).toEqual(next.clips);
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().clips).toEqual(snapshot.clips);
    useEditorStore.getState().redo();
    expect(useEditorStore.getState().clips).toEqual(next.clips);
    expect(useEditorStore.getState().settings).toEqual(DEFAULT_SETTINGS);
  });
});
