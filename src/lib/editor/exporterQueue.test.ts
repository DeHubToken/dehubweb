import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { exportProject } from "./exporter";
import type { ProjectSnapshot } from "./types";
const calls = vi.hoisted(() => ({ draw: vi.fn(), outro: vi.fn() }));
vi.mock("./render", () => ({ drawClip: calls.draw }));
vi.mock("./brandOutro", async () => ({ ...await vi.importActual<typeof import("./brandOutro")>("./brandOutro"), drawBrandOutro: calls.outro }));
vi.mock("./brandOutroArtwork", () => ({ loadBrandOutroArtwork: async () => ({ logo: {}, background: {}, globe: {}, star: {} }) }));
vi.mock("./endingFile", () => ({ stampEnding: (blob: Blob) => blob }));
const muxers = vi.hoisted(() => ({ options: [] as Array<{ video: { codec: string }; audio?: { codec: string } }> }));
vi.mock("mp4-muxer", () => ({ ArrayBufferTarget: class { buffer = new ArrayBuffer(4); }, Muxer: class { constructor(options: { video: { codec: string }; audio?: { codec: string } }) { muxers.options.push(options); } addVideoChunk() {} addAudioChunk() {} finalize() {} } }));
const snapshot = { title: "4K queue", settings: { width: 3840, height: 2160, fps: 30, background: "black" }, tracks: [{ id: "visual", kind: "video" }], clips: [{ id: "shape", trackId: "visual", kind: "shape", start: 0, duration: 1, trimIn: 0 }] } as unknown as ProjectSnapshot;
type Input = { timestamp: number; close(): void };
type Init = { output(chunk: unknown, meta?: unknown): void; error(error: Error): void };
type Codec = { encodeQueueSize: number; state: string; config: Record<string, unknown>; close(): void };
let videos: Codec[], audios: Codec[], timestamps: number[], audioTimes: number[], frameCloses: number, audioCloses: number, videoPeak: number, audioPeak: number;
let failure: Error | undefined, stalled: boolean, unsupported: string[];
class Buffer {
  length: number; numberOfChannels: number; sampleRate: number; channels: Float32Array[];
  constructor(options: { length: number; numberOfChannels: number; sampleRate: number }) { Object.assign(this, options); this.length = options.length; this.numberOfChannels = options.numberOfChannels; this.sampleRate = options.sampleRate; this.channels = Array.from({ length: this.numberOfChannels }, () => new Float32Array(this.length)); }
  getChannelData(channel: number) { return this.channels[channel]; }
}
function codec(kind: "video" | "audio") {
  return class {
    static isConfigSupported(config: { codec: string }) { return Promise.resolve({ supported: !unsupported.some(prefix => config.codec.startsWith(prefix)), config }); }
    encodeQueueSize = 0; state = "configured"; config: Record<string, unknown> = {}; init: Init;
    constructor(init: Init) { this.init = init; (kind === "video" ? videos : audios).push(this); }
    configure(config: Record<string, unknown>) { this.config = config; }
    encode(input: Input) {
      this.encodeQueueSize++;
      if (kind === "video") videoPeak = Math.max(videoPeak, this.encodeQueueSize); else audioPeak = Math.max(audioPeak, this.encodeQueueSize);
      const timestamp = input.timestamp;
      if (stalled && kind === "video") {
        if (this.encodeQueueSize === 8 && failure) setTimeout(() => { this.encodeQueueSize = 0; this.state = "closed"; this.init.error(failure!); }, 50);
        return;
      }
      setTimeout(() => { this.encodeQueueSize--; (kind === "video" ? timestamps : audioTimes).push(timestamp); this.init.output({ timestamp }, kind === "video" ? { decoderConfig: { codec: "avc1.42E028", description: new Uint8Array([1]) } } : undefined); }, 30);
    }
    flush() { return new Promise<void>(resolve => { const check = () => this.encodeQueueSize ? setTimeout(check, 10) : resolve(); check(); }); }
    close() { this.state = "closed"; }
  };
}
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); muxers.options = []; videos = []; audios = []; timestamps = []; audioTimes = []; frameCloses = 0; audioCloses = 0; videoPeak = 0; audioPeak = 0; stalled = false; failure = undefined; unsupported = [];
  vi.stubGlobal("VideoEncoder", codec("video")); vi.stubGlobal("AudioEncoder", codec("audio"));
  vi.stubGlobal("VideoFrame", class { timestamp: number; constructor(_: unknown, options: { timestamp: number }) { this.timestamp = options.timestamp; } close() { frameCloses++; } });
  vi.stubGlobal("AudioData", class { timestamp: number; constructor(options: { timestamp: number }) { this.timestamp = options.timestamp; } close() { audioCloses++; } });
  vi.stubGlobal("AudioBuffer", Buffer);
  vi.stubGlobal("AudioContext", class { close() { return Promise.resolve(); } });
  vi.stubGlobal("OfflineAudioContext", class {
    destination = {}; buffer: Buffer;
    constructor(channels: number, length: number, rate: number) { this.buffer = new Buffer({ length, numberOfChannels: channels, sampleRate: rate }); }
    createBuffer(channels: number, length: number, rate: number) { return new Buffer({ length, numberOfChannels: channels, sampleRate: rate }); }
    createBufferSource() { return { buffer: null, connect() {}, start() {} }; }
    startRendering() { return Promise.resolve(this.buffer); }
  });
  vi.stubGlobal("OffscreenCanvas", class { width: number; height: number; constructor(width: number, height: number) { this.width = width; this.height = height; } getContext() { return { fillRect() {}, save() {}, restore() {} }; } });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function run(signal?: AbortSignal) { return exportProject({ snapshot, media: [], format: "mp4", scale: 1, videoBitrate: 8000000, username: "creator", signal }); }
it("keeps the full-resolution video and audio pipelines bounded without losing timestamps or ending frames", async () => {
  const result = run(); await vi.runAllTimersAsync(); await result;
  expect(videos[0].config).toMatchObject({ width: 3840, height: 2160, framerate: 30, bitrate: 8000000 });
  expect(videoPeak).toBe(8); expect(audioPeak).toBe(8);
  expect(timestamps).toEqual(Array.from({ length: 96 }, (_, i) => Math.round(i / 30 * 1000000)));
  expect(audioTimes).toEqual(Array.from({ length: 150 }, (_, i) => Math.round(i * 1024 / 48000 * 1000000)));
  expect(calls.outro).toHaveBeenCalledTimes(66); expect(frameCloses).toBe(96); expect(audioCloses).toBe(150);
  expect(videos[0].state).toBe("closed"); expect(audios[0].state).toBe("closed");
});
it("cancels while no queued video frame can drain and releases the encoder", async () => {
  stalled = true; const controller = new AbortController(); setTimeout(() => controller.abort(), 50);
  const result = run(controller.signal).then(() => undefined, error => error); await vi.runAllTimersAsync();
  expect(await result).toMatchObject({ name: "AbortError" }); expect(frameCloses).toBe(8); expect(videos[0].state).toBe("closed"); expect(audios).toHaveLength(0);
});
it("retains the asynchronous encoder failure after its queue is reset", async () => {
  stalled = true; failure = new Error("Encoding device lost");
  const result = run().then(() => undefined, error => error); await vi.runAllTimersAsync();
  expect(await result).toBe(failure); expect(frameCloses).toBe(8); expect(videos[0].state).toBe("closed");
});
it("falls back to Opus and VP9 inside MP4 when the browser has no AAC or H.264 encoder", async () => {
  unsupported = ["mp4a", "avc1"];
  const result = run(); await vi.runAllTimersAsync(); await result;
  expect(videos[0].config).toMatchObject({ codec: "vp09.00.10.08" }); expect(audios[0].config).toMatchObject({ codec: "opus" });
  expect(muxers.options[0]).toMatchObject({ video: { codec: "vp9" }, audio: { codec: "opus" } });
});
it("still exports the picture when the browser cannot encode any audio", async () => {
  unsupported = ["mp4a", "opus"];
  const result = run(); await vi.runAllTimersAsync(); await result;
  expect(audios).toHaveLength(0); expect(muxers.options[0].audio).toBeUndefined(); expect(timestamps).toHaveLength(96);
});
