import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CaptionsPanel } from "./CaptionsPanel";
import { useEditorDraftFocus } from "../useEditorDraftFocus";
import { useEditorStore } from "@/store/editorStore";
import { subtitleLayers } from "@/lib/editor/subtitles";
import { DEFAULT_SETTINGS } from "@/lib/editor/types";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: vi.fn() } } }));
vi.mock("@/i18n", () => ({ SUPPORTED_LANGUAGES: [{ code: "en", name: "English", nativeName: "English" }] }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string, options?: Record<string, unknown>) => String(options?.defaultValue ?? key).replace("{{total}}", String(options?.total ?? "")).replace("{{count}}", String(options?.count ?? "")) }) }));
afterEach(cleanup);

it("keeps caption inputs editable beside the inspector's real focus lock and commits one bulk Undo step", async () => {
  let id = 0;
  const layers = subtitleLayers([{ start: 0, end: 1, text: "Hello" }, { start: 1, end: 2, text: "Hello again" }], () => `c${++id}`);
  useEditorStore.getState().loadSnapshot({ id: "caption-focus", title: "Captions", updatedAt: 1, settings: DEFAULT_SETTINGS, tracks: [layers.track], clips: layers.clips });
  function Shell() {
    const focus = useEditorDraftFocus("inspector", true);
    return <><aside {...focus.props}><input aria-label="Inspector draft" /></aside><CaptionsPanel /></>;
  }
  render(<Shell />);
  const inspector = screen.getByLabelText("Inspector draft");
  fireEvent.focus(inspector);
  expect(useEditorStore.getState().editing).toBe(true);
  fireEvent.blur(inspector);
  expect(useEditorStore.getState().editing).toBe(false);
  fireEvent.click(screen.getByText("Edit captions · 2"));
  const search = screen.getByLabelText("Find in captions");
  fireEvent.focus(search);
  expect(useEditorStore.getState().editing).toBe(false);
  expect((search as HTMLInputElement).disabled).toBe(false);
  fireEvent.change(search, { target: { value: "Hello" } });
  expect((search as HTMLInputElement).value).toBe("Hello");
  fireEvent.blur(search);
  const replacement = screen.getByLabelText("Replace with");
  fireEvent.focus(replacement);
  fireEvent.change(replacement, { target: { value: "Hi" } });
  expect((replacement as HTMLInputElement).value).toBe("Hi");
  fireEvent.blur(replacement);
  fireEvent.click(screen.getByText("Replace in 2 captions"));
  await waitFor(() => expect(useEditorStore.getState().past).toHaveLength(1));
  expect(useEditorStore.getState().clips).toMatchObject([{ text: "Hi" }, { text: "Hi again" }]);
  act(() => { useEditorStore.getState().undo(); });
  expect(useEditorStore.getState().clips).toEqual(layers.clips);
});
