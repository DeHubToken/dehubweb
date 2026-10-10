import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "@/store/editorStore";
import { beginEditorCommand } from "./editorCommand";
import { getTransform } from "./render";
import type { ClipTransform, ProjectSnapshot } from "./types";
import { projectReviewSnapshotKey } from "./cloudProjectReview";

const fixture = (): ProjectSnapshot => ({ id: "command-project", title: "Commands", updatedAt: 1,
  settings: { width: 1920, height: 1080, fps: 30, aspectPreset: "16:9", background: "#000000" },
  tracks: [{ id: "v", kind: "video", name: "Video", muted: false, hidden: false }],
  clips: ["a", "b"].map((id, index) => ({ id, kind: "video" as const, trackId: "v", mediaId: "source", start: index * 5, trimIn: 0, duration: 5, sourceDuration: 20, transform: { x: 0.5, y: 0.5, scale: 1, opacity: 1, rotation: 0 } })) });
const clip = (id: string) => useEditorStore.getState().clips.find(item => item.id === id)!;
const placement = (id: string, value: Partial<ClipTransform>) => ({ transform: { ...getTransform(clip(id)), ...value } });
beforeEach(() => useEditorStore.getState().loadSnapshot(fixture()));

describe("command ownership in the real editor store", () => {
  it("waits for a live gesture to settle and preserves its final position", async () => {
    const command = beginEditorCommand(); command.store().patchClip("a", placement("a", { opacity: 0.5 }));
    const gesture = useEditorStore.getState().beginGesture(); useEditorStore.getState().patchClipLive("b", placement("b", { rotation: 10 }));
    let resumed = false;
    const completion = command.ready().then(() => { resumed = true; command.store().patchClip("a", placement("a", { rotation: 20 })); });
    await Promise.resolve(); expect(resumed).toBe(false); expect(() => command.store().patchClip("a", placement("a", { rotation: 20 }))).toThrow("active adjustment");
    gesture.release(); await completion; command.release();
    useEditorStore.getState().undo(); expect(getTransform(clip("a"))).toMatchObject({ opacity: 1, rotation: 0 }); expect(getTransform(clip("b")).rotation).toBe(10);
    useEditorStore.getState().undo(); expect(getTransform(clip("b")).rotation).toBe(0);
  });
  it("cancels a gesture wait after reset and preserves a new command", async () => {
    const old = beginEditorCommand(), gesture = useEditorStore.getState().beginGesture();
    const completion = old.ready().then(() => true, () => false);
    useEditorStore.getState().loadSnapshot(fixture()); const fresh = beginEditorCommand(); old.release(); gesture.release();
    expect(await completion).toBe(false); expect(fresh.isCurrent()).toBe(true); expect(useEditorStore.getState().editing).toBe(true); fresh.release();
  });
  it("excludes receiving before the first asynchronous result can write", () => {
    const command = beginEditorCommand();
    expect(() => useEditorStore.getState().applySharedSnapshot(fixture(), projectReviewSnapshotKey(fixture()))).toThrow("project changed");
    command.release(); expect(useEditorStore.getState().editing).toBe(false); expect(useEditorStore.getState().past).toHaveLength(0);
  });
  it("groups writes around an independent edit and preserves both Undo and Redo", () => {
    const command = beginEditorCommand();
    command.store().patchClip("a", placement("a", { opacity: 0.5 }));
    useEditorStore.getState().patchClip("b", placement("b", { opacity: 0.7 }));
    command.store().patchClip("a", placement("a", { rotation: 15 })); command.release();
    expect(useEditorStore.getState().past).toHaveLength(2);
    useEditorStore.getState().undo(); expect(getTransform(clip("a"))).toMatchObject({ opacity: 1, rotation: 0 }); expect(getTransform(clip("b")).opacity).toBe(0.7);
    useEditorStore.getState().undo(); expect(getTransform(clip("b")).opacity).toBe(1);
    useEditorStore.getState().redo(); expect(getTransform(clip("a")).opacity).toBe(1); expect(getTransform(clip("b")).opacity).toBe(0.7);
    useEditorStore.getState().redo(); expect(getTransform(clip("a"))).toMatchObject({ opacity: 0.5, rotation: 15 });
  });
  it("keeps a later independent change to the same field", () => {
    const command = beginEditorCommand(); command.store().patchClip("a", placement("a", { opacity: 0.5 }));
    useEditorStore.getState().patchClip("a", placement("a", { opacity: 0.7 }));
    command.store().patchClip("a", placement("a", { rotation: 15 })); command.release();
    useEditorStore.getState().undo(); expect(getTransform(clip("a"))).toMatchObject({ opacity: 0.7, rotation: 0 });
    useEditorStore.getState().undo(); expect(getTransform(clip("a")).opacity).toBe(1);
  });
  it("retains a created layer and its track when another edit uses it", () => {
    const command = beginEditorCommand(); const id = command.store().addShapeClip("rect", { fill: "#111111" });
    useEditorStore.getState().patchClip(id, { fill: "#222222" });
    command.store().patchClip("a", placement("a", { opacity: 0.5 })); command.release();
    useEditorStore.getState().undo(); expect(clip(id)).toMatchObject({ fill: "#222222" }); expect(getTransform(clip("a")).opacity).toBe(1);
    expect(useEditorStore.getState().tracks.some(track => track.id === clip(id).trackId)).toBe(true);
  });
  it("cancels pending writes when the command is undone, even after Redo", () => {
    const command = beginEditorCommand(); command.store().patchClip("a", placement("a", { opacity: 0.5 }));
    useEditorStore.getState().undo(); useEditorStore.getState().redo();
    expect(command.isCurrent()).toBe(false); expect(() => command.store().patchClip("a", placement("a", { rotation: 30 }))).toThrow("pending command");
    command.release(); expect(getTransform(clip("a")).rotation).toBe(0); expect(useEditorStore.getState().editing).toBe(false);
  });
  it("cannot let an old same-ID task release a new editor hold", () => {
    const old = beginEditorCommand(); old.store().patchClip("a", placement("a", { opacity: 0.5 }));
    useEditorStore.getState().loadSnapshot(fixture()); const fresh = beginEditorCommand(); old.release();
    expect(old.isCurrent()).toBe(false); expect(fresh.isCurrent()).toBe(true); expect(useEditorStore.getState().editing).toBe(true);
    fresh.release(); expect(useEditorStore.getState().past).toHaveLength(0);
  });
  it("keeps Redo after a command with only unchanged writes", () => {
    useEditorStore.getState().patchClip("b", placement("b", { opacity: 0.7 })); useEditorStore.getState().undo();
    const future = useEditorStore.getState().future, command = beginEditorCommand();
    command.store().patchClip("a", placement("a", { opacity: 1 })); command.release();
    expect(useEditorStore.getState().future).toBe(future); expect(useEditorStore.getState().past).toHaveLength(0);
  });
  it("keeps partial command work undoable when a captured write fails", () => {
    const command = beginEditorCommand(); useEditorStore.getState().patchClip("b", placement("b", { opacity: 0.7 }));
    expect(() => command.capture(() => { useEditorStore.getState().patchClip("a", placement("a", { opacity: 0.5 })); throw new Error("failed"); })).toThrow("failed");
    command.release(); useEditorStore.getState().undo(); expect(getTransform(clip("a")).opacity).toBe(1); expect(getTransform(clip("b")).opacity).toBe(0.7);
  });
  it("rejects later writes after independent history has exhausted the marker", () => {
    const command = beginEditorCommand(); command.store().patchClip("a", placement("a", { opacity: 0.5 }));
    for (let i = 0; i < 50; i++) useEditorStore.getState().patchClip("b", placement("b", { rotation: i + 1 }));
    expect(command.isCurrent()).toBe(false); expect(() => command.store()).toThrow("pending command"); command.release(); expect(getTransform(clip("b")).rotation).toBe(50);
  });
  it("settles synchronous batches before a later command starts", async () => {
    const completion = useEditorStore.getState().runAsOneStep(() => useEditorStore.getState().patchClip("a", placement("a", { opacity: 0.5 })));
    expect(useEditorStore.getState().editing).toBe(false);
    useEditorStore.getState().patchClip("b", placement("b", { opacity: 0.7 })); await completion;
    useEditorStore.getState().undo(); expect(getTransform(clip("a")).opacity).toBe(0.5); expect(getTransform(clip("b")).opacity).toBe(1);
    useEditorStore.getState().undo(); expect(getTransform(clip("a")).opacity).toBe(1);
  });
});
