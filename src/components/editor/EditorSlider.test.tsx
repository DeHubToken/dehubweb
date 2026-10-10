import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { useEditorStore } from "@/store/editorStore";
import { projectReviewSnapshotKey } from "@/lib/editor/cloudProjectReview";
import type { ProjectSnapshot, MediaClip } from "@/lib/editor/types";
import { useEditorControlGesture } from "./useEditorControlGesture";
import { EditorSlider } from "./EditorSlider";
const fixture=():ProjectSnapshot=>({id:"device-project",title:"Film",updatedAt:1,settings:{width:1920,height:1080,fps:30,aspectPreset:"16:9",background:"#000000"},
  tracks:[{id:"v",kind:"video",name:"Video",muted:false,hidden:false}],clips:[{id:"a",kind:"video",trackId:"v",mediaId:"device-video",start:0,trimIn:0,duration:10,sourceDuration:20},
  {id:"b",kind:"video",trackId:"v",mediaId:"device-video",start:10,trimIn:0,duration:5,sourceDuration:20}]});

beforeEach(() => {
  useEditorStore.getState().loadSnapshot(fixture());
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const flush = () => act(async () => { await Promise.resolve(); });
function Control() {
  const clip=useEditorStore(s=>s.clips[0] as MediaClip);
  return <EditorSlider aria-label="Volume" value={[clip.audio?.volume ?? 1]} min={0} max={2} step={.1}
    onValueChange={([volume])=>useEditorStore.getState().updateMediaClip("a",{audio:{volume}})} />;
}
describe("real editor control readiness",()=>{
  it("rejects a start captured before a newer rendered project value",()=>{
    const {result}=renderHook(()=>useEditorControlGesture());
    act(()=>{useEditorStore.getState().updateMediaClip("a",{duration:8});expect(result.current.begin()).toBe(false);});
    expect(useEditorStore.getState().editing).toBe(false);expect(useEditorStore.getState().clips[0].duration).toBe(8);
  });
  it("holds receiving before the first value without adding Undo",async()=>{
    const {result}=renderHook(()=>useEditorControlGesture());act(()=>{result.current.begin();});
    const state=useEditorStore.getState(),snapshot=state.toSnapshot();
    expect(state.editing).toBe(true);expect(state.past).toHaveLength(0);
    expect(()=>state.applySharedSnapshot(snapshot,projectReviewSnapshotKey(snapshot))).toThrow("project changed");
    act(()=>result.current.finish());await flush();expect(useEditorStore.getState().editing).toBe(false);
  });
  it("groups repeated real slider keyboard events into one Undo",async()=>{
    render(<Control/>);const slider=screen.getByRole("slider",{name:"Volume"});
    fireEvent.keyDown(slider,{key:"ArrowRight"});fireEvent.keyDown(slider,{key:"ArrowRight",repeat:true});
    expect(useEditorStore.getState().editing).toBe(true);
    fireEvent.keyUp(slider,{key:"ArrowRight"});await flush();
    expect((useEditorStore.getState().clips[0] as MediaClip).audio?.volume).toBeCloseTo(1.2);
    expect(useEditorStore.getState().past).toHaveLength(1);expect(useEditorStore.getState().editing).toBe(false);
    act(()=>useEditorStore.getState().undo());expect((useEditorStore.getState().clips[0] as MediaClip).audio).toBeUndefined();
  });
  it("preserves Redo when the control returns to its original value",async()=>{
    act(()=>{useEditorStore.getState().updateMediaClip("a",{audio:{volume:1}});useEditorStore.getState().updateMediaClip("a",{audio:{volume:.5}});useEditorStore.getState().undo();});
    render(<Control/>);const slider=screen.getByRole("slider",{name:"Volume"});
    fireEvent.keyDown(slider,{key:"ArrowRight"});fireEvent.keyDown(slider,{key:"ArrowLeft"});fireEvent.keyUp(slider,{key:"ArrowLeft"});await flush();
    expect(useEditorStore.getState().past).toHaveLength(1);expect(useEditorStore.getState().future).toHaveLength(1);
    act(()=>useEditorStore.getState().redo());expect((useEditorStore.getState().clips[0] as MediaClip).audio?.volume).toBe(.5);
  });
  it("settles a cancelled adjustment and retains its one Undo",async()=>{
    const {result}=renderHook(()=>useEditorControlGesture());act(()=>{result.current.begin();result.current.change(()=>useEditorStore.getState().patchClipLive("a",{duration:8}));});
    fireEvent.pointerCancel(window);await flush();expect(useEditorStore.getState().editing).toBe(false);expect(useEditorStore.getState().past).toHaveLength(1);
    act(()=>useEditorStore.getState().undo());expect(useEditorStore.getState().clips[0].duration).toBe(10);
  });
  it("releases and settles when a control unmounts",async()=>{
    const {result,unmount}=renderHook(()=>useEditorControlGesture());act(()=>{result.current.begin();result.current.change(()=>useEditorStore.getState().patchClipLive("a",{duration:8}));});
    unmount();await flush();expect(useEditorStore.getState().editing).toBe(false);expect(useEditorStore.getState().past).toHaveLength(1);
  });
  it("ignores an old value and completion after a same-project reset",async()=>{
    const {result}=renderHook(()=>useEditorControlGesture());act(()=>result.current.begin());
    let fresh!:ReturnType<ReturnType<typeof useEditorStore.getState>["holdEdits"]>;
    act(()=>{useEditorStore.getState().loadSnapshot(fixture());fresh=useEditorStore.getState().holdEdits();result.current.change(()=>useEditorStore.getState().patchClipLive("a",{duration:2}));result.current.finish();});await flush();
    expect(useEditorStore.getState().clips[0].duration).toBe(10);expect(fresh.isCurrent()).toBe(true);expect(useEditorStore.getState().past).toHaveLength(0);act(()=>fresh.release());
  });
  it("keeps independent received edits in the slider's Undo history",async()=>{
    render(<Control/>);const slider=screen.getByRole("slider",{name:"Volume"});fireEvent.keyDown(slider,{key:"ArrowRight"});fireEvent.keyUp(slider,{key:"ArrowRight"});await flush();
    const before=useEditorStore.getState().toSnapshot(),incoming=JSON.parse(JSON.stringify(before)) as ProjectSnapshot;incoming.clips[1].duration=4;
    act(()=>{useEditorStore.getState().applySharedSnapshot(incoming,projectReviewSnapshotKey(before));useEditorStore.getState().undo();});
    expect((useEditorStore.getState().clips[0] as MediaClip).audio).toBeUndefined();expect(useEditorStore.getState().clips[1].duration).toBe(4);
  });
});
