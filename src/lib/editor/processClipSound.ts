import type { MediaClip } from "./types";
import { AUDIO_TOOLS_WORKER } from "./audioToolsRuntime";
import { AUDIO_TOOL_MODES, audioToolRange, type AudioToolMode, type AudioToolResult } from "./audioTools";

import type { BeatAnalysis } from "./beats";

/** Own the worker so cancellation releases work as well as the pending promise. */
export function processClipSound(blob: Blob, clip: MediaClip, mode: "beats", signal?: AbortSignal, onProgress?: (fraction: number) => void): Promise<BeatAnalysis>;
export function processClipSound(blob: Blob, clip: MediaClip, mode: AudioToolMode, signal?: AbortSignal, onProgress?: (fraction: number) => void): Promise<AudioToolResult>;
export function processClipSound(blob: Blob, clip: MediaClip, mode: AudioToolMode | "beats", signal?: AbortSignal, onProgress?: (fraction: number) => void): Promise<AudioToolResult | BeatAnalysis> {
  return new Promise((resolve, reject) => {
    let worker: Worker | null = null;
    let context: AudioContext | null = null;
    let finished = false;
    const finish = (error?: Error, result?: AudioToolResult | BeatAnalysis) => {
      if (finished) return; finished = true;
      clearTimeout(timer); signal?.removeEventListener("abort", cancel);
      worker?.terminate(); void context?.close().catch(() => {});
      if (error) reject(error); else if (result) resolve(result);
    };
    const cancel = () => finish(new DOMException("Cancelled", "AbortError"));
    const timer = setTimeout(() => finish(new Error("audio processing timed out")), 10 * 60 * 1000);
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) { cancel(); return; }
    void (async () => {
      try {
        if ((mode !== "beats" && !AUDIO_TOOL_MODES.includes(mode)) || clip.duration > 600 || clip.locked) throw new Error("audio range");
        context = new AudioContext();
        const decoded = await context.decodeAudioData(await blob.arrayBuffer());
        if (finished) return;
        const selection = audioToolRange(clip, decoded.duration);
        const rate = Math.min(48000, decoded.sampleRate);
        const offline = new OfflineAudioContext(Math.min(2, decoded.numberOfChannels), Math.ceil(selection.duration * rate), rate);
        const source = offline.createBufferSource(); source.buffer = decoded; source.playbackRate.value = selection.speed;
        source.connect(offline.destination); source.start(0, selection.offset, selection.sourceSeconds);
        const rendered = await offline.startRendering();
        if (finished) return;
        const volume = Math.max(0, Math.min(2, clip.audio?.volume ?? 1));
        const channels = Array.from({ length: rendered.numberOfChannels }, (_, i) => rendered.getChannelData(i).map(value => value * volume));
        const url = URL.createObjectURL(new Blob([AUDIO_TOOLS_WORKER], { type: "text/javascript" }));
        try { worker = new Worker(url); } finally { URL.revokeObjectURL(url); }
        worker.onmessage = event => {
          const data = event.data;
          if (data.type === "progress") onProgress?.(Math.max(0, Math.min(1, data.fraction)));
          else if (data.type === "beats") finish(undefined, data as BeatAnalysis);
          else if (data.type === "done") finish(undefined, data as AudioToolResult);
          else if (data.type === "error") finish(new Error(data.message));
        };
        worker.onerror = () => finish(new Error("sound worker failed"));
        worker.postMessage({ channels, rate, mode }, channels.map(channel => channel.buffer));
      } catch (error) { finish(error instanceof Error ? error : new Error("sound processing failed")); }
    })();
  });
}
