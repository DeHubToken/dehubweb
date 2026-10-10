import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startScreenCapture } from "./screenCapture";

class Track {
  readyState: MediaStreamTrackState = "live";
  stop = vi.fn(() => { this.readyState = "ended"; });
  constructor(public kind: "audio" | "video") {}
}
class Stream {
  constructor(private tracks: Track[] = []) {}
  getTracks() { return this.tracks; }
  getAudioTracks() { return this.tracks.filter(track => track.kind === "audio"); }
  getVideoTracks() { return this.tracks.filter(track => track.kind === "video"); }
}
const asMedia = (...tracks: Track[]) => new Stream(tracks) as unknown as MediaStream;
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
let video: Track, system: Track, voice: Track, mixed: Track;
let display: ReturnType<typeof vi.fn>, microphone: ReturnType<typeof vi.fn>;
let contexts: Mixer[];
class Mixer {
  state: AudioContextState = "suspended";
  sources: MediaStream[] = [];
  gains: { gain: { value: number }; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] = [];
  destination = { stream: asMedia(mixed), disconnect: vi.fn() };
  resume = vi.fn(async () => { this.state = "running"; });
  close = vi.fn(async () => { this.state = "closed"; });
  constructor() { contexts.push(this); }
  createMediaStreamDestination() { return this.destination; }
  createMediaStreamSource(stream: MediaStream) { this.sources.push(stream); return { connect: vi.fn(), disconnect: vi.fn() }; }
  createGain() { const gain = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() }; this.gains.push(gain); return gain; }
}
beforeEach(() => {
  video = new Track("video"); system = new Track("audio"); voice = new Track("audio"); mixed = new Track("audio"); contexts = [];
  display = vi.fn(async () => asMedia(video, system)); microphone = vi.fn(async () => asMedia(voice));
  vi.stubGlobal("navigator", { mediaDevices: { getDisplayMedia: display, getUserMedia: microphone } });
  vi.stubGlobal("MediaStream", Stream); vi.stubGlobal("AudioContext", Mixer);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("screen recording with optional narration", () => {
  it("opens the OS picker immediately and preserves shared audio without asking for a microphone", async () => {
    const capture = startScreenCapture(false, () => true);
    expect(display).toHaveBeenCalledTimes(1);
    expect(display).toHaveBeenCalledWith({ video: { frameRate: 30 }, audio: true, systemAudio: "include" });
    const stream = await capture.ready;
    expect(stream.getVideoTracks()).toEqual([video]); expect(stream.getAudioTracks()).toEqual([system]);
    expect(microphone).not.toHaveBeenCalled(); expect(contexts).toHaveLength(0);
    capture.dispose(); capture.dispose();
    expect(video.stop).toHaveBeenCalledTimes(1); expect(system.stop).toHaveBeenCalledTimes(1);
  });

  it("mixes shared sound and narration into one audio track while retaining the original screen frames", async () => {
    const capture = startScreenCapture(true, () => true), stream = await capture.ready;
    expect(microphone).toHaveBeenCalledWith({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
    expect(stream.getVideoTracks()).toEqual([video]); expect(stream.getAudioTracks()).toEqual([mixed]);
    expect(contexts).toHaveLength(1); expect(contexts[0].sources.map(source => source.getAudioTracks())).toEqual([[system], [voice]]);
    expect(contexts[0].gains.map(gain => gain.gain.value)).toEqual([0.5, 0.5]);
    expect(contexts[0].gains.every(gain => gain.connect.mock.calls[0][0] === contexts[0].destination)).toBe(true);
    capture.dispose(); capture.dispose();
    for (const track of [video, system, voice, mixed]) expect(track.stop).toHaveBeenCalledTimes(1);
    expect(contexts[0].close).toHaveBeenCalledTimes(1); expect(contexts[0].destination.disconnect).toHaveBeenCalledTimes(1);
  });

  it("records narration when the browser supplies no system audio", async () => {
    display.mockResolvedValue(asMedia(video));
    const capture = startScreenCapture(true, () => true), stream = await capture.ready;
    expect(stream.getAudioTracks()).toEqual([voice]); expect(contexts).toHaveLength(0);
    capture.dispose(); expect(voice.stop).toHaveBeenCalledTimes(1);
  });

  it("supports a silent screen take when the chosen browser surface has no audio", async () => {
    display.mockResolvedValue(asMedia(video));
    const capture = startScreenCapture(false, () => true), stream = await capture.ready;
    expect(stream.getVideoTracks()).toEqual([video]); expect(stream.getAudioTracks()).toHaveLength(0); expect(microphone).not.toHaveBeenCalled();
    capture.dispose();
  });

  it("closes a display returned after cancellation and never requests a microphone for that take", async () => {
    const permission = deferred<MediaStream>(); display.mockReturnValue(permission.promise);
    const capture = startScreenCapture(true, () => true), rejected = expect(capture.ready).rejects.toMatchObject({ name: "AbortError" });
    capture.dispose(); permission.resolve(asMedia(video, system)); await rejected;
    expect(video.stop).toHaveBeenCalledTimes(1); expect(system.stop).toHaveBeenCalledTimes(1); expect(microphone).not.toHaveBeenCalled();
  });

  it("stops an already shared display immediately while microphone permission is pending, then closes the late microphone", async () => {
    const permission = deferred<MediaStream>(); microphone.mockReturnValue(permission.promise);
    const capture = startScreenCapture(true, () => true), rejected = expect(capture.ready).rejects.toMatchObject({ name: "AbortError" });
    await Promise.resolve(); expect(microphone).toHaveBeenCalledTimes(1);
    capture.dispose(); expect(video.stop).toHaveBeenCalledTimes(1); expect(system.stop).toHaveBeenCalledTimes(1);
    permission.resolve(asMedia(voice)); await rejected;
    expect(voice.stop).toHaveBeenCalledTimes(1); expect(contexts).toHaveLength(0);
  });

  it("does not create a recorder after the shared surface ends during microphone permission", async () => {
    const permission = deferred<MediaStream>(); microphone.mockReturnValue(permission.promise);
    const capture = startScreenCapture(true, () => true), rejected = expect(capture.ready).rejects.toMatchObject({ name: "AbortError" });
    await Promise.resolve(); video.stop(); permission.resolve(asMedia(voice)); await rejected;
    expect(system.stop).toHaveBeenCalledTimes(1); expect(voice.stop).toHaveBeenCalledTimes(1); expect(contexts).toHaveLength(0);
  });

  it("discards the display when project ownership changes before permission returns", async () => {
    const permission = deferred<MediaStream>(); display.mockReturnValue(permission.promise); let current = true;
    const capture = startScreenCapture(true, () => current), rejected = expect(capture.ready).rejects.toMatchObject({ name: "AbortError" });
    current = false; permission.resolve(asMedia(video, system)); await rejected;
    expect(video.stop).toHaveBeenCalledTimes(1); expect(microphone).not.toHaveBeenCalled();
  });

  it("cleans up the display when optional microphone permission is denied", async () => {
    microphone.mockRejectedValue(new Error("permission denied"));
    const capture = startScreenCapture(true, () => true);
    await expect(capture.ready).rejects.toThrow("permission denied");
    expect(video.stop).toHaveBeenCalledTimes(1); expect(system.stop).toHaveBeenCalledTimes(1); expect(contexts).toHaveLength(0);
  });

  it("refuses silent mixer startup and releases every captured source", async () => {
    vi.spyOn(Mixer.prototype, "createMediaStreamDestination").mockImplementation(function (this: Mixer) {
      this.resume.mockRejectedValue(new Error("mixer failed")); return this.destination;
    });
    const capture = startScreenCapture(true, () => true);
    await expect(capture.ready).rejects.toThrow("mixer failed");
    for (const track of [video, system, voice, mixed]) expect(track.stop).toHaveBeenCalledTimes(1);
    expect(contexts[0].close).toHaveBeenCalledTimes(1);
  });
});
