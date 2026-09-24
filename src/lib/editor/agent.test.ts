import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "@/store/editorStore";
import { applyOps, describeScene } from "./agent";

describe("editor agent", () => {
  beforeEach(() => useEditorStore.getState().newProject());

  it("applies a multi-step request as one undo step", async () => {
    const report = await applyOps([
      { op: "set_canvas", aspect: "1:1", background: "#112233" },
      { op: "add_text", text: "Summer sale", fontSize: 160, y: 0.2, color: "#ffffff" },
      { op: "update", id: "new:0", italic: true, rotation: -5 },
    ]);
    expect(report).toMatchObject({ applied: 3, failed: 0 });

    const s = useEditorStore.getState();
    expect(s.settings).toMatchObject({ width: 1080, height: 1080, background: "#112233" });
    const text = s.clips.find((c) => c.kind === "text");
    expect(text).toMatchObject({ text: "Summer sale", fontSize: 160, y: 0.2, italic: true });
    expect(text?.transform?.rotation).toBe(-5);

    s.undo();
    const after = useEditorStore.getState();
    expect(after.clips).toHaveLength(0);
    expect(after.settings.aspectPreset).toBe("16:9");
  });

  it("ignores unknown layers and ops instead of throwing", async () => {
    const report = await applyOps([{ op: "place", id: "nope", x: 0.1 }, { op: "teleport" }]);
    expect(report).toMatchObject({ applied: 0, failed: 2 });
  });

  it("describes the scene compactly", async () => {
    await applyOps([{ op: "add_text", text: "Hi" }]);
    const scene = describeScene();
    expect(scene.layers).toHaveLength(1);
    expect(scene.layers[0]).toMatchObject({ kind: "text", text: "Hi" });
    expect(JSON.stringify(scene).length).toBeLessThan(2000);
  });
});

describe("editor agent shapes", () => {
  beforeEach(() => useEditorStore.getState().newProject());

  it("adds a styled shape behind a title and can hide and lock it", async () => {
    const report = await applyOps([
      { op: "add_shape", shape: "rect", w: 0.8, h: 0.2, fill: "#ff3366", radius: 24, y: 0.2 },
      { op: "update", id: "new:0", blend: "multiply", locked: true },
    ]);
    expect(report).toMatchObject({ applied: 2, failed: 0 });
    const shape = useEditorStore.getState().clips.find((c) => c.kind === "shape");
    expect(shape).toMatchObject({ shape: "rect", w: 0.8, h: 0.2, fill: "#ff3366", radius: 24, blend: "multiply", locked: true });
    expect(shape?.transform?.y).toBe(0.2);
  });
});

describe("editor agent tolerance", () => {
  beforeEach(() => useEditorStore.getState().newProject());

  it("turns a size sent to set_canvas into the nearest aspect", async () => {
    await applyOps([{ op: "set_canvas", x: 1080, y: 1080 }]);
    expect(useEditorStore.getState().settings.aspectPreset).toBe("1:1");
    await applyOps([{ op: "set_canvas", width: 1080, height: 1920 }]);
    expect(useEditorStore.getState().settings.aspectPreset).toBe("9:16");
  });
});

describe("templates", () => {
  beforeEach(() => useEditorStore.getState().newProject());

  it("builds every template without stock photos and keeps layers the same length", async () => {
    const { TEMPLATES, applyTemplate } = await import("./templates");
    const t = ((k: string) => k) as unknown as import("i18next").TFunction;
    for (const tpl of TEMPLATES) {
      // Stock search needs the network; the rest of the template must still build.
      const ops = tpl.ops(t).filter((o) => o.op !== "add_stock");
      await applyTemplate({ ...tpl, ops: () => ops }, t);
      const s = useEditorStore.getState();
      expect(s.settings.aspectPreset).toBe(tpl.aspect);
      expect(s.clips.length).toBeGreaterThan(0);
      const ends = new Set(s.clips.map((c) => c.start + c.duration));
      expect(ends.size).toBe(1);
    }
  });
});
