import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { LibraryPanel } from "./LibraryPanel";

const mocks = vi.hoisted(() => ({ page: vi.fn(), send: vi.fn().mockResolvedValue("imported"),
  quota: { walletAddress: "owner", badgeBalance: 1, username: "creator", refetchUsage: vi.fn().mockResolvedValue(undefined) },
  jobs: [{ id: "running-preserved", kind: "video", status: "running", stage: "Rendering" }],
  importIds: [] as string[],
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string, options: Record<string, unknown> = {}) => {
  const words: Record<string, string> = { "bookmarks.recent": "Recent", "creator.yourLibrary": "Your library", "editor.captions.nextText": "Next", "editor.captions.previousText": "Previous", "editor.pages.page": `Page ${options.number}` };
  return words[key] ?? options.defaultValue ?? key;
} }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/creator/cloudLibrary", () => ({ loadCloudGenerationPage: mocks.page }));
vi.mock("@/lib/creator/sendToEditor", () => ({ sendJobToEditor: mocks.send, subscribeToEditorImports: () => () => {}, getEditorImportIds: () => mocks.importIds, cancelEditorImport: vi.fn() }));
vi.mock("@/hooks/use-editor-quota", () => ({ useEditorQuota: () => mocks.quota }));
vi.mock("@/store/generationStore", () => ({ useGenerationStore: (select: (state: unknown) => unknown) => select({ jobs: mocks.jobs, cancel: vi.fn(), retry: vi.fn() }) }));
vi.mock("@/store/editorUiStore", () => ({ useEditorUiStore: (select: (state: unknown) => unknown) => select({ setPanel: vi.fn() }) }));
vi.mock("./DesignPanel", () => ({ PanelHeading: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2> }));
vi.mock("@/components/app/AppState", () => ({ AppState: () => <p>Empty</p> }));
const clients: QueryClient[] = [];
function fixture() {
  const client = new QueryClient(); clients.push(client);
  const child = <QueryClientProvider client={client}><LibraryPanel /></QueryClientProvider>;
  const view = render(child);
  return { view, rerender: () => view.rerender(<QueryClientProvider client={client}><LibraryPanel /></QueryClientProvider>) };
}
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); vi.clearAllMocks(); mocks.quota.walletAddress = "owner"; });

it("loads older saved media on demand and imports it without replacing running jobs", async () => {
  const older = { id: "older-video", kind: "video", status: "done", prompt: "Older saved footage", url: "https://media.example/older.mp4" };
  mocks.page.mockResolvedValueOnce({ jobs: Array.from({ length: 100 }, (_, index) => ({ id: `saved-${index}`, kind: "audio", status: "done", prompt: `Voice ${index}`, url: "https://media.example/voice.wav" })), nextOffset: 100 }).mockResolvedValueOnce({ jobs: [older], nextOffset: null });
  fixture(); expect(mocks.page).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("tab", { name: "Your library" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Next" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await waitFor(() => expect(screen.getByText("Page 2")).toBeInTheDocument());
  await waitFor(() => expect(screen.getAllByRole("button", { name: "Add to timeline" })).toHaveLength(1));
  fireEvent.click(screen.getByRole("button", { name: "Add to timeline" }));
  await waitFor(() => expect(mocks.send).toHaveBeenCalledWith(older, expect.objectContaining({ wallet: "owner" })));
  expect(mocks.page.mock.calls.map(call => call.slice(0, 2))).toEqual([["owner", 0], ["owner", 100]]);
  expect(mocks.jobs[0]).toMatchObject({ id: "running-preserved", status: "running" });
  fireEvent.click(screen.getByRole("tab", { name: "Recent" })); expect(screen.getByText("Rendering")).toBeInTheDocument();
});

it("does not show a previous account's late saved page", async () => {
  let finish!: (data: unknown) => void;
  mocks.page.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce({ jobs: [], nextOffset: null });
  const { rerender } = fixture(); fireEvent.click(screen.getByRole("tab", { name: "Your library" }));
  await waitFor(() => expect(mocks.page).toHaveBeenCalledWith("owner", 0));
  mocks.quota.walletAddress = "another-owner"; rerender();
  await waitFor(() => expect(mocks.page).toHaveBeenCalledWith("another-owner", 0));
  await act(async () => { finish({ jobs: [{ id: "private-old-photo", kind: "image", status: "done", prompt: "Old account private image", url: "https://media.example/old.png" }], nextOffset: null }); });
  expect(screen.queryByAltText("Old account private image")).not.toBeInTheDocument();
});
