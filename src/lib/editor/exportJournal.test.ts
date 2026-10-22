import { beforeEach, expect, it, vi } from "vitest";
const invoke = vi.hoisted(() => vi.fn(() => Promise.resolve({ data: { ok: true }, error: null })));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke } } }));
vi.mock("@/lib/api/dehub/core", () => ({ getAuthToken: () => "token" }));
vi.mock("@/store/editorStore", () => ({ useEditorStore: { getState: () => ({
  projectId: "project", projectTitle: "Trailer",
  clips: [{ id: "c1", mediaId: "m1" }, { id: "c2", kind: "text" }],
  media: [{ id: "m1", name: "dragon-job123.mp4" }, { id: "m2", name: "unused.mp4" }],
}) } }));
import { startExportJournal } from "./exportJournal";

beforeEach(() => invoke.mockClear());
const bodies = () => invoke.mock.calls.map(call => (call as unknown as [string, { body: Record<string, unknown>; headers?: Record<string, string> }])[1]);

it("journals the start and the failure with the timeline media and the error", () => {
  const journal = startExportJournal({ surface: "download", format: "mp4", width: 1920, height: 1080, durationSeconds: 10 });
  journal.failed(new DOMException("Unsupported codec type.", "NotSupportedError"));
  const [start, failed] = bodies();
  expect(invoke).toHaveBeenCalledWith("editor-export-log", expect.objectContaining({ headers: { "x-dehub-token": "token" } }));
  expect(start.body).toMatchObject({ event: "started", surface: "download", projectId: "project", mediaIds: ["m1"], mediaNames: ["dragon-job123.mp4"] });
  expect(failed.body).toMatchObject({ event: "failed", exportId: start.body.exportId, error: "NotSupportedError: Unsupported codec type." });
});

it("records a cancel as cancelled, not as a failure", () => {
  startExportJournal({ surface: "post", format: "mp4" }).failed(new DOMException("Export cancelled", "AbortError"));
  expect(bodies()[1].body).toMatchObject({ event: "cancelled", error: null });
});

it("records the size and codecs of a finished export and its backup", () => {
  const journal = startExportJournal({ surface: "post", format: "mp4" });
  journal.succeeded({ blob: new Blob(["1234"]), videoCodec: "avc1.42E028", audioCodec: "opus" });
  journal.backedUp("asset-1");
  expect(bodies()[1].body).toMatchObject({ event: "succeeded", bytes: 4, videoCodec: "avc1.42E028", audioCodec: "opus" });
  expect(bodies()[2].body).toMatchObject({ event: "backed_up", backupAssetId: "asset-1" });
});

it("never lets a journal failure reach the export", () => {
  invoke.mockImplementationOnce(() => { throw new Error("offline"); });
  expect(() => startExportJournal({ surface: "download", format: "mp4" })).not.toThrow();
});
