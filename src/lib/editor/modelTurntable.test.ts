import { describe, expect, it } from "vitest";
import { turntableAngle, turntableFormat } from "./modelTurntable";

describe("3D turntable", () => {
  it("prefers a transparent WebM and falls back to MP4", () => {
    expect(turntableFormat(t => t.startsWith("video/webm"))).toEqual({ mime: "video/webm;codecs=vp9", ext: "webm", alpha: true });
    expect(turntableFormat(t => t === "video/mp4")).toEqual({ mime: "video/mp4", ext: "mp4", alpha: false });
    expect(turntableFormat(() => false)).toBeNull();
  });

  it("makes exactly one eased turn", () => {
    expect(turntableAngle(0)).toBe(0);
    expect(turntableAngle(0.5)).toBeCloseTo(Math.PI, 6);
    expect(turntableAngle(1)).toBeCloseTo(Math.PI * 2, 6);
    expect(turntableAngle(0.1)).toBeLessThan(Math.PI * 2 * 0.1);
  });
});
