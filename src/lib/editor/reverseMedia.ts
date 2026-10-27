/**
 * A video span played backwards, as a new file the editor imports like any
 * other clip. Frames are read by seeking a video element from the end of the
 * span to its start and encoded with WebCodecs, so playback, export and the
 * app all treat the result as an ordinary forward video. The sound is decoded,
 * reversed sample by sample and encoded alongside.
 */
import { pickAudioCodec, pickVideoCodec } from "./exporter";
import { waitForVideoFrame } from "./videoFrame";
import { waitForEncoderCapacity } from "./encoderQueue";
import { cleanDecoderConfig, videoDecoderConfigFixer } from "./videoDecoderConfig";
import { EditorError } from "./editorError";

/** Longest span we reverse in one go; every frame is a seek. */
export const REVERSE_MAX_SECONDS = 90;
const SAMPLE_RATE = 48000;

export interface ReverseOptions { fps?: number; signal?: AbortSignal; onProgress?: (fraction: number) => void }

/** Output size: the source size, longest edge capped at 1920, even numbers for the encoder. */
export function reverseSize(width: number, height: number, cap = 1920): { width: number; height: number } {
  const scale = Math.min(1, cap / Math.max(width, height, 1));
  const even = (n: number) => Math.max(2, Math.floor((n * scale) / 2) * 2);
  return { width: even(width), height: even(height) };
}

/** Source time for output frame `index` of `frames`, walking from the end of the span back to its start. */
export function reverseFrameTime(start: number, end: number, index: number, frames: number): number {
  const step = (end - start) / Math.max(1, frames);
  return Math.max(start, end - (index + 0.5) * step);
}

/** One channel of samples, reversed, between two sample offsets. */
export function reversedSamples(channel: Float32Array, from: number, to: number): Float32Array {
  const out = new Float32Array(Math.max(0, to - from));
  for (let i = 0; i < out.length; i++) out[i] = channel[to - 1 - i];
  return out;
}

function check(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Reverse cancelled", "AbortError");
}

async function loadVideo(url: string, signal?: AbortSignal): Promise<HTMLVideoElement> {
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new EditorError("editor.reverse.failed", "Could not reverse this clip.")), 20000);
    video.onloadeddata = () => { clearTimeout(timer); resolve(); };
    video.onerror = () => { clearTimeout(timer); reject(new EditorError("editor.reverse.failed", "Could not reverse this clip.")); };
    signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new DOMException("Reverse cancelled", "AbortError")); }, { once: true });
    video.src = url;
  });
  return video;
}

/** Decode the span's sound, reverse it and resample to 48 kHz stereo. Null for a silent file. */
async function reversedAudio(url: string, start: number, end: number, signal?: AbortSignal): Promise<AudioBuffer | null> {
  try {
    const bytes = await (await fetch(url, { signal })).arrayBuffer();
    const context = new OfflineAudioContext(2, 1, SAMPLE_RATE);
    const decoded = await context.decodeAudioData(bytes);
    const from = Math.max(0, Math.floor(start * decoded.sampleRate));
    const to = Math.min(decoded.length, Math.ceil(end * decoded.sampleRate));
    if (to - from < decoded.sampleRate * 0.05) return null;
    const reversed = new AudioBuffer({ length: to - from, numberOfChannels: 2, sampleRate: decoded.sampleRate });
    for (let c = 0; c < 2; c++) reversed.copyToChannel(reversedSamples(decoded.getChannelData(Math.min(c, decoded.numberOfChannels - 1)), from, to), c);
    const length = Math.ceil(reversed.duration * SAMPLE_RATE);
    const offline = new OfflineAudioContext(2, length, SAMPLE_RATE);
    const node = offline.createBufferSource();
    node.buffer = reversed;
    node.connect(offline.destination);
    node.start();
    return await offline.startRendering();
  } catch (error) {
    if ((error as Error)?.name === "AbortError") throw error;
    return null;
  }
}

export async function reverseVideoSpan(url: string, start: number, end: number, options: ReverseOptions = {}): Promise<File> {
  const { fps = 30, signal, onProgress } = options;
  if (typeof VideoEncoder !== "function") throw new EditorError("editor.reverse.unsupported", "This browser can't reverse video. Try Chrome or Edge.");
  if (end - start > REVERSE_MAX_SECONDS + 0.01) throw new EditorError("editor.reverse.tooLong", "Clips up to {{seconds}} seconds can be reversed.", { seconds: REVERSE_MAX_SECONDS });
  const video = await loadVideo(url, signal);
  let videoEncoder: VideoEncoder | undefined;
  let audioEncoder: AudioEncoder | undefined;
  let failure: Error | undefined;
  const checkEncoding = () => { check(signal); if (failure) throw failure; };
  try {
    const { width, height } = reverseSize(video.videoWidth, video.videoHeight);
    const bitrate = Math.round(Math.min(12_000_000, Math.max(2_000_000, width * height * fps * 0.12)));
    const [videoChoice, audio] = await Promise.all([pickVideoCodec("mp4", width, height, fps, bitrate), reversedAudio(url, start, end, signal)]);
    const audioChoice = audio ? await pickAudioCodec("mp4", 160_000) : null;
    const haveAudio = !!audio && !!audioChoice;
    const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");
    const target = new ArrayBufferTarget();
    const muxer = new Muxer({
      target,
      video: { codec: videoChoice.muxerCodec, width, height, frameRate: fps },
      ...(haveAudio ? { audio: { codec: audioChoice!.muxerCodec, numberOfChannels: 2, sampleRate: SAMPLE_RATE } } : {}),
      fastStart: "in-memory",
    });
    const fixChunk = videoDecoderConfigFixer({ codec: videoChoice.codec, muxerCodec: videoChoice.muxerCodec, width, height });
    videoEncoder = new VideoEncoder({
      output: (chunk, meta) => { const fixed = fixChunk(chunk, meta); muxer.addVideoChunk(fixed.chunk, fixed.meta); },
      error: (error) => { failure = error; },
    });
    videoEncoder.configure({ codec: videoChoice.codec, width, height, bitrate, framerate: fps });

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new EditorError("editor.reverse.failed", "Could not reverse this clip.");
    const frames = Math.max(1, Math.round((end - start) * fps));
    for (let i = 0; i < frames; i++) {
      checkEncoding();
      await waitForVideoFrame(video, reverseFrameTime(start, end, i, frames), { signal, forCanvasRead: true });
      ctx.drawImage(video, 0, 0, width, height);
      const frame = new VideoFrame(canvas, { timestamp: Math.round((i / fps) * 1_000_000), duration: Math.round(1_000_000 / fps) });
      try { videoEncoder.encode(frame, { keyFrame: i % (fps * 2) === 0 }); } finally { frame.close(); }
      await waitForEncoderCapacity(videoEncoder, 8, checkEncoding);
      if (i % 5 === 0) onProgress?.((i / frames) * 0.92);
    }
    await videoEncoder.flush();
    checkEncoding();

    if (haveAudio && audio) {
      audioEncoder = new AudioEncoder({
        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta?.decoderConfig ? { ...meta, decoderConfig: cleanDecoderConfig(meta.decoderConfig) } : meta),
        error: (error) => { failure = error; },
      });
      audioEncoder.configure({ codec: audioChoice!.codec, sampleRate: SAMPLE_RATE, numberOfChannels: 2, bitrate: 160_000 });
      const left = audio.getChannelData(0), right = audio.getChannelData(1);
      const CHUNK = 1024;
      for (let at = 0; at < audio.length; at += CHUNK) {
        checkEncoding();
        const count = Math.min(CHUNK, audio.length - at);
        const planar = new Float32Array(count * 2);
        planar.set(left.subarray(at, at + count), 0);
        planar.set(right.subarray(at, at + count), count);
        const data = new AudioData({ format: "f32-planar", sampleRate: SAMPLE_RATE, numberOfFrames: count, numberOfChannels: 2,
          timestamp: Math.round((at / SAMPLE_RATE) * 1_000_000), data: planar.buffer as ArrayBuffer });
        try { audioEncoder.encode(data); } finally { data.close(); }
        await waitForEncoderCapacity(audioEncoder, 8, checkEncoding);
      }
      await audioEncoder.flush();
      checkEncoding();
    }
    if (!fixChunk.hasConfig()) throw new EditorError("editor.reverse.failed", "Could not reverse this clip.");
    muxer.finalize();
    onProgress?.(1);
    return new File([target.buffer], `reversed-${Date.now()}.mp4`, { type: "video/mp4" });
  } finally {
    if (videoEncoder && videoEncoder.state !== "closed") videoEncoder.close();
    if (audioEncoder && audioEncoder.state !== "closed") audioEncoder.close();
    video.pause(); video.removeAttribute("src"); video.load();
  }
}
