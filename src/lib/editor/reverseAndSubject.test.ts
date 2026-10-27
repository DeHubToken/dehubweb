import { describe, expect, it } from "vitest";
import { clipSourceSpan, reversedClip, subjectLayer } from "./clipTools";
import { reverseFrameTime, reverseSize, reversedSamples } from "./reverseMedia";
import type { MediaClip, ProjectSnapshot } from "./types";

const project = (): ProjectSnapshot => ({
  id: "p", title: "", updatedAt: 0, settings: {} as ProjectSnapshot["settings"],
  tracks: [{ id: "v", kind: "video", name: "Video", muted: false, hidden: false }, { id: "cap", kind: "text", role: "captions", name: "Captions", muted: false, hidden: false }],
  clips: [
    { id: "c", kind: "video", mediaId: "m", trackId: "v", start: 2, duration: 5, trimIn: 1, speed: 2, audio: { volume: 0.8 }, groupId: "g",
      transitionOut: { kind: "fade", duration: 0.5 }, videoMatte: { mediaId: "x" } },
    { id: "t", kind: "text", trackId: "cap", start: 2, duration: 5, text: "hi" },
  ] as unknown as ProjectSnapshot["clips"],
});

describe("text behind the person", () => {
  it("puts a silent copy of the video on a new top track", () => {
    let n = 0;
    const result = subjectLayer(project(), "c", () => `id${++n}`)!;
    expect(result.project.tracks.at(-1)).toMatchObject({ id: "id1", kind: "video" });
    const copy = result.project.clips.find(c => c.id === result.id) as MediaClip;
    expect(copy).toMatchObject({ trackId: "id1", start: 2, duration: 5, trimIn: 1, speed: 2, audio: { volume: 0 } });
    expect(copy.groupId).toBeUndefined();
    expect(copy.transitionOut).toBeUndefined();
    expect(copy.videoMatte).toBeUndefined();
    expect(result.project.clips.find(c => c.id === "c")).toMatchObject({ audio: { volume: 0.8 } });
  });
  it("only works on unlocked videos", () => {
    expect(subjectLayer(project(), "t", () => "x")).toBeNull();
    const p = project(); (p.clips[0] as MediaClip).locked = true;
    expect(subjectLayer(p, "c", () => "x")).toBeNull();
  });
});

describe("reverse", () => {
  it("reverses exactly the span the clip plays", () => {
    const clip = project().clips[0] as MediaClip;
    expect(clipSourceSpan(clip)).toEqual({ start: 1, end: 11 });
    const next = reversedClip(project(), "c", "rev", 10)!.clips[0] as MediaClip;
    expect(next).toMatchObject({ mediaId: "rev", trimIn: 0, sourceDuration: 10, start: 2, duration: 5, speed: 2 });
    expect(next.videoMatte).toBeUndefined();
  });
  it("walks frames from the end of the span to the start", () => {
    expect(reverseFrameTime(1, 3, 0, 4)).toBeCloseTo(2.75);
    expect(reverseFrameTime(1, 3, 3, 4)).toBeCloseTo(1.25);
  });
  it("reverses samples and keeps sizes even and capped", () => {
    expect(Array.from(reversedSamples(new Float32Array([1, 2, 3, 4, 5]), 1, 4))).toEqual([4, 3, 2]);
    expect(reverseSize(3840, 2160)).toEqual({ width: 1920, height: 1080 });
    expect(reverseSize(721, 1281)).toEqual({ width: 720, height: 1280 });
  });
});
