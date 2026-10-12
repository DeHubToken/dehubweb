import { beforeEach, expect, it, vi } from "vitest";
import { loadCloudGenerationPage, loadCloudGenerations } from "./cloudLibrary";

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), fresh: vi.fn().mockResolvedValue("session") }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock("@/lib/api/dehub/core", () => ({ ensureFreshToken: mocks.fresh }));
beforeEach(() => { vi.clearAllMocks(); });

it("loads a specific account's next saved page without changing the generation queue", async () => {
  const jobs = Array.from({ length: 100 }, (_, index) => ({ id: `saved-${index}`, kind: "audio", status: "done" }));
  mocks.invoke.mockResolvedValue({ data: { jobs, nextOffset: 200 }, error: null });
  expect(await loadCloudGenerationPage("owner", 100)).toEqual({ jobs, nextOffset: 200 });
  expect(mocks.invoke).toHaveBeenCalledWith("creator-library", { body: { action: "list", offset: 100 }, headers: { "x-dehub-token": "session", "x-wallet-address": "owner" } });
  expect(mocks.invoke).toHaveBeenCalledTimes(1);
});

it.each([-1, 10001, 1.5, NaN])("rejects invalid page offsets %s before a request", async offset => {
  await expect(loadCloudGenerationPage("owner", offset)).rejects.toThrow("Invalid library page");
  expect(mocks.invoke).not.toHaveBeenCalled();
});

it.each([0, 10000, 10100, "100", null])("does not follow an invalid or repeated next offset %s", async nextOffset => {
  mocks.invoke.mockResolvedValue({ data: { jobs: [], nextOffset }, error: null });
  expect((await loadCloudGenerationPage("owner", 10000)).nextOffset).toBeNull();
});

it("keeps the existing first-page sync interface and bounded metadata", async () => {
  mocks.invoke.mockResolvedValue({ data: { jobs: Array.from({ length: 150 }, (_, index) => ({ id: String(index) })), nextOffset: 100 }, error: null });
  expect(await loadCloudGenerations("owner")).toHaveLength(100);
});
