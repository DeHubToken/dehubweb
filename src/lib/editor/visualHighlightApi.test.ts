import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
import { analyseVisualHighlights } from "./visualHighlightApi";
import { visualSampleTimes, type VisualBatch } from "./visualHighlightContract";
import { JPEG } from "./visualHighlightFixture";
const windows = [{ id: 0, start: 0, end: 6 }];
const batch = (purpose?: "matching"): VisualBatch => ({ optIn: true, duration: 6, seconds: 15, focus: "red scenes", purpose, windows,
  frames: visualSampleTimes(windows[0]).map(at => ({ windowId: 0, at, dataUrl: JPEG })) });
const moments = [{ start: 0, end: 2, score: 0.95, description: "Red title card", focusMatch: true }];

beforeEach(() => vi.clearAllMocks());
describe("visual matching contract rollout", () => {
  it.each([1, 2])("accepts matching contract %i with one unchanged sample request", async contract => {
    const request = batch("matching"), signal = new AbortController().signal;
    mocks.invoke.mockResolvedValue({ data: { contract, moments }, error: null });
    expect(await analyseVisualHighlights(request, signal)).toEqual(moments);
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.invoke).toHaveBeenCalledWith("editor-visual-highlights", { body: request, signal });
  });
  it("keeps ordinary highlight responses on contract one", async () => {
    mocks.invoke.mockResolvedValue({ data: { contract: 1, moments }, error: null });
    expect(await analyseVisualHighlights(batch(), new AbortController().signal)).toEqual(moments);
  });
  it.each([[undefined, 2], ["matching", 3], ["matching", 0]] as const)("rejects incompatible %s contract %i without retrying", async (purpose, contract) => {
    mocks.invoke.mockResolvedValue({ data: { contract, moments }, error: null });
    await expect(analyseVisualHighlights(batch(purpose), new AbortController().signal)).rejects.toThrow("unavailable");
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });
});
