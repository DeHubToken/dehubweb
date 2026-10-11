import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CaptionTranslation } from "./CaptionTranslation";
import { useEditorStore } from "@/store/editorStore";
import { subtitleLayers } from "@/lib/editor/subtitles";
import { DEFAULT_SETTINGS } from "@/lib/editor/types";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock("@/i18n", () => ({ SUPPORTED_LANGUAGES: [{ code: "en", name: "English", nativeName: "English" }] }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string, options?: { defaultValue?: string; count?: number }) => (options?.defaultValue ?? key).replace("{{count}}", String(options?.count ?? "")) }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
  mocks.invoke.mockReset();
  let id = 0;
  const layers = subtitleLayers([{ start: 0, end: 1, text: "Hello" }, { start: 1, end: 2, text: "World" }], () => `c${++id}`);
  useEditorStore.getState().loadSnapshot({ id: "caption-ui", title: "Captions", updatedAt: 1, settings: DEFAULT_SETTINGS, tracks: [layers.track], clips: layers.clips });
});
afterEach(cleanup);

it("uses the private provider route and commits all captions as one actual Undo step", async () => {
  mocks.invoke.mockResolvedValueOnce({ data: { translatedText: "Bonjour" } }).mockResolvedValueOnce({ data: { translatedText: "Monde" } });
  render(<CaptionTranslation disabled={false} onBusyChange={() => {}} />);
  fireEvent.click(screen.getByText("Translate 2 captions"));
  await waitFor(() => expect(useEditorStore.getState().past).toHaveLength(1));
  expect(mocks.invoke).toHaveBeenNthCalledWith(1, "translate-text", { body: { text: "Hello", targetLang: "en", public: false } });
  expect(mocks.invoke).toHaveBeenNthCalledWith(2, "translate-text", { body: { text: "World", targetLang: "en", public: false } });
  expect(useEditorStore.getState().clips.map(clip => clip.kind === "text" ? clip.text : "")).toEqual(["Bonjour", "Monde"]);
  act(() => { useEditorStore.getState().undo(); });
  expect(useEditorStore.getState().clips.map(clip => clip.kind === "text" ? clip.text : "")).toEqual(["Hello", "World"]);
});

it("Cancel releases editing and discards a late provider response without another request", async () => {
  let finish!: (value: unknown) => void;
  mocks.invoke.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  render(<CaptionTranslation disabled={false} onBusyChange={() => {}} />);
  fireEvent.click(screen.getByText("Translate 2 captions"));
  await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByText("common.cancel"));
  expect(useEditorStore.getState().editing).toBe(false);
  await act(async () => { finish({ data: { translatedText: "Late text" } }); await Promise.resolve(); });
  expect(mocks.invoke).toHaveBeenCalledTimes(1);
  expect(useEditorStore.getState().past).toHaveLength(0);
  expect(useEditorStore.getState().clips[0]).toMatchObject({ text: "Hello" });
});
