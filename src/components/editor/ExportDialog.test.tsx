import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExportDialog } from "./ExportDialog";
import { useEditorStore } from "@/store/editorStore";
import { exportStill } from "@/lib/editor/exporter";
import { zipFiles } from "@/lib/editor/zip";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/lib/editor/exporter", () => ({ exportStill: vi.fn(), exportProject: vi.fn(), isExportSupported: () => false }));
vi.mock("@/lib/editor/zip", () => ({ zipFiles: vi.fn() }));
vi.mock("@/components/ui/liquid-glass-bubble-2", () => ({
  LiquidGlassBubble2: ({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) => <button onClick={onClick} disabled={disabled}>{label}</button>,
}));

describe("page download naming", () => {
  let downloaded: string[];
  beforeEach(() => {
    vi.clearAllMocks(); downloaded = [];
    useEditorStore.getState().newProject();
    useEditorStore.setState({ projectTitle: "Café launch", settings: { ...useEditorStore.getState().settings, pages: [0, 5] } });
    vi.mocked(exportStill).mockResolvedValue({ blob: new Blob(["page"]), filename: "engine.png" });
    vi.mocked(zipFiles).mockResolvedValue(new Blob(["archive"], { type: "application/zip" }));
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:download"), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { downloaded.push(this.download); });
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("downloads the titled ZIP with two indexed PNG pages without changing the project", async () => {
    const settings = useEditorStore.getState().settings;
    const clips = useEditorStore.getState().clips;
    const close = vi.fn();
    render(<ExportDialog open onOpenChange={close} />);
    fireEvent.click(screen.getByRole("button", { name: "editor.export.download" }));
    await waitFor(() => expect(downloaded).toEqual(["Café_launch.zip"]));
    expect(vi.mocked(zipFiles).mock.calls[0][0].map(file => file.name)).toEqual(["Café_launch-01.png", "Café_launch-02.png"]);
    expect(vi.mocked(exportStill).mock.calls.map(([options]) => options.time)).toEqual([0, 5]);
    expect(close).toHaveBeenCalledWith(false);
    expect(useEditorStore.getState().settings).toBe(settings);
    expect(useEditorStore.getState().clips).toBe(clips);
  });
});
