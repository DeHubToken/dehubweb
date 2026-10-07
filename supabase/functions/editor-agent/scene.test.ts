import { test } from "node:test";
import { strict as assert } from "node:assert";
import { sceneJson } from "./scene.ts";

test("large scenes keep valid JSON and selected source timing", () => {
  const layers = Array.from({ length: 180 }, (_, i) => ({ id: `clip-${i}`, kind: "video", start: i, duration: 1, trimIn: i * 2, trackId: "t", text: "x".repeat(1500), sourceDuration: 360 }));
  const scene = sceneJson({ layers, selected: ["clip-179"], page: { duration: 180 }, capabilities: ["segment"] }, 16000);
  assert.ok(scene.length <= 16000);
  const parsed = JSON.parse(scene);
  assert.ok(parsed.omittedLayers > 0);
  assert.equal(parsed.layers.at(-1).id, "clip-179");
  assert.equal(parsed.layers.at(-1).trimIn, 358);
  assert.equal(parsed.page.duration, 180);
});
test("ordinary scenes preserve their complete description", () => {
  const scene = { selected: ["a"], layers: [{ id: "a", keys: { x: [1, 2, 3] } }] };
  assert.equal(sceneJson(scene), JSON.stringify(scene));
});
