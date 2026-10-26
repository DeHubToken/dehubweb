import { describe, expect, it } from "vitest";
import { shortcutAction, shortcutList } from "./shortcutPresets";

const key = (k: string, mods: Partial<{ meta: boolean; ctrl: boolean; shift: boolean; alt: boolean }> = {}) =>
  ({ key: k, metaKey: !!mods.meta, ctrlKey: !!mods.ctrl, shiftKey: !!mods.shift, altKey: !!mods.alt });

describe("shortcut presets", () => {
  it("maps each editor's split key", () => {
    expect(shortcutAction("premiere", key("k", { meta: true }))).toBe("split");
    expect(shortcutAction("finalcut", key("b", { meta: true }))).toBe("split");
    expect(shortcutAction("resolve", key("B", { ctrl: true }))).toBe("split");
    expect(shortcutAction("capcut", key("b", { ctrl: true }))).toBe("split");
  });
  it("keeps DeHub's own layout untouched", () => {
    expect(shortcutAction("dehub", key("k", { meta: true }))).toBeNull();
    expect(shortcutAction("dehub", key("l"))).toBeNull();
  });
  it("supports J K L transport and ripple delete", () => {
    expect(shortcutAction("premiere", key("l"))).toBe("play");
    expect(shortcutAction("premiere", key("k"))).toBe("pause");
    expect(shortcutAction("premiere", key("Delete", { shift: true }))).toBe("rippleDelete");
    expect(shortcutAction("premiere", key("Delete"))).toBe("liftDelete");
  });
  it("lists readable keys", () => {
    expect(shortcutList("finalcut", true)).toContainEqual({ keys: "⌘ + B", action: "split" });
    expect(shortcutList("premiere", false)).toContainEqual({ keys: "Ctrl + K", action: "split" });
  });
});
