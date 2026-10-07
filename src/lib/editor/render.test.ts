import { describe, expect, it } from "vitest";
import { clipBoxForSize, drawClip, placementPatch, pointInBox } from "./render";
import type { MediaClip, TextClip } from "./types";

const image = (patch: Partial<MediaClip> = {}): MediaClip => ({
  id: "c1", trackId: "t1", kind: "image", start: 0, duration: 5, trimIn: 0, mediaId: "m1", ...patch,
});

// Geometry for media never touches the context, so a stub is enough.
const ctx = {} as CanvasRenderingContext2D;

describe("clipBoxForSize", () => {
  it("fits a landscape photo inside a square page by default", () => {
    const box = clipBoxForSize(ctx, image(), 1000, 1000, { w: 2000, h: 1000 });
    expect(box).toMatchObject({ cx: 500, cy: 500, w: 1000, h: 500, rotation: 0 });
  });

  it("fills the page edge to edge with fit=cover", () => {
    const box = clipBoxForSize(ctx, image({ fit: "cover" }), 1000, 1000, { w: 2000, h: 1000 });
    expect(box).toMatchObject({ w: 2000, h: 1000 });
  });

  it("applies position, scale and crop", () => {
    const clip = image({
      transform: { x: 0.25, y: 0.75, scale: 0.5, rotation: 30 },
      crop: { left: 0.5, top: 0, right: 0, bottom: 0 },
    });
    const box = clipBoxForSize(ctx, clip, 1000, 1000, { w: 2000, h: 1000 });
    // Cropped source is 1000x1000, fitted to 1000x1000, then halved.
    expect(box).toMatchObject({ cx: 250, cy: 750, w: 500, h: 500, rotation: 30 });
  });

  it("returns null until the media size is known", () => {
    expect(clipBoxForSize(ctx, image(), 1000, 1000, null)).toBeNull();
  });
});

describe("pointInBox", () => {
  it("respects rotation", () => {
    const box = { cx: 0, cy: 0, w: 100, h: 10, rotation: 90 };
    expect(pointInBox(box, 0, 40)).toBe(true);
    expect(pointInBox(box, 40, 0)).toBe(false);
  });
});

describe("placementPatch", () => {
  it("keeps text position in x/y so older readers still work", () => {
    const text = { id: "t", trackId: "t", kind: "text", start: 0, duration: 1, trimIn: 0, text: "Hi",
      fontFamily: "Inter", fontSize: 72, fontWeight: 700, color: "#fff", align: "centre", x: 0.5, y: 0.5 } as TextClip;
    const patch = placementPatch(text, { x: 0.1, rotation: 45 });
    expect(patch.x).toBe(0.1);
    expect(patch.transform?.rotation).toBe(45);
  });
});

describe("shape geometry", () => {
  it("sizes a shape from page fractions and scale", () => {
    const shape = { id: "s", trackId: "t", kind: "shape", shape: "rect", start: 0, duration: 5, trimIn: 0,
      w: 0.5, h: 0.25, fill: "#fff", transform: { x: 0.5, y: 0.5, scale: 2, rotation: 0 } } as const;
    expect(clipBoxForSize(ctx, shape, 1000, 800, null)).toMatchObject({ w: 1000, h: 400 });
  });
});

describe("freehand path", () => {
  it("sizes like any shape and keeps its points in the box", () => {
    const path = { id: "p", trackId: "t", kind: "shape", shape: "path", start: 0, duration: 5, trimIn: 0,
      w: 0.2, h: 0.1, fill: null, stroke: { color: "#fff", width: 10 },
      points: [[-0.5, -0.5], [0, 0.5], [0.5, -0.5]] as [number, number][],
      transform: { x: 0.5, y: 0.5, scale: 1, rotation: 0 } } as const;
    expect(clipBoxForSize(ctx, path, 1000, 1000, null)).toMatchObject({ w: 200, h: 100 });
  });
});

it("draws the same fitted paragraph measured by selection geometry", () => {
  const drawn: string[] = [];
  const context = {
    font: "", globalAlpha: 1,
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
    measureText(line: string) { return { width: Array.from(line).length * Number(/([\d.]+)px/.exec(this.font)?.[1] ?? 0) * 0.56 }; },
    fillText(line: string) { drawn.push(line); },
  } as unknown as CanvasRenderingContext2D;
  const clip: TextClip = { id: "caption", trackId: "t", kind: "text", trimIn: 0, start: 0, duration: 4,
    text: "Keep one copy on a separate drive so a mistake cannot destroy your originals.",
    fontFamily: "sans-serif", fontSize: 64, fontWeight: 800, color: "#fff", align: "centre", x: 0.5, y: 0.84, maxWidth: 0.9, maxHeight: 0.28 };
  const box = clipBoxForSize(context, clip, 360, 640, null)!;
  drawClip(context, 360, 640, clip, 1, { videos: new Map(), images: new Map() });
  expect(drawn.length).toBeGreaterThan(1);
  expect(drawn.join(" ")).toBe(clip.text);
  expect(box.w).toBeLessThanOrEqual(324.02);
  expect(box.h).toBeLessThanOrEqual(179.22);
  expect(box.cx - box.w / 2).toBeGreaterThan(0);
  expect(box.cy + box.h / 2).toBeLessThan(640);
});
