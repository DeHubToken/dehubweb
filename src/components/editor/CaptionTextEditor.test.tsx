import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CaptionTextEditor } from "./CaptionTextEditor";
import { useEditorStore } from "@/store/editorStore";
import { subtitleLayers } from "@/lib/editor/subtitles";
import { DEFAULT_SETTINGS } from "@/lib/editor/types";
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string, options?: Record<string, unknown>) => String(options?.defaultValue ?? key).replace("{{total}}", String(options?.total ?? "")) }) }));
beforeEach(() => {
  let id = 0;
  const layers = subtitleLayers([{ start: 0, end: 1, text: "Hello" }, { start: 1, end: 2, text: "Hello again" }], () => `c${++id}`);
  useEditorStore.getState().loadSnapshot({ id: "caption-text-ui", title: "Captions", updatedAt: 1, settings: DEFAULT_SETTINGS, tracks: [layers.track], clips: layers.clips });
});
afterEach(cleanup);
it("corrects repeated wording through the actual UI with one Undo", async () => {
  render(<CaptionTextEditor disabled={false} />);
  fireEvent.change(screen.getByLabelText("Find in captions"), { target: { value: "Hello" } });
  fireEvent.change(screen.getByLabelText("Replace with"), { target: { value: "Hi" } });
  fireEvent.click(screen.getByText("Replace in 2 captions"));
  await waitFor(() => expect(useEditorStore.getState().past).toHaveLength(1));
  expect(useEditorStore.getState().clips).toMatchObject([{ text: "Hi" }, { text: "Hi again" }]);
  act(() => { useEditorStore.getState().undo(); });
  expect(useEditorStore.getState().clips).toMatchObject([{ text: "Hello" }, { text: "Hello again" }]);
});
it("seeks a selected line and rejects a draft made stale by another edit", () => {
  render(<CaptionTextEditor disabled={false} />);
  fireEvent.click(screen.getByText("Hello again"));
  expect(useEditorStore.getState().currentTime).toBe(1);
  expect(useEditorStore.getState().selectedClipIds).toEqual([useEditorStore.getState().clips[1].id]);
  fireEvent.change(screen.getByLabelText("Caption text"), { target: { value: "Corrected" } });
  act(() => { useEditorStore.getState().patchClip(useEditorStore.getState().clips[1].id, { start: 3 }); });
  expect(screen.getByText("Captions changed. Reload the line before saving.")).toBeTruthy();
  expect((screen.getByText("Save caption") as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByText("Save caption"));
  expect(useEditorStore.getState().clips[1]).toMatchObject({ start: 3, text: "Hello again" });
  expect(useEditorStore.getState().past).toHaveLength(1);
});
it("saves one multiline caption while preserving its duration and style", async () => {
  render(<CaptionTextEditor disabled={false} />);
  const original = useEditorStore.getState().clips[1];
  fireEvent.click(screen.getByText("Hello again"));
  fireEvent.change(screen.getByLabelText("Caption text"), { target: { value: "Corrected\ncaption" } });
  fireEvent.click(screen.getByText("Save caption"));
  await waitFor(() => expect(screen.getByText("Caption changes saved.")).toBeTruthy());
  expect(useEditorStore.getState().clips[1]).toEqual({ ...original, text: "Corrected\ncaption" });
  expect(useEditorStore.getState().past).toHaveLength(1);
  act(() => { useEditorStore.getState().undo(); });
  expect(useEditorStore.getState().clips[1]).toEqual(original);
});
