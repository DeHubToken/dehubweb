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
