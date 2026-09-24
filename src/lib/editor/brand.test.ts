import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "@/store/editorStore";
import { useBrandStore } from "@/store/editorBrandStore";
import { applyOps } from "./agent";
import { applyBrand } from "./brand";

describe("brand kit", () => {
  beforeEach(() => {
    useEditorStore.getState().newProject();
    useBrandStore.getState().update({ colors: [], headingFont: null, bodyFont: null, logoMediaId: null });
  });

  it("applies heading and body fonts, readable colours and shape fills in one undo", async () => {
    await applyOps([
      { op: "set_canvas", background: "#000000" },
      { op: "add_shape", shape: "rect", fill: "#123456" },
      { op: "add_text", text: "Big title", fontSize: 160 },
      { op: "add_text", text: "small line", fontSize: 40 },
    ]);
    useBrandStore.getState().update({ colors: ["#ff5500", "#0a0a0a"], headingFont: "'Anton', sans-serif", bodyFont: "'Inter', sans-serif" });
    const changed = await applyBrand();
    expect(changed).toBe(3);
    const s = useEditorStore.getState();
    const [shape, title, body] = s.clips;
    expect(shape).toMatchObject({ fill: "#ff5500" });
    expect(title).toMatchObject({ fontFamily: "'Anton', sans-serif", color: "#ff5500" });
    // #0a0a0a would be unreadable on black, so text skips it.
    expect(body).toMatchObject({ fontFamily: "'Inter', sans-serif", color: "#ff5500" });
    s.undo();
    expect(useEditorStore.getState().clips[1]).not.toMatchObject({ fontFamily: "'Anton', sans-serif" });
  });
});
