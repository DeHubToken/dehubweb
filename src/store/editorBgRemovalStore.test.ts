import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  remove: vi.fn(), success: vi.fn(), error: vi.fn(),
  editor: { projectId: "project", clips: [{ id: "clip", kind: "video", trackId: "video", mediaId: "source", start: 0, trimIn: 0, duration: 2 }] },
}));
vi.mock("@/lib/editor/removeBackground", () => ({ removeLayerBackground: mocks.remove }));
vi.mock("@/store/editorStore", () => ({ useEditorStore: { getState: () => mocks.editor } }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock("@/i18n", () => ({ default: { t: (key: string) => key } }));
import { useBgRemovalStore } from "./editorBgRemovalStore";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.editor.projectId = "project";
  useBgRemovalStore.setState({ clipId: null, progress: null, failure: null });
});

it("keeps the reason after progress ends, clears it on retry and prevents parallel work", async () => {
  mocks.remove.mockRejectedValueOnce(new Error("Frame 78 could not be decoded"));
  await expect(useBgRemovalStore.getState().run("clip")).resolves.toBe(false);
  expect(useBgRemovalStore.getState()).toMatchObject({ clipId: null, progress: null, failure: { projectId: "project", clipId: "clip", message: "Frame 78 could not be decoded" } });
  let finish!: (value: boolean) => void;
  mocks.remove.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const retry = useBgRemovalStore.getState().run("clip");
  expect(useBgRemovalStore.getState().failure).toBeNull();
  await expect(useBgRemovalStore.getState().run("clip")).resolves.toBe(false);
  expect(mocks.remove).toHaveBeenCalledTimes(2);
  finish(true); await retry;
  expect(useBgRemovalStore.getState().failure).toBeNull();
});

it("retains a failed result without an exception until dismissed", async () => {
  mocks.remove.mockResolvedValueOnce(false);
  await useBgRemovalStore.getState().run("clip");
  expect(useBgRemovalStore.getState().failure?.message).toBe("editor.bgRemove.failed");
  useBgRemovalStore.getState().dismissFailure();
  expect(useBgRemovalStore.getState().failure).toBeNull();
});

it("does not attach a stale job's error to another project", async () => {
  mocks.remove.mockImplementationOnce(async () => { mocks.editor.projectId = "other"; throw new Error("Old video failed"); });
  await useBgRemovalStore.getState().run("clip");
  expect(useBgRemovalStore.getState().failure).toBeNull();
  expect(mocks.error).not.toHaveBeenCalled();
});

it("keeps explicit and source-change cancellation quiet", async () => {
  mocks.remove.mockImplementationOnce(async () => { useBgRemovalStore.getState().cancel(); throw new Error("Cancelled"); });
  await useBgRemovalStore.getState().run("clip");
  mocks.remove.mockRejectedValueOnce(new DOMException("Source changed", "AbortError"));
  await useBgRemovalStore.getState().run("clip");
  expect(useBgRemovalStore.getState().failure).toBeNull();
  expect(mocks.error).not.toHaveBeenCalled();
});
