import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TextPanel } from "./panels/TextPanel";
import { ScreenSwitch } from "./ScreenSwitch";
import { useEditorStore } from "@/store/editorStore";
import { applyTemplate } from "@/lib/editor/templates";
import { VIDEO_TEMPLATES } from "@/lib/editor/videoTemplates";
import { getPages, timelineDuration } from "@/lib/editor/pages";
import en from "@/i18n/locales/en.json";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string, options: Record<string, unknown> = {}) => {
  const translated = key.split(".").reduce<unknown>((node, part) => node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined, en);
  return String(translated ?? options.defaultValue ?? key).replace(/{{(\w+)}}/g, (_, name) => String(options[name] ?? ""));
} }) }));
vi.mock("@/i18n", () => ({ default: { t: (key: string) => key } }));
vi.mock("./panels/DesignPanel", () => ({ PanelHeading: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2> }));

const t = ((key: string, options?: { defaultValue?: string }) => {
  const value = key.split(".").reduce<unknown>((node, part) => node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined, en);
  return typeof value === "string" ? value : options?.defaultValue ?? key;
}) as import("i18next").TFunction;
const question = VIDEO_TEMPLATES.find(template => template.id === "video-question")!;

beforeEach(async () => {
  useEditorStore.getState().newProject();
  await applyTemplate(question, t);
});
afterEach(cleanup);

it("edits multiple screens without leaving text controls, preserving each edit and undo", () => {
  render(<TextPanel />);
  const first = (screen.getByRole("textbox", { name: "Edit text 2" }) as HTMLTextAreaElement).value;
  const before = useEditorStore.getState().past.length;
  const firstField = screen.getByRole("textbox", { name: "Edit text 2" });
  fireEvent.focus(firstField); fireEvent.change(firstField, { target: { value: "First revised headline" } }); fireEvent.blur(firstField);
  fireEvent.click(screen.getByRole("button", { name: "Page 2" }));
  const secondField = screen.getByRole("textbox", { name: "Edit text 2" });
  const second = (secondField as HTMLTextAreaElement).value;
  expect(second).not.toBe(first);
  expect(useEditorStore.getState().currentTime).toBe(3.6);
  fireEvent.focus(secondField); fireEvent.change(secondField, { target: { value: "Second revised headline" } }); fireEvent.blur(secondField);
  fireEvent.click(screen.getByRole("button", { name: "Page 3" }));
  expect(screen.getByText("Page 3 of 3")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Page 1" }));
  expect(screen.getByRole("textbox", { name: "Edit text 2" })).toHaveValue("First revised headline");
  expect(useEditorStore.getState().past).toHaveLength(before + 2);
  act(() => useEditorStore.getState().undo());
  fireEvent.click(screen.getByRole("button", { name: "Page 2" }));
  expect(screen.getByRole("textbox", { name: "Edit text 2" })).toHaveValue(second);
  act(() => useEditorStore.getState().redo());
  expect(screen.getByRole("textbox", { name: "Edit text 2" })).toHaveValue("Second revised headline");
  const state = useEditorStore.getState();
  expect(timelineDuration(state.settings, state.clips)).toBe(10);
});

it("switches the selected text role to the next screen while an inspector is open", () => {
  const first = useEditorStore.getState().clips.find(c => c.kind === "text" && c.start === 0 && c.y === 0.5)!;
  useEditorStore.getState().selectClip(first.id);
  render(<ScreenSwitch />);
  fireEvent.click(screen.getByRole("button", { name: "Page 2" }));
  const state = useEditorStore.getState();
  expect(state.clips.find(c => c.id === state.selectedClipIds[0])).toMatchObject({ kind: "text", start: 3, y: 0.5 });
  expect(state.currentTime).toBe(3.6);
});

it("finds the later screens in an already saved starter without rewriting its words", () => {
  const state = useEditorStore.getState();
  const clips = state.clips.map(c => c.kind === "text" ? { ...c, y: c.y === 0.34 ? 0.32 : c.y === 0.5 ? 0.47 : 0.65 } : c);
  const settings = { ...state.settings, pages: undefined };
  expect(getPages(settings, clips).map(page => [page.start, page.end])).toEqual([[0, 3], [3, 7], [7, 10]]);
  expect(timelineDuration(settings, clips)).toBe(10);
  expect(getPages(settings, clips.map(c => c.kind === "text" ? { ...c, maxWidth: undefined } : c))).toHaveLength(1);
});
