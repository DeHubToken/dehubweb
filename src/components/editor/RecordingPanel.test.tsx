import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecordingPanel } from "./RecordingPanel";
import { useEditorStore } from "@/store/editorStore";
import { projectReviewSnapshotKey } from "@/lib/editor/cloudProjectReview";
import type { ProjectEditLease } from "@/lib/editor/projectEditGate";
import { importOneFile } from "@/lib/editor/importFiles";
import { recordStream } from "@/lib/editor/recording";
import { startScreenCapture } from "@/lib/editor/screenCapture";

const quota = vi.hoisted(() => ({ walletAddress: "first", overQuota: false, refetchUsage: vi.fn(async () => {}) }));
vi.mock("@/hooks/use-editor-quota", () => ({ useEditorQuota: () => quota }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/lib/editor/importFiles", () => ({ importOneFile: vi.fn() }));
vi.mock("@/lib/editor/recording", async () => ({ ...await vi.importActual<typeof import("@/lib/editor/recording")>("@/lib/editor/recording"), recordStream: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/lib/editor/screenCapture", () => ({ startScreenCapture: vi.fn() }));

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
let stopTrack: ReturnType<typeof vi.fn>, acquire: ReturnType<typeof vi.fn>;
function media() { return { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream; }
beforeEach(() => {
  vi.clearAllMocks(); quota.walletAddress = "first";
  useEditorStore.getState().newProject(); useEditorStore.setState({ media: [], currentTime: 3 });
  stopTrack = vi.fn(); acquire = vi.fn(async () => media());
  vi.stubGlobal("MediaRecorder", class {});
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: acquire, getDisplayMedia: acquire } });
  vi.mocked(startScreenCapture).mockImplementation(() => ({ ready: Promise.resolve(media()), dispose: vi.fn() }));
  vi.mocked(recordStream).mockImplementation((stream, _kind, complete) => {
    return { stop: (cancel = false) => { stream.getTracks().forEach(track => track.stop()); if (!cancel) complete(new Blob(["take"], { type: "audio/webm" }), 2); } };
  });
  vi.mocked(importOneFile).mockImplementation(async () => {
    useEditorStore.setState({ media: [{ id: "take", name: "take.webm", kind: "audio", mimeType: "audio/webm", size: 4, width: 0, height: 0, duration: 2, createdAt: 1, url: "blob:take" }] });
    return "take";
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const record = (view: ReturnType<typeof render>) => fireEvent.click(view.getByRole("button", { name: "creator.navAudio" }));

describe("recording permission and import ownership", () => {
  it("holds editing from permission until a one-step take is saved at its original playhead", async () => {
    const view = render(<RecordingPanel />); await act(async () => record(view));
    expect(useEditorStore.getState().editing).toBe(true);
    const snapshot = useEditorStore.getState().toSnapshot();
    expect(() => useEditorStore.getState().applySharedSnapshot(snapshot, projectReviewSnapshotKey(snapshot))).toThrow("project changed");
    act(() => useEditorStore.getState().setCurrentTime(9));
    await act(async () => fireEvent.click(view.getByRole("button", { name: "common.save" })));
    expect(useEditorStore.getState().clips).toHaveLength(1); expect(useEditorStore.getState().clips[0].start).toBe(3);
    expect(useEditorStore.getState().editing).toBe(false); expect(useEditorStore.getState().past).toHaveLength(1);
    act(() => useEditorStore.getState().undo()); expect(useEditorStore.getState().clips).toHaveLength(0);
    act(() => useEditorStore.getState().redo()); expect(useEditorStore.getState().clips).toHaveLength(1);
  });

  it("stops a late permission stream after a same-ID reset and preserves newer ownership", async () => {
    const permission = deferred<MediaStream>(); acquire.mockReturnValue(permission.promise);
    const view = render(<RecordingPanel />); record(view); expect(useEditorStore.getState().editing).toBe(true);
    let newer!: ProjectEditLease;
    act(() => { useEditorStore.getState().loadSnapshot(useEditorStore.getState().toSnapshot()); newer = useEditorStore.getState().holdEdits(); });
    await act(async () => permission.resolve(media()));
    expect(stopTrack).toHaveBeenCalledTimes(1); expect(recordStream).not.toHaveBeenCalled(); expect(importOneFile).not.toHaveBeenCalled();
    expect(newer.isCurrent()).toBe(true); act(() => newer.release());
  });

  it("cancels active capture immediately when the project scope resets", async () => {
    const view = render(<RecordingPanel />); await act(async () => record(view));
    act(() => useEditorStore.getState().loadSnapshot(useEditorStore.getState().toSnapshot()));
    expect(stopTrack).toHaveBeenCalledTimes(1); expect(importOneFile).not.toHaveBeenCalled(); expect(useEditorStore.getState().editing).toBe(false);
  });

  it("discards an already importing take after reset without releasing a newer lease", async () => {
    const imported = deferred<string | null>(); vi.mocked(importOneFile).mockReturnValue(imported.promise);
    const view = render(<RecordingPanel />); await act(async () => record(view));
    await act(async () => fireEvent.click(view.getByRole("button", { name: "common.save" })));
    expect(useEditorStore.getState().editing).toBe(true);
    let newer!: ProjectEditLease;
    const reset = useEditorStore.getState().toSnapshot();
    act(() => { useEditorStore.getState().loadSnapshot(reset); newer = useEditorStore.getState().holdEdits(); });
    await act(async () => imported.resolve("take"));
    expect(useEditorStore.getState().tracks).toEqual(reset.tracks); expect(useEditorStore.getState().clips).toEqual(reset.clips);
    expect(newer.isCurrent()).toBe(true); act(() => newer.release());
  });

  it("stops a stream returned after the recorder panel has unmounted", async () => {
    const permission = deferred<MediaStream>(); acquire.mockReturnValue(permission.promise);
    const view = render(<RecordingPanel />); record(view); view.unmount();
    await act(async () => permission.resolve(media()));
    expect(stopTrack).toHaveBeenCalledTimes(1); expect(recordStream).not.toHaveBeenCalled(); expect(useEditorStore.getState().editing).toBe(false);
  });

  it("discards permission completed under a different wallet", async () => {
    const permission = deferred<MediaStream>(); acquire.mockReturnValue(permission.promise);
    const view = render(<RecordingPanel />); record(view);
    quota.walletAddress = "second"; view.rerender(<RecordingPanel />);
    await act(async () => permission.resolve(media()));
    expect(stopTrack).toHaveBeenCalledTimes(1); expect(recordStream).not.toHaveBeenCalled(); expect(useEditorStore.getState().editing).toBe(false);
  });

  it("keeps the import wallet fixed and refuses its late result after an account change", async () => {
    const imported = deferred<string | null>(); vi.mocked(importOneFile).mockReturnValue(imported.promise);
    const view = render(<RecordingPanel />); await act(async () => record(view));
    await act(async () => fireEvent.click(view.getByRole("button", { name: "common.save" })));
    expect(importOneFile).toHaveBeenCalledWith(expect.any(File), { wallet: "first", duration: 2 });
    quota.walletAddress = "second"; view.rerender(<RecordingPanel />);
    await act(async () => imported.resolve("take"));
    expect(useEditorStore.getState().clips).toHaveLength(0); expect(useEditorStore.getState().editing).toBe(false);
  });

  it("cancels without importing or consuming an existing Redo", async () => {
    useEditorStore.getState().addTextClip(); useEditorStore.getState().undo();
    const view = render(<RecordingPanel />); await act(async () => record(view));
    fireEvent.click(view.getByRole("button", { name: "common.cancel" }));
    expect(importOneFile).not.toHaveBeenCalled(); expect(useEditorStore.getState().editing).toBe(false); expect(useEditorStore.getState().future).toHaveLength(1);
    act(() => useEditorStore.getState().redo()); expect(useEditorStore.getState().clips).toHaveLength(1);
  });

  it("releases editing when permission is denied", async () => {
    acquire.mockRejectedValue(new Error("denied")); const view = render(<RecordingPanel />);
    await act(async () => record(view)); expect(useEditorStore.getState().editing).toBe(false); expect(importOneFile).not.toHaveBeenCalled();
  });

  it("keeps narration optional and closes screen sources before the saved take finishes importing", async () => {
    const dispose = vi.fn(), imported = deferred<string | null>();
    vi.mocked(startScreenCapture).mockReturnValue({ ready: Promise.resolve(media()), dispose });
    vi.mocked(importOneFile).mockReturnValue(imported.promise);
    const view = render(<RecordingPanel />);
    await act(async () => fireEvent.click(view.getByRole("button", { name: "goLive.sourceScreen" })));
    expect(startScreenCapture).toHaveBeenCalledWith(false, expect.any(Function));
    await act(async () => fireEvent.click(view.getByRole("button", { name: "common.save" })));
    expect(dispose).toHaveBeenCalledTimes(1); expect(useEditorStore.getState().editing).toBe(true);
    await act(async () => imported.resolve(null)); expect(useEditorStore.getState().editing).toBe(false);
  });

  it("includes narration only when the creator selects it", async () => {
    const view = render(<RecordingPanel />);
    fireEvent.click(view.getByRole("checkbox", { name: "creator.presetGroupVoiceover" }));
    await act(async () => fireEvent.click(view.getByRole("button", { name: "goLive.sourceScreen" })));
    expect(startScreenCapture).toHaveBeenCalledWith(true, expect.any(Function));
  });

  it("releases pending screen and microphone acquisition immediately on a scope reset", async () => {
    const permission = deferred<MediaStream>(), dispose = vi.fn();
    vi.mocked(startScreenCapture).mockReturnValue({ ready: permission.promise, dispose });
    const view = render(<RecordingPanel />);
    fireEvent.click(view.getByRole("button", { name: "goLive.sourceScreen" }));
    act(() => useEditorStore.getState().loadSnapshot(useEditorStore.getState().toSnapshot()));
    expect(dispose).toHaveBeenCalledTimes(1); expect(useEditorStore.getState().editing).toBe(false);
    await act(async () => permission.resolve(media()));
    expect(recordStream).not.toHaveBeenCalled(); expect(importOneFile).not.toHaveBeenCalled();
  });
});
