import { describe, expect, it } from "vitest";
import { audioGainAt } from "./audioEnvelope";
import type { MediaClip } from "./types";

const clip: MediaClip = { id: "a", trackId: "a", kind: "audio", mediaId: "m", start: 2, duration: 10, trimIn: 0, audio: { volume: 0.8, fadeIn: 2, fadeOut: 4 } };
describe("preview audio fades", () => {
  it("matches the exported linear envelope at both ends", () => {
    expect([1, 2, 3, 4, 8, 10, 11, 12].map((t) => audioGainAt(clip, t))).toEqual([0, 0, 0.4, 0.8, 0.8, 0.4, 0.2, 0]);
  });
  it("bounds overlapping fades and preserves mute", () => {
    expect(audioGainAt({ ...clip, audio: { volume: 0 } }, 5)).toBe(0);
    expect(audioGainAt({ ...clip, audio: { volume: 1, fadeIn: 20, fadeOut: 20 } }, 7)).toBe(0.5);
    expect(audioGainAt({ ...clip, audio: undefined }, 5)).toBe(1);
  });
});
