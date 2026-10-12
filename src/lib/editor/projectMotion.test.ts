import { describe, it, expect } from "vitest";
import { useEditorStore } from "@/store/editorStore";
import { applyTemplate } from "./templates";
import { VIDEO_TEMPLATES } from "./videoTemplates";
import type { Clip } from "./types";
import { hasTimelineMotion } from "./projectMotion";
import en from "../../i18n/locales/en.json";

const t = ((key: string, options?: { defaultValue?: string }) => {
  const value = key.split(".").reduce<unknown>((node, part) => node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined, en);
  return typeof value === "string" ? value : options?.defaultValue ?? key;
}) as unknown as import("i18next").TFunction;
const layer = (patch: Partial<Clip> = {}) => ({ id: "text", trackId: "words", kind: "text", start: 0, duration: 4, trimIn: 0, text: "A static card", fontFamily: "Inter", fontSize: 48, color: "#ffffff", x: 0.5, y: 0.5, ...patch }) as Clip;

describe("motion export classification", () => {
  it("keeps unanimated cards and empty projects as stills", () => {
    expect(hasTimelineMotion([])).toBe(false);
    expect(hasTimelineMotion([layer()])).toBe(false);
    expect(hasTimelineMotion([layer({ animateIn: { kind: "none", duration: 1 }, keyframes: { opacity: [{ t: 0, v: 1 }, { t: 3, v: 1 }] } })])).toBe(false);
    expect(hasTimelineMotion([layer({ animateOut: { kind: "fade", duration: 0 } })])).toBe(false);
  });
  it("keeps recorded video and audio as timeline exports", () => {
    expect(hasTimelineMotion([layer({ kind: "video" })])).toBe(true);
    expect(hasTimelineMotion([layer({ kind: "audio" })])).toBe(true);
  });
  it("exports entrances, exits, transitions and moving keyframes", () => {
    expect(hasTimelineMotion([layer({ animateIn: { kind: "rise", duration: 0.5 } })])).toBe(true);
    expect(hasTimelineMotion([layer({ animateOut: { kind: "fade", duration: 0.5 } })])).toBe(true);
    expect(hasTimelineMotion([layer({ transitionOut: { kind: "fade", duration: 0.5 } })])).toBe(true);
    expect(hasTimelineMotion([layer({ keyframes: { x: [{ t: 0, v: 0.2 }, { t: 3, v: 0.8 }] } })])).toBe(true);
  });
  for (const template of VIDEO_TEMPLATES) it(`${template.id} exports motion without a video source`, async () => {
    useEditorStore.getState().newProject();
    await applyTemplate(template, t);
    const clips = useEditorStore.getState().clips;
    expect(clips.some(clip => clip.kind === "video" || clip.kind === "audio")).toBe(false);
    expect(hasTimelineMotion(clips)).toBe(true);
  });
});
