import { afterEach, describe, expect, it, vi } from "vitest";
import { recordingExtension, recordingMime, recordStream } from "./recording";

describe("editor recording", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
  it("chooses an available container and names it correctly", () => {
    expect(recordingMime("camera", mime => mime === "video/mp4")).toBe("video/mp4");
    expect(recordingMime("audio", () => false)).toBeUndefined();
    expect(recordingExtension("audio/mp4")).toBe("mp4");
  });
  it("saves once and releases tracks; cancellation suppresses saving", () => {
    vi.useFakeTimers();
    class Recorder {
      static isTypeSupported() { return true; }
      state = "inactive"; mimeType = "audio/webm";
      ondataavailable?: (event: { data: Blob }) => void; onstop?: () => void;
      start() { this.state = "recording"; }
      stop() { this.state = "inactive"; this.ondataavailable?.({ data: new Blob(["sound"]) }); this.onstop?.(); }
    }
    vi.stubGlobal("MediaRecorder", Recorder);
    const release = vi.fn();
    const stream = { getTracks: () => [{ stop: release, addEventListener: vi.fn() }] } as unknown as MediaStream;
    const save = vi.fn(), failed = vi.fn();
    const first = recordStream(stream, "audio", save, failed); first.stop(); first.stop();
    expect(save).toHaveBeenCalledTimes(1); expect(release).toHaveBeenCalledTimes(1);
    const second = recordStream(stream, "audio", save, failed); second.stop(true);
    expect(save).toHaveBeenCalledTimes(1); expect(release).toHaveBeenCalledTimes(2); expect(failed).not.toHaveBeenCalled();
  });
  it("releases capture if constructing a recorder fails", () => {
    class Recorder { static isTypeSupported() { return false; } constructor() { throw new Error("unsupported"); } }
    vi.stubGlobal("MediaRecorder", Recorder);
    const release = vi.fn();
    const stream = { getTracks: () => [{ stop: release }] } as unknown as MediaStream;
    expect(() => recordStream(stream, "screen", vi.fn(), vi.fn())).toThrow("unsupported");
    expect(release).toHaveBeenCalledTimes(1);
  });
});
