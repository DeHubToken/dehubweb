import React from "react";
import { act, render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useCloudProjects } from "./useCloudProjects";
import type { CloudProjectSaveResult } from "./cloudProjectSession";
import type { ProjectSnapshot } from "./types";
const actor = "0x" + "b".repeat(40), owner = "0x" + "a".repeat(40), other = "0x" + "c".repeat(40);
const fixture = (id = "local"): ProjectSnapshot => ({ id, title: "Original", updatedAt: 1, settings: { width: 1920, height: 1080, fps: 30, aspectPreset: "16:9", background: "#000" }, clips: [], tracks: [] });
function setup(sourceOwner: string | null = owner) {
  let current = fixture(), cloud!: ReturnType<typeof useCloudProjects>;
  const combined = fixture("merged"); combined.settings.background = "#fff";
  const result: CloudProjectSaveResult = { projectId: "cloud", revision: 6, savedAt: "2026-10-08", mergedSnapshot: combined };
  const preserve = vi.fn(async () => {}), open = vi.fn((snapshot: ProjectSnapshot) => { current = snapshot; });
  const sharedOwner = vi.fn(async () => sourceOwner), save = vi.fn(async (_snapshot: ProjectSnapshot, _copy?: boolean) => result as CloudProjectSaveResult | undefined);
  const factory = (() => ({ uuid: () => "nonce", api: { list: async () => [] }, session: { sharedOwner, save } })) as unknown as Parameters<typeof useCloudProjects>[1];
  function Harness({ wallet = actor }: { wallet?: string }) {
    cloud = useCloudProjects(wallet, factory, { current: () => current, preserve, open });
    return <div>{cloud.linkPending ? "pending" : "ready"}{cloud.mergeCopy && <span>Combined copy</span>}</div>;
  }
  return { Harness, cloud: () => cloud, result, preserve, open, sharedOwner, save, current: () => current,
    change: () => { current.title = "Newer local"; }, switchProject: () => { current = fixture("other-project"); } };
}

describe.each([owner, null])("merged cloud copy delivery (shared owner=%s)", (sourceOwner) => {
  it("opens the saved combined copy when the editor still matches the captured draft", async () => {
    const env = setup(sourceOwner), screen = render(<env.Harness />); await waitFor(() => expect(screen.getByText("ready")).toBeTruthy());
    await act(async () => { await env.cloud().save(); });
    expect(env.open).toHaveBeenCalledWith(env.result.mergedSnapshot); expect(env.current().settings.background).toBe("#fff"); expect(env.cloud().mergeCopy).toBeNull();
  });
  it("keeps edits made during saving and exposes the separately saved combined copy", async () => {
    const env = setup(sourceOwner), screen = render(<env.Harness />); await waitFor(() => expect(screen.getByText("ready")).toBeTruthy());
    let finish!: (result: CloudProjectSaveResult) => void; env.save.mockImplementation(() => new Promise(resolve => { finish = resolve; })); let pending!: Promise<void>;
    await act(async () => { pending = env.cloud().save(); }); env.change();
    await act(async () => { finish(env.result); await pending; });
    expect(env.open).not.toHaveBeenCalled(); expect(env.current().title).toBe("Newer local"); expect(screen.getByText("Combined copy")).toBeTruthy();
    await act(async () => { await env.cloud().openMergeCopy(); }); expect(env.preserve).toHaveBeenCalledTimes(1); expect(env.open).toHaveBeenCalledWith(env.result.mergedSnapshot);
  });
  it("refuses to replace edits made while explicitly preserving before opening the combined copy", async () => {
    const env = setup(sourceOwner), screen = render(<env.Harness />); await waitFor(() => expect(screen.getByText("ready")).toBeTruthy());
    env.save.mockImplementation(async () => { env.change(); return env.result; }); await act(async () => { await env.cloud().save(); });
    env.preserve.mockImplementation(async () => { env.switchProject(); });
    await act(async () => { await env.cloud().openMergeCopy(); });
    expect(env.open).not.toHaveBeenCalled(); expect(env.cloud().error).toBe("The current project changed during transfer");
  });
  it("never opens a previous project's combined result after a project switch during saving", async () => {
    const env = setup(sourceOwner), screen = render(<env.Harness />); await waitFor(() => expect(screen.getByText("ready")).toBeTruthy());
    env.save.mockImplementation(async () => { env.switchProject(); return env.result; }); await act(async () => { await env.cloud().save(); });
    expect(env.open).not.toHaveBeenCalled(); expect(env.cloud().mergeCopy).toBeNull(); expect(env.current().id).toBe("other-project");
  });
  it("discards another account's result after an account switch during saving", async () => {
    const env = setup(sourceOwner), screen = render(<env.Harness />); await waitFor(() => expect(screen.getByText("ready")).toBeTruthy());
    let finish!: (result: CloudProjectSaveResult) => void; env.save.mockImplementation(() => new Promise(resolve => { finish = resolve; })); let pending!: Promise<void>;
    await act(async () => { pending = env.cloud().save(); }); screen.rerender(<env.Harness wallet={other} />);
    await act(async () => { finish(env.result); await pending; }); expect(env.open).not.toHaveBeenCalled(); expect(env.cloud().mergeCopy).toBeNull();
  });
  it("captures the save before asynchronously looking up its shared owner", async () => {
    const env = setup(sourceOwner), screen = render(<env.Harness />); await waitFor(() => expect(screen.getByText("ready")).toBeTruthy());
    let finish!: (value: string | null) => void; env.sharedOwner.mockImplementation(() => new Promise(resolve => { finish = resolve; })); let pending!: Promise<void>;
    await act(async () => { pending = env.cloud().save(); }); env.change();
    await act(async () => { finish(sourceOwner); await pending; });
    expect(env.save).toHaveBeenCalledWith(expect.objectContaining({ title: "Original" }), false); expect(env.current().title).toBe("Newer local"); expect(env.open).not.toHaveBeenCalled();
  });
  it("keeps normal owner saves compatible with a result without a merged copy", async () => {
    const env = setup(sourceOwner), screen = render(<env.Harness />); await waitFor(() => expect(screen.getByText("ready")).toBeTruthy());
    env.save.mockResolvedValue(undefined); await act(async () => { await env.cloud().save(); }); expect(env.open).not.toHaveBeenCalled(); expect(env.cloud().saved).toBe(true);
  });
});
