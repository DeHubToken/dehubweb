import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "@/store/editorStore";
import { splitShotClip } from "./applyShotTool";
import type { MediaClip } from "./types";

describe("scene cuts in editor history", () => {
  beforeEach(() => useEditorStore.getState().newProject());
  it("applies the reviewed subset in one Undo step and refuses stale results", async () => {
    const clip: MediaClip = { id:"v", kind:"video", mediaId:"source", trackId:"track", start:0, duration:6, trimIn:3, speed:2, sourceDuration:20 };
    useEditorStore.setState({clips:[clip],tracks:[{id:"track",kind:"video",name:"Video",muted:false,hidden:false}]});
    expect(await splitShotClip(clip,[2])).toBe(true);
    expect(useEditorStore.getState().clips.map(c => c.trimIn)).toEqual([3,7]);
    expect(await splitShotClip(clip,[4])).toBe(false);
    useEditorStore.getState().undo(); expect(useEditorStore.getState().clips).toEqual([clip]);
    useEditorStore.getState().redo(); expect(useEditorStore.getState().clips.map(c => c.duration)).toEqual([2,4]);
  });
});
