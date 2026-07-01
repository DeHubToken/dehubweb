/**
 * Video export pipeline using WebCodecs + mp4-muxer / webm-muxer.
 * Renders each timeline frame to an OffscreenCanvas, encodes video via VideoEncoder,
 * mixes down audio via OfflineAudioContext + AudioEncoder, and muxes the result.
 *
 * Architecture inspired by OpenCut (MIT) — see LICENSE-OpenCut.
 */
import type { Clip, MediaClip, TextClip, ProjectSnapshot } from "./types";
import type { MediaItem } from "@/store/editorStore";
import { computeRenderOps } from "./transitions";

export type ExportFormat = "mp4" | "webm";

export interface ExportOptions {
  snapshot: ProjectSnapshot;
  media: MediaItem[];
  format: ExportFormat;
  /** Output scale multiplier: 1 = project resolution, 0.5 = half, etc. */
  scale: number;
  /** H.264/VP9 target bitrate in bits per second. */
  videoBitrate: number;
  /** Audio bitrate in bps (AAC/Opus). */
  audioBitrate?: number;
  /** Progress 0..1. */
  onProgress?: (p: number, label: string) => void;
  signal?: AbortSignal;
}

export interface ExportResult {
  blob: Blob;
  filename: string;
}

export function isExportSupported(): boolean {
  return typeof window !== "undefined"
    && typeof (window as unknown as { VideoEncoder?: unknown }).VideoEncoder === "function"
    && typeof OffscreenCanvas === "function";
}

const FADE = 0.3;

function pickVideoCodec(format: ExportFormat): { codec: string; muxerCodec: "avc" | "vp9" } {
  return format === "mp4"
    ? { codec: "avc1.42E01F", muxerCodec: "avc" }
    : { codec: "vp09.00.10.08", muxerCodec: "vp9" };
}

function pickAudioCodec(format: ExportFormat): { codec: string; muxerCodec: "aac" | "opus" } {
  return format === "mp4"
    ? { codec: "mp4a.40.2", muxerCodec: "aac" }
    : { codec: "opus", muxerCodec: "opus" };
}

function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
}

/** Pre-load all source media into seekable HTMLVideoElement / Image / AudioBuffer. */
async function loadSources(media: MediaItem[]) {
  const videos = new Map<string, HTMLVideoElement>();
  const images = new Map<string, HTMLImageElement>();
  const audioBuffers = new Map<string, AudioBuffer>();

  const audioCtx = new (window.OfflineAudioContext
    ? AudioContext
    : AudioContext)();

  const tasks: Promise<void>[] = [];

  for (const m of media) {
    if (m.kind === "video") {
      tasks.push(new Promise<void>((resolve, reject) => {
        const v = document.createElement("video");
        v.src = m.url;
        v.crossOrigin = "anonymous";
        v.muted = true;
        v.playsInline = true;
        v.preload = "auto";
        v.onloadeddata = () => resolve();
        v.onerror = () => reject(new Error(`Failed to load ${m.name}`));
        videos.set(m.id, v);
      }));
      // Also decode audio track for mixdown.
      tasks.push((async () => {
        try {
          const buf = await (await fetch(m.url)).arrayBuffer();
          const audio = await audioCtx.decodeAudioData(buf.slice(0));
          audioBuffers.set(m.id, audio);
        } catch { /* video without audio — fine */ }
      })());
    } else if (m.kind === "image") {
      tasks.push(new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve();
        img.onerror = () => reject(new Error(`Failed to load ${m.name}`));
        img.src = m.url;
        images.set(m.id, img);
      }));
    } else if (m.kind === "audio") {
      tasks.push((async () => {
        const buf = await (await fetch(m.url)).arrayBuffer();
        const audio = await audioCtx.decodeAudioData(buf.slice(0));
        audioBuffers.set(m.id, audio);
      })());
    }
  }

  await Promise.all(tasks);
  await audioCtx.close().catch(() => undefined);
  return { videos, images, audioBuffers };
}

/** Seek a video element to a specific time and wait for the frame to be ready. */
function seekVideo(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const target = Math.max(0, Math.min(v.duration || t, t));
    const handler = () => { v.removeEventListener("seeked", handler); resolve(); };
    v.addEventListener("seeked", handler);
    try { v.currentTime = target; } catch { resolve(); }
  });
}

function cssFilterFor(clip: Clip): string {
  if (clip.kind !== "video" && clip.kind !== "image") return "none";
  const e = (clip as MediaClip).effects;
  if (!e) return "none";
  const parts: string[] = [];
  if (e.brightness !== undefined && e.brightness !== 1) parts.push(`brightness(${e.brightness})`);
  if (e.contrast !== undefined && e.contrast !== 1) parts.push(`contrast(${e.contrast})`);
  if (e.saturation !== undefined && e.saturation !== 1) parts.push(`saturate(${e.saturation})`);
  if (e.blur !== undefined && e.blur > 0) parts.push(`blur(${e.blur}px)`);
  return parts.length ? parts.join(" ") : "none";
}

function drawClipExport(
  ctx: OffscreenCanvasRenderingContext2D,
  canvas: OffscreenCanvas,
  clip: Clip,
  t: number,
  videos: Map<string, HTMLVideoElement>,
  images: Map<string, HTMLImageElement>,
) {
  const prev = ctx.filter;
  ctx.filter = cssFilterFor(clip);
  if (clip.kind === "video") {
    const v = videos.get((clip as MediaClip).mediaId);
    if (v && v.videoWidth) drawContain(ctx, v as unknown as CanvasImageSource, v.videoWidth, v.videoHeight, canvas.width, canvas.height);
  } else if (clip.kind === "image") {
    const img = images.get((clip as MediaClip).mediaId);
    if (img && img.naturalWidth) drawContain(ctx, img, img.naturalWidth, img.naturalHeight, canvas.width, canvas.height);
  } else if (clip.kind === "text") {
    const text = clip as TextClip;
    const into = t - text.start;
    const outof = text.start + text.duration - t;
    const alpha = Math.max(0, Math.min(1, Math.min(into / FADE, outof / FADE, 1)));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = text.color;
    const size = (text.fontSize / 1080) * canvas.height;
    ctx.font = `${text.fontWeight} ${size}px ${text.fontFamily}`;
    ctx.textBaseline = "middle";
    ctx.textAlign = text.align === "centre" ? "center" : text.align;
    const x = text.x * canvas.width;
    const y = text.y * canvas.height;
    const lines = text.text.split(/\n/);
    const lh = size * 1.2;
    const startY = y - ((lines.length - 1) * lh) / 2;
    lines.forEach((ln, i) => ctx.fillText(ln, x, startY + i * lh));
    ctx.restore();
  }
  ctx.filter = prev;
}

function drawContain(
  ctx: OffscreenCanvasRenderingContext2D,
  src: CanvasImageSource,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
) {
  const scale = Math.min(dw / sw, dh / sh);
  const w = sw * scale;
  const h = sh * scale;
  const x = (dw - w) / 2;
  const y = (dh - h) / 2;
  ctx.drawImage(src, x, y, w, h);
}

/** Render the audio mixdown to a stereo AudioBuffer at 48 kHz. */
async function renderAudioMix(
  snapshot: ProjectSnapshot,
  audioBuffers: Map<string, AudioBuffer>,
  duration: number,
): Promise<AudioBuffer | null> {
  const audioClips = snapshot.clips.filter((c) => {
    if (c.kind !== "audio" && c.kind !== "video") return false;
    return audioBuffers.has((c as MediaClip).mediaId);
  }) as MediaClip[];
  if (!audioClips.length || duration <= 0) return null;

  const sampleRate = 48000;
  const frames = Math.ceil(duration * sampleRate);
  const ctx = new OfflineAudioContext(2, frames, sampleRate);

  for (const c of audioClips) {
    const track = snapshot.tracks.find((t) => t.id === c.trackId);
    if (track?.muted || track?.hidden) continue;
    const buf = audioBuffers.get(c.mediaId);
    if (!buf) continue;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    const vol = c.audio?.volume ?? 1;
    const fIn = Math.max(0, Math.min(c.duration, c.audio?.fadeIn ?? 0));
    const fOut = Math.max(0, Math.min(c.duration - fIn, c.audio?.fadeOut ?? 0));
    const when = c.start;
    const offset = c.trimIn;
    const dur = Math.min(c.duration, Math.max(0, buf.duration - offset));
    if (dur <= 0) continue;
    // Envelope: 0 → vol (fadeIn) → vol → 0 (fadeOut)
    gain.gain.setValueAtTime(fIn > 0 ? 0 : vol, when);
    if (fIn > 0) gain.gain.linearRampToValueAtTime(vol, when + fIn);
    if (fOut > 0) {
      gain.gain.setValueAtTime(vol, when + Math.max(fIn, dur - fOut));
      gain.gain.linearRampToValueAtTime(0, when + dur);
    }
    src.connect(gain).connect(ctx.destination);
    src.start(when, offset, dur);
  }
  return await ctx.startRendering();
}

/** Convert an AudioBuffer slice into a planar Float32Array suitable for AudioEncoder. */
function audioBufferSliceToInterleaved(
  buf: AudioBuffer,
  startFrame: number,
  frameCount: number,
): Float32Array {
  const ch = buf.numberOfChannels;
  const out = new Float32Array(frameCount * ch);
  for (let c = 0; c < ch; c++) {
    const data = buf.getChannelData(c);
    for (let i = 0; i < frameCount; i++) {
      const v = data[startFrame + i] ?? 0;
      out[i * ch + c] = v;
    }
  }
  return out;
}

export async function exportProject(opts: ExportOptions): Promise<ExportResult> {
  if (!isExportSupported()) {
    throw new Error("Your browser doesn't support video export. Use a Chromium-based browser (Chrome, Edge, Brave, Arc).");
  }

  const { snapshot, media, format, scale, videoBitrate, audioBitrate = 192_000, onProgress, signal } = opts;
  const { settings, clips, tracks } = snapshot;
  const fps = settings.fps;
  const width = Math.max(2, Math.round(settings.width * scale) & ~1);
  const height = Math.max(2, Math.round(settings.height * scale) & ~1);

  const duration = clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0);
  if (duration <= 0) throw new Error("Nothing to export — the timeline is empty.");

  const totalFrames = Math.ceil(duration * fps);
  onProgress?.(0, "Loading media…");
  const { videos, images, audioBuffers } = await loadSources(media);
  checkAbort(signal);

  // Pre-mix audio in parallel with video setup.
  onProgress?.(0.02, "Mixing audio…");
  const audioBufferPromise = renderAudioMix(snapshot, audioBuffers, duration);

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not acquire canvas context");

  // Lazy-load the appropriate muxer.
  const trackZ = (trackId: string) => tracks.findIndex((t) => t.id === trackId);
  const { codec: videoCodec, muxerCodec: videoMuxerCodec } = pickVideoCodec(format);
  const { codec: audioCodec, muxerCodec: audioMuxerCodec } = pickAudioCodec(format);

  const mixed = await audioBufferPromise;
  const haveAudio = !!mixed;

  let muxer: {
    addVideoChunk: (chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata) => void;
    addAudioChunk?: (chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata) => void;
    finalize: () => void;
    target: { buffer: ArrayBuffer };
  };

  if (format === "mp4") {
    const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");
    const target = new ArrayBufferTarget();
    const m = new Muxer({
      target,
      video: { codec: videoMuxerCodec, width, height, frameRate: fps },
      ...(haveAudio
        ? { audio: { codec: audioMuxerCodec as "aac", numberOfChannels: 2, sampleRate: 48000 } }
        : {}),
      fastStart: "in-memory",
    });
    muxer = {
      addVideoChunk: (c, meta) => m.addVideoChunk(c, meta),
      addAudioChunk: haveAudio ? (c, meta) => m.addAudioChunk(c, meta) : undefined,
      finalize: () => m.finalize(),
      target,
    };
  } else {
    const { Muxer, ArrayBufferTarget } = await import("webm-muxer");
    const target = new ArrayBufferTarget();
    const m = new Muxer({
      target,
      video: { codec: "V_VP9", width, height, frameRate: fps },
      ...(haveAudio
        ? { audio: { codec: "A_OPUS", numberOfChannels: 2, sampleRate: 48000 } }
        : {}),
    });
    muxer = {
      addVideoChunk: (c, meta) => m.addVideoChunk(c, meta),
      addAudioChunk: haveAudio ? (c, meta) => m.addAudioChunk(c, meta) : undefined,
      finalize: () => m.finalize(),
      target,
    };
  }

  // ── Video encoder ──
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { throw e; },
  });
  videoEncoder.configure({
    codec: videoCodec,
    width,
    height,
    bitrate: videoBitrate,
    framerate: fps,
  });

  const isVisualTrack = (trackId: string) => {
    const tr = tracks.find((x) => x.id === trackId);
    return !!tr && !tr.hidden && tr.kind !== "audio";
  };

  // ── Render every frame ──
  for (let f = 0; f < totalFrames; f++) {
    checkAbort(signal);
    const t = f / fps;

    // Draw background.
    ctx.fillStyle = settings.background;
    ctx.fillRect(0, 0, width, height);

    // Compute render ops (handles outgoing + incoming-preroll transitions).
    const ops = computeRenderOps(clips, isVisualTrack, t, width).sort(
      (a, b) => trackZ(a.clip.trackId) - trackZ(b.clip.trackId),
    );

    // Seek every video op (including incoming pre-roll) to its local time.
    for (const op of ops) {
      if (op.clip.kind !== "video") continue;
      const mc = op.clip as MediaClip;
      const v = videos.get(mc.mediaId);
      if (!v) continue;
      const localT =
        op.localTimeOverride !== undefined ? op.localTimeOverride : mc.trimIn + (t - mc.start);
      await seekVideo(v, localT);
    }

    for (const op of ops) {
      ctx.save();
      if (op.translateX) ctx.translate(op.translateX, 0);
      if (op.clipRect) {
        ctx.beginPath();
        ctx.rect(op.clipRect.x, 0, op.clipRect.w, canvas.height);
        ctx.clip();
      }
      ctx.globalAlpha = op.alpha;
      drawClipExport(ctx, canvas, op.clip, t, videos, images);
      ctx.restore();
    }

    const frame = new VideoFrame(canvas, { timestamp: Math.round((f / fps) * 1_000_000) });
    const keyFrame = f % Math.max(1, Math.round(fps * 2)) === 0;
    videoEncoder.encode(frame, { keyFrame });
    frame.close();

    if (videoEncoder.encodeQueueSize > 8) {
      await new Promise((r) => setTimeout(r, 0));
    }

    if (f % 5 === 0) {
      const p = 0.05 + (f / totalFrames) * 0.85;
      onProgress?.(p, `Encoding frame ${f + 1} / ${totalFrames}`);
    }
  }

  await videoEncoder.flush();
  videoEncoder.close();

  // ── Audio encoding ──
  if (mixed && muxer.addAudioChunk) {
    onProgress?.(0.92, "Encoding audio…");
    const sampleRate = mixed.sampleRate;
    const channels = Math.min(2, mixed.numberOfChannels);
    const audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk!(chunk, meta),
      error: (e) => { throw e; },
    });
    audioEncoder.configure({
      codec: audioCodec,
      sampleRate,
      numberOfChannels: channels,
      bitrate: audioBitrate,
    });

    const CHUNK = 1024;
    const totalFr = mixed.length;
    for (let i = 0; i < totalFr; i += CHUNK) {
      checkAbort(signal);
      const count = Math.min(CHUNK, totalFr - i);
      // Build a 2-channel buffer regardless of source channel count.
      const stereoBuf = new AudioBuffer({ length: count, numberOfChannels: 2, sampleRate });
      for (let c = 0; c < 2; c++) {
        const srcCh = mixed.getChannelData(Math.min(c, mixed.numberOfChannels - 1));
        const dst = stereoBuf.getChannelData(c);
        for (let j = 0; j < count; j++) dst[j] = srcCh[i + j] ?? 0;
      }
      const data = audioBufferSliceToInterleaved(stereoBuf, 0, count);
      const ad = new AudioData({
        format: "f32",
        sampleRate,
        numberOfFrames: count,
        numberOfChannels: 2,
        timestamp: Math.round((i / sampleRate) * 1_000_000),
        data: data.buffer as ArrayBuffer,
      });
      audioEncoder.encode(ad);
      ad.close();
    }
    await audioEncoder.flush();
    audioEncoder.close();
  }

  onProgress?.(0.98, "Finalising…");
  muxer.finalize();

  const mime = format === "mp4" ? "video/mp4" : "video/webm";
  const blob = new Blob([muxer.target.buffer], { type: mime });
  const safeTitle = (snapshot.title || "video").replace(/[^\w\-]+/g, "_");
  const filename = `${safeTitle}.${format}`;
  onProgress?.(1, "Done");
  return { blob, filename };
}
