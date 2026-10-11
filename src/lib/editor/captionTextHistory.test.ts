import { expect, it } from "vitest";
import { useEditorStore } from "@/store/editorStore";
import { applyCaptionText, captionReplacement } from "./captionText";
import { subtitleLayers } from "./subtitles";
import { DEFAULT_SETTINGS } from "./types";

it("undoes and redoes a bulk caption correction in one real history step", async () => {
  let id = 0;
  const layers = subtitleLayers([{ start: 0, end: 1, text: "Hello" }, { start: 1, end: 2, text: "Hello again" }], () => `c${++id}`);
  const snapshot = { id: "caption-text-history", title: "Captions", updatedAt: 1, settings: DEFAULT_SETTINGS, tracks: [layers.track], clips: layers.clips };
  useEditorStore.getState().loadSnapshot(snapshot);
  const state = useEditorStore.getState(), next = applyCaptionText(state, captionReplacement(state, "Hello", "Hi"));
  await state.runAsOneStep(() => { useEditorStore.setState({ clips: next.clips }); });
  expect(useEditorStore.getState().past).toHaveLength(1);
  expect(useEditorStore.getState().clips).toEqual(next.clips);
  useEditorStore.getState().undo();
  expect(useEditorStore.getState().clips).toEqual(snapshot.clips);
  useEditorStore.getState().redo();
  expect(useEditorStore.getState().clips).toEqual(next.clips);
  expect(useEditorStore.getState().settings).toEqual(DEFAULT_SETTINGS);
});
