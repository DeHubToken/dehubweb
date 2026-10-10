import React, { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Slider } from "@/components/ui/slider";
import { ShortcutsLayer } from "./ShortcutsLayer";

const { state } = vi.hoisted(() => ({ state: {
  settings: { fps: 30 }, currentTime: 0, isPlaying: false,
  selectedClipIds: [] as string[],
  setCurrentTime: vi.fn(), setIsPlaying: vi.fn(),
  splitAtPlayhead: vi.fn(), rippleDelete: vi.fn(),
} }));
vi.mock("@/store/editorStore", () => ({
  useEditorStore: { getState: () => state }, selectTimelineDuration: () => 10,
}));
vi.mock("@/store/editorUiStore", () => ({
  useEditorUiStore: { getState: () => ({ canvasFocus: false, draw: null }) }, recordOpts: () => ({}),
}));
vi.mock("@/lib/editor/render", () => ({ getTransform: vi.fn(), isVisualClip: vi.fn(), placementPatchAt: vi.fn() }));
vi.mock("@/lib/editor/keyframes", () => ({ keyAllAt: vi.fn(), resolveClipAt: vi.fn() }));

beforeEach(() => { vi.clearAllMocks(); state.currentTime = 0; state.selectedClipIds = []; });
afterEach(cleanup);

function Playhead() {
  const [time, setTime] = useState(0);
  return <Slider aria-label="Playhead" value={[time]} min={0} max={10} step={1 / 30}
    onValueChange={([next]) => { setTime(next); state.setCurrentTime(next); }} />;
}

describe("editor shortcut focus", () => {
  it("lets the actual playhead slider move one frame without a second global seek", () => {
    render(<><Playhead /><ShortcutsLayer /></>);
    fireEvent.keyDown(screen.getByRole("slider", { name: "Playhead" }), { key: "ArrowRight" });
    expect(state.setCurrentTime).toHaveBeenCalledTimes(1);
    expect(state.setCurrentTime).toHaveBeenCalledWith(1 / 30);
    expect(state.setIsPlaying).not.toHaveBeenCalled();
  });
  it("adjusts an inspector slider without moving the playhead", () => {
    const change = vi.fn();
    render(<><Slider aria-label="Volume" value={[1]} min={0} max={2} step={0.01} onValueChange={change} /><ShortcutsLayer /></>);
    fireEvent.keyDown(screen.getByRole("slider", { name: "Volume" }), { key: "ArrowRight" });
    expect(change).toHaveBeenCalledTimes(1);
    expect(change).toHaveBeenCalledWith([1.01]);
    expect(state.setCurrentTime).not.toHaveBeenCalled();
  });
  it("keeps dropdown and nested menu keys local", () => {
    render(<><span role="combobox" tabIndex={0}><span data-testid="choice">Choice</span></span><ShortcutsLayer /></>);
    fireEvent.keyDown(screen.getByTestId("choice"), { key: "ArrowRight" });
    expect(state.setCurrentTime).not.toHaveBeenCalled();
  });
  it("does not delete the selection while editing a control", () => {
    state.selectedClipIds = ["clip"];
    render(<><input aria-label="Title" /><div contentEditable suppressContentEditableWarning data-testid="editable"><span data-testid="editable-child">Text</span></div><ShortcutsLayer /></>);
    fireEvent.keyDown(screen.getByLabelText("Title"), { key: "Delete" });
    fireEvent.keyDown(screen.getByTestId("editable-child"), { key: "Delete" });
    expect(state.rippleDelete).not.toHaveBeenCalled();
  });
  it("preserves focused button activation instead of toggling playback", () => {
    render(<><button>Export</button><ShortcutsLayer /></>);
    fireEvent.keyDown(screen.getByRole("button", { name: "Export" }), { key: " " });
    expect(state.setIsPlaying).not.toHaveBeenCalled();
  });
  it("ignores a key already handled by another surface", () => {
    render(<><div data-testid="surface" onKeyDown={event => event.preventDefault()} /><ShortcutsLayer /></>);
    fireEvent.keyDown(screen.getByTestId("surface"), { key: "ArrowRight" });
    expect(state.setCurrentTime).not.toHaveBeenCalled();
  });
  it("retains ordinary timeline seeking", () => {
    state.currentTime = 2;
    render(<ShortcutsLayer />);
    fireEvent.keyDown(document.body, { key: "ArrowRight" });
    expect(state.setCurrentTime).toHaveBeenCalledWith(2.5);
  });
  it("moves Shift-arrow to the adjacent frame from an unsnapped scrub", () => {
    state.currentTime = 0.52;
    render(<ShortcutsLayer />);
    fireEvent.keyDown(document.body, { key: "ArrowRight", shiftKey: true });
    expect(state.setCurrentTime).toHaveBeenCalledWith(16 / 30);
  });
});
