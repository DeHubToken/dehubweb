import { describe, it, expect, vi } from "vitest";
import { prepareFileShare } from "./shareFile";

describe("finished export sharing", () => {
  it("offers the real exported file without opening a picker until clicked", async () => {
    const blob = new Blob(["encoded video"], { type: "video/mp4" });
    const api = { canShare: vi.fn((_data: ShareData) => true), share: vi.fn().mockResolvedValue(undefined) };
    const click = prepareFileShare(blob, "My_edit.mp4", api);
    expect(api.share).not.toHaveBeenCalled();
    const file = api.canShare.mock.calls[0][0].files![0];
    expect([file.name, file.type, file.size]).toEqual(["My_edit.mp4", "video/mp4", blob.size]);
    expect(await click!()).toBe(true);
    expect(api.share).toHaveBeenCalledWith({ title: "My_edit.mp4", files: [file] });
  });
  it("keeps downloads available on unsupported devices", () => {
    const blob = new Blob(["video"], { type: "video/mp4" });
    expect(prepareFileShare(blob, "edit.mp4", {})).toBeNull();
    expect(prepareFileShare(blob, "edit.mp4", { canShare: () => false, share: vi.fn() })).toBeNull();
    expect(prepareFileShare(blob, "edit.mp4", { canShare: () => { throw new Error("not permitted"); }, share: vi.fn() })).toBeNull();
  });
  it("treats dismissal as cancellation and avoids overlapping pickers", async () => {
    let finish!: () => void;
    const api = { canShare: () => true, share: vi.fn(() => new Promise<void>(resolve => { finish = resolve; })) };
    const click = prepareFileShare(new Blob(["video"], { type: "video/mp4" }), "edit.mp4", api)!;
    const pending = click(); expect(await click()).toBe(false); expect(api.share).toHaveBeenCalledOnce(); finish(); expect(await pending).toBe(true);
    api.share.mockRejectedValueOnce(Object.assign(new Error("dismissed"), { name: "AbortError" }));
    expect(await click()).toBe(false);
    api.share.mockRejectedValueOnce(new Error("unavailable")); await expect(click()).rejects.toThrow("unavailable");
  });
});
