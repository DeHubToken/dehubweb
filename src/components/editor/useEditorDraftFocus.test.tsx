import { useState } from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorDraftFocus } from "./useEditorDraftFocus";
import { useEditorStore } from "@/store/editorStore";
import { projectReviewSnapshotKey } from "@/lib/editor/cloudProjectReview";
import type { ProjectEditLease } from "@/lib/editor/projectEditGate";

beforeEach(() => {
  useEditorStore.getState().newProject();
  useEditorStore.setState({ tracks: [{ id: "v", kind: "video", name: "Video", hidden: false, muted: false }], clips: [{ id: "clip", kind: "video", trackId: "v", mediaId: "video", start: 0, trimIn: 0, duration: 10 }] });
});
afterEach(cleanup);
function Field({ id = "first", changed = () => {} }: { id?: string; changed?: () => void }) {
  const focus = useEditorDraftFocus(id, false), [text, setText] = useState("10");
  return <div {...focus.props}><input aria-label={id} value={text} onChange={e => setText(e.target.value)} onBlur={() => {
    changed();
    const store = useEditorStore.getState();
    if (Number(text) !== store.clips[0].duration) store.updateMediaClip("clip", { duration: Number(text) });
  }} /></div>;
}

describe("real input focus and shared timeline ownership", () => {
  it("excludes receiving as soon as a draft gains focus", () => {
    const view = render(<Field />), before = useEditorStore.getState().toSnapshot();
    fireEvent.focus(view.getByRole("textbox"));
    expect(useEditorStore.getState().editing).toBe(true); expect(useEditorStore.getState().past).toHaveLength(0);
    expect(() => useEditorStore.getState().applySharedSnapshot(before, projectReviewSnapshotKey(before))).toThrow("project changed");
    fireEvent.blur(view.getByRole("textbox")); expect(useEditorStore.getState().editing).toBe(false);
  });

  it("keeps ownership through the actual child blur commit", () => {
    const changed = vi.fn(() => expect(useEditorStore.getState().editing).toBe(true));
    const view = render(<Field changed={changed} />), input = view.getByRole("textbox");
    fireEvent.focus(input); fireEvent.change(input, { target: { value: "7" } });
    expect(useEditorStore.getState().clips[0].duration).toBe(10); fireEvent.blur(input);
    expect(changed).toHaveBeenCalledTimes(1); expect(useEditorStore.getState().clips[0].duration).toBe(7);
    expect(useEditorStore.getState().editing).toBe(false); useEditorStore.getState().undo();
    expect(useEditorStore.getState().clips[0].duration).toBe(10); expect(useEditorStore.getState().past).toHaveLength(0);
  });

  it("rejects old typing and blur after a same-ID reset without releasing newer ownership", () => {
    const changed = vi.fn(), view = render(<Field changed={changed} />), input = view.getByRole("textbox");
    fireEvent.focus(input); fireEvent.change(input, { target: { value: "7" } });
    const before = useEditorStore.getState().toSnapshot(); let next!: ProjectEditLease;
    act(() => { useEditorStore.getState().loadSnapshot(before); next = useEditorStore.getState().holdEdits(); });
    fireEvent.change(input, { target: { value: "4" } }); fireEvent.blur(input);
    expect(changed).not.toHaveBeenCalled(); expect(useEditorStore.getState().clips[0].duration).toBe(10);
    expect(next.isCurrent()).toBe(true); act(() => next.release());
  });

  it("keeps another focused draft protected when the first loses focus", () => {
    const view = render(<><Field /><Field id="second" /></>);
    fireEvent.focus(view.getByRole("textbox", { name: "first" })); fireEvent.focus(view.getByRole("textbox", { name: "second" }));
    fireEvent.blur(view.getByRole("textbox", { name: "first" })); expect(useEditorStore.getState().editing).toBe(true);
    fireEvent.blur(view.getByRole("textbox", { name: "second" })); expect(useEditorStore.getState().editing).toBe(false);
  });

  it("releases an unmounted input and preserves its existing Redo", () => {
    useEditorStore.getState().updateMediaClip("clip", { duration: 8 }); useEditorStore.getState().undo();
    const view = render(<Field />); fireEvent.focus(view.getByRole("textbox")); view.unmount();
    expect(useEditorStore.getState().editing).toBe(false); expect(useEditorStore.getState().future).toHaveLength(1);
    useEditorStore.getState().redo(); expect(useEditorStore.getState().clips[0].duration).toBe(8);
  });
});
