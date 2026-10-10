import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "@/store/editorStore";
import { projectReviewSnapshotKey } from "./cloudProjectReview";
import type { MediaClip, ProjectSnapshot } from "./types";
const clone=<T,>(value:T):T=>JSON.parse(JSON.stringify(value));
const fixture=():ProjectSnapshot=>({id:"device-project",title:"Film",updatedAt:1,settings:{width:1920,height:1080,fps:30,aspectPreset:"16:9",background:"#000000"},
  tracks:[{id:"v",kind:"video",name:"Video",muted:false,hidden:false}],clips:[{id:"a",kind:"video",trackId:"v",mediaId:"device-video",start:0,trimIn:0,duration:10,sourceDuration:20},
  {id:"b",kind:"video",trackId:"v",mediaId:"device-video",start:10,trimIn:0,duration:5,sourceDuration:20}]});
beforeEach(()=>{useEditorStore.getState().loadSnapshot(fixture());useEditorStore.getState().setMedia([]);});
describe("applying shared changes to the actual web editor history",()=>{
  it("keeps Undo and Redo of local volume edits while preserving a received clip edit",()=>{
    let store=useEditorStore.getState();store.updateMediaClip("a",{audio:{volume:.5}});store.updateMediaClip("a",{audio:{volume:.8}});store.undo();
    store=useEditorStore.getState();const before=store.toSnapshot(),incoming=clone(before);incoming.clips[1].duration=4;
    store.applySharedSnapshot(incoming,projectReviewSnapshotKey(before));expect(useEditorStore.getState().past).toHaveLength(1);expect(useEditorStore.getState().future).toHaveLength(1);
    useEditorStore.getState().redo();expect((useEditorStore.getState().clips[0] as MediaClip).audio?.volume).toBe(.8);expect(useEditorStore.getState().clips[1].duration).toBe(4);
    useEditorStore.getState().undo();useEditorStore.getState().undo();expect((useEditorStore.getState().clips[0] as MediaClip).audio).toBeUndefined();expect(useEditorStore.getState().clips[1].duration).toBe(4);
  });
  it("keeps the project, source IDs, playhead and surviving selection while pausing playback",()=>{
    const store=useEditorStore.getState();store.selectClip("a");store.setCurrentTime(3);store.setIsPlaying(true);const before=store.toSnapshot(),incoming=clone(before);incoming.title="Shared title";
    store.applySharedSnapshot(incoming,projectReviewSnapshotKey(before));const after=useEditorStore.getState();
    expect(after.projectId).toBe(before.id);expect(after.projectTitle).toBe("Shared title");expect(after.currentTime).toBe(3);expect(after.selectedClipIds).toEqual(["a"]);expect(after.isPlaying).toBe(false);
    expect((after.clips[0] as MediaClip).mediaId).toBe("device-video");
  });
  it("removes only deleted selections and clamps a playhead beyond the received end",()=>{
    const store=useEditorStore.getState();store.selectMany(["a","b"]);store.setCurrentTime(14);const before=store.toSnapshot(),incoming=clone(before);incoming.clips.pop();incoming.clips[0].duration=4;
    store.applySharedSnapshot(incoming,projectReviewSnapshotKey(before));expect(useEditorStore.getState().selectedClipIds).toEqual(["a"]);expect(useEditorStore.getState().currentTime).toBe(4);
  });
  it("refuses a stale captured snapshot without replacing any local history",()=>{
    const before=useEditorStore.getState().toSnapshot();useEditorStore.getState().updateMediaClip("a",{audio:{volume:.5}});const current=useEditorStore.getState().toSnapshot();
    expect(()=>useEditorStore.getState().applySharedSnapshot(before,projectReviewSnapshotKey(before))).toThrow("project changed");
    expect(projectReviewSnapshotKey(useEditorStore.getState().toSnapshot())).toBe(projectReviewSnapshotKey(current));expect(useEditorStore.getState().past).toHaveLength(1);
  });
  it("refuses a received update while an asynchronous edit batch owns Undo",async()=>{
    const store=useEditorStore.getState(),before=store.toSnapshot();let finish!:()=>void;
    const operation=store.runAsOneStep(()=>new Promise<void>(resolve=>{finish=resolve;}));
    expect(()=>store.applySharedSnapshot(before,projectReviewSnapshotKey(before))).toThrow("project changed");finish();await operation;
    expect(()=>store.applySharedSnapshot(before,projectReviewSnapshotKey(before))).not.toThrow();
  });
  it("reports protected older Undo fields while keeping unrelated older volume edits",()=>{
    const store=useEditorStore.getState();store.updateMediaClip("a",{audio:{volume:.5},duration:8});const before=store.toSnapshot(),incoming=clone(before);incoming.clips[0].duration=6;
    expect(store.applySharedSnapshot(incoming,projectReviewSnapshotKey(before))).toBeGreaterThan(0);
    useEditorStore.getState().undo();expect(useEditorStore.getState().clips[0].duration).toBe(6);expect((useEditorStore.getState().clips[0] as MediaClip).audio).toBeUndefined();
  });
});


describe("scoped gesture readiness in the actual web history", () => {
  it("blocks receiving before the first frame without inventing an Undo step", () => {
    const store = useEditorStore.getState(), before = store.toSnapshot(), lease = store.holdEdits();
    expect(useEditorStore.getState().editing).toBe(true);
    expect(() => store.applySharedSnapshot(before, projectReviewSnapshotKey(before))).toThrow("project changed");
    expect(useEditorStore.getState().past).toHaveLength(0);
    lease.release(); expect(useEditorStore.getState().editing).toBe(false);
    expect(() => store.applySharedSnapshot(before, projectReviewSnapshotKey(before))).not.toThrow();
  });
  it("keeps receiving blocked until every overlapping gesture releases ownership", () => {
    const store = useEditorStore.getState(), before = store.toSnapshot(), first = store.holdEdits(), second = store.holdEdits();
    first.release(); first.release(); expect(second.isCurrent()).toBe(true);
    expect(() => store.applySharedSnapshot(before, projectReviewSnapshotKey(before))).toThrow("project changed");
    second.release(); expect(useEditorStore.getState().editing).toBe(false);
  });
  it("invalidates old same-project holds without releasing a new hold after reset", () => {
    const store = useEditorStore.getState(), old = store.holdEdits(); store.loadSnapshot(fixture()); const fresh = store.holdEdits();
    expect(old.isCurrent()).toBe(false); old.release(); expect(fresh.isCurrent()).toBe(true);
    expect(() => store.applySharedSnapshot(fixture(), projectReviewSnapshotKey(fixture()))).toThrow("project changed");
    fresh.release(); expect(useEditorStore.getState().editing).toBe(false);
  });
  it("keeps one real canvas drag in Undo and preserves a later received edit", () => {
    const store = useEditorStore.getState(), lease = store.beginGesture(); store.patchClipLive("a", {start:1}); store.patchClipLive("a", {start:2}); lease.release();
    expect(useEditorStore.getState().past).toHaveLength(1);
    const before = store.toSnapshot(), incoming = clone(before); incoming.clips[1].duration = 4;
    store.applySharedSnapshot(incoming, projectReviewSnapshotKey(before)); store.undo();
    expect(useEditorStore.getState().clips[0].start).toBe(0); expect(useEditorStore.getState().clips[1].duration).toBe(4);
  });
  it("drops a return-to-origin drag and restores existing Redo", () => {
    const store = useEditorStore.getState(); store.updateMediaClip("a", {audio:{volume:.5}}); store.undo(); const lease = store.beginGesture();
    store.patchClipLive("a", {start:1}); store.patchClipLive("a", {start:0}); lease.release();
    expect(useEditorStore.getState().past).toHaveLength(0); expect(useEditorStore.getState().future).toHaveLength(1); expect(useEditorStore.getState().editing).toBe(false);
    store.redo(); expect((useEditorStore.getState().clips[0] as MediaClip).audio?.volume).toBe(.5);
  });
  it("collapses repeated timeline frames only after its asynchronous edit batch settles", async () => {
    const store = useEditorStore.getState(), lease = store.holdEdits(); let finish!: () => void;
    const operation = store.runAsOneStep(() => new Promise<void>(resolve => {finish=resolve;}));
    store.updateMediaClip("a", {start:1}); store.updateMediaClip("a", {start:2}); lease.release();
    const before = store.toSnapshot(); expect(() => store.applySharedSnapshot(before, projectReviewSnapshotKey(before))).toThrow("project changed");
    finish(); await operation; expect(useEditorStore.getState().past).toHaveLength(1); expect(useEditorStore.getState().editing).toBe(false);
    store.undo(); expect(useEditorStore.getState().clips[0].start).toBe(0);
  });
  it("does not swallow an old batch failure or replace newer reset history", async () => {
    const store = useEditorStore.getState(); let reject!: (reason: Error) => void;
    const operation = store.runAsOneStep(() => new Promise<void>((_resolve,no) => {reject=no;}));
    store.loadSnapshot(fixture()); store.updateMediaClip("a", {start:3}); const fresh = store.holdEdits();
    reject(new Error("old operation failed")); await expect(operation).rejects.toThrow("old operation failed");
    expect(useEditorStore.getState().past).toHaveLength(1); expect(useEditorStore.getState().clips[0].start).toBe(3); expect(fresh.isCurrent()).toBe(true);
    fresh.release(); expect(useEditorStore.getState().editing).toBe(false);
  });
  it("starts a new project with no stale ownership and ignores its old release", () => {
    const store = useEditorStore.getState(), old = store.beginGesture(); store.newProject(); const fresh = store.holdEdits(); old.release();
    expect(old.isCurrent()).toBe(false); expect(fresh.isCurrent()).toBe(true); expect(useEditorStore.getState().past).toHaveLength(0);
    fresh.release(); const before = store.toSnapshot(); expect(() => store.applySharedSnapshot(before, projectReviewSnapshotKey(before))).not.toThrow();
  });
});
