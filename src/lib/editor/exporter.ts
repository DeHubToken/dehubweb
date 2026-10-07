import { waitForVideoFrame } from "./videoFrame";
import { assertVideoMattes } from "./videoMatte";
/**
 * Video export pipeline using WebCodecs + mp4-muxer / webm-muxer.
 * Renders each timeline frame to an OffscreenCanvas, encodes video via VideoEncoder,
 * mixes down audio via OfflineAudioContext + AudioEncoder, and muxes the result.
 *
 * Architecture inspired by OpenCut (MIT) — see LICENSE-OpenCut.
 */
import { stampEnding } from "./endingFile";
import type { MediaClip, ProjectSnapshot } from "./types";
import type { MediaItem } from "@/store/editorStore";
import { computeRenderOps } from "./transitions";
import { drawClip } from "./render";
import { timelineDuration } from "./pages";
import { loadBrandOutroArtwork } from "./brandOutroArtwork";
import { BRAND_OUTRO_DURATION, drawBrandOutro, outroSoundSample, outroUsername } from "./brandOutro";
import { GIF_CONTENT_LIMIT, gifPlan, gifFrameDelay, gifWorkerSession } from "./gif";
import { GIF_WORKER } from "./gifRuntime";
import { exportTimeRange, exportAudioSegment, type ExportRange } from "./exportRanges";


export type ExportFormat = "mp4" | "webm" | "gif";

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
  /** If set, export only from 0 up to this time (seconds) instead of the full timeline. */
  cutEndAt?: number;
  /** Global timeline bounds; output timestamps start at zero. */
  range?: ExportRange;
  /** Creator identity for the automatic branded ending. */
  username?: string | null;
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


/** Pick an H.264 level whose max coded area fits width*height (rounded to macroblocks). */
function pickAvcLevel(width: number, height: number, fps: number): string {
  // Coded area uses 16px-aligned dimensions (macroblocks).
  const mbW = Math.ceil(width / 16);
  const mbH = Math.ceil(height / 16);
  const mbs = mbW * mbH;
  const mbsPerSec = mbs * Math.max(1, fps);
  // [level hex, maxMBs/frame, maxMBs/sec]
  const levels: Array<[string, number, number]> = [
    ["1F", 3600, 108000],    // 3.1  (up to ~720x480@30 / 921600 px)
    ["20", 5120, 216000],    // 3.2
    ["28", 8192, 245760],    // 4.0  (1080p30)
    ["29", 8192, 522240],    // 4.1  (1080p60)
    ["2A", 8704, 522240],    // 4.2
    ["32", 22080, 589824],   // 5.0  (up to 4k)
    ["33", 36864, 983040],   // 5.1  (4k60)
    ["34", 36864, 2073600],  // 5.2
  ];
  for (const [hex, maxMbs, maxMbsSec] of levels) {
    if (mbs <= maxMbs && mbsPerSec <= maxMbsSec) return hex;
  }
  return "34";
}

function pickVideoCodec(
  format: ExportFormat,
  width: number,
  height: number,
  fps: number,
): { codec: string; muxerCodec: "avc" | "vp9" } {
  if (format === "mp4") {
    const level = pickAvcLevel(width, height, fps);
    return { codec: `avc1.42E0${level}`, muxerCodec: "avc" };
  }
  return { codec: "vp09.00.10.08", muxerCodec: "vp9" };
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
async function loadSources(media: MediaItem[], withAudio = true, signal?: AbortSignal) {
  const videos = new Map<string, HTMLVideoElement>();
  const images = new Map<string, HTMLImageElement>();
  const audioBuffers = new Map<string, AudioBuffer>();

  const audioCtx = withAudio ? new AudioContext() : null;

  const tasks: Promise<void>[] = [];
  const cancelLoads = new Set<() => void>();
  const abort = () => cancelLoads.forEach(cancel => cancel());
  signal?.addEventListener("abort", abort, { once: true });

  for (const m of media) {
    if (m.kind === "video") {
      tasks.push(new Promise<void>((resolve, reject) => {
        const v = document.createElement("video");
        v.crossOrigin = "anonymous";
        v.muted = true;
        v.playsInline = true;
        v.preload = "auto";
        const finish = (error?: Error) => { clearTimeout(timer); cancelLoads.delete(cancel); v.onloadeddata = null; v.onerror = null; error ? reject(error) : resolve(); };
        const cancel = () => finish(new DOMException("Export cancelled", "AbortError"));
        const timer = setTimeout(() => finish(new Error(`Failed to load ${m.name}`)), 20000);
        cancelLoads.add(cancel);
        v.onloadeddata = () => finish();
        v.onerror = () => finish(new Error(`Failed to load ${m.name}`));
        v.src = m.url;
        if (signal?.aborted) cancel();
        videos.set(m.id, v);
      }));
      // Also decode audio track for mixdown (not needed for stills).
      if (withAudio) tasks.push((async () => {
        try {
          const buf = await (await fetch(m.url, { signal })).arrayBuffer();
          const audio = await audioCtx!.decodeAudioData(buf.slice(0));
          audioBuffers.set(m.id, audio);
        } catch { /* video without audio — fine */ }
      })());
    } else if (m.kind === "image") {
      tasks.push(new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        const finish = (error?: Error) => { clearTimeout(timer); cancelLoads.delete(cancel); img.onload = null; img.onerror = null; error ? reject(error) : resolve(); };
        const cancel = () => finish(new DOMException("Export cancelled", "AbortError"));
        const timer = setTimeout(() => finish(new Error(`Failed to load ${m.name}`)), 20000);
        cancelLoads.add(cancel);
        img.onload = () => finish();
        img.onerror = () => finish(new Error(`Failed to load ${m.name}`));
        img.src = m.url;
        images.set(m.id, img);
        if (signal?.aborted) cancel();
      }));
    } else if (m.kind === "audio" && withAudio) {
      tasks.push((async () => {
        const buf = await (await fetch(m.url, { signal })).arrayBuffer();
        const audio = await audioCtx!.decodeAudioData(buf.slice(0));
        audioBuffers.set(m.id, audio);
      })());
    }
  }

  try { await Promise.all(tasks); }
  catch (error) { abort(); videos.forEach(v => { v.removeAttribute("src"); v.load(); }); images.forEach(img => { img.src = ""; }); throw error; }
  finally { signal?.removeEventListener("abort", abort); await audioCtx?.close().catch(() => undefined); }
  return { videos, images, audioBuffers };
}

/** Render the audio mixdown to a stereo AudioBuffer at 48 kHz. */
async function renderAudioMix(
  snapshot: ProjectSnapshot,
  audioBuffers: Map<string, AudioBuffer>,
  duration: number,
  range: ExportRange,
): Promise<AudioBuffer | null> {
  const audioClips = snapshot.clips.filter((c) => {
    if (c.kind !== "audio" && c.kind !== "video") return false;
    return audioBuffers.has((c as MediaClip).mediaId);
  }) as MediaClip[];
  if (duration <= 0) return null;

  const sampleRate = 48000;
  const frames = Math.ceil(duration * sampleRate);
  const ctx = new OfflineAudioContext(2, frames, sampleRate);

  for (const c of audioClips) {
    const track = snapshot.tracks.find((t) => t.id === c.trackId);
    if (track?.muted || track?.hidden || c.hidden) continue;
    const buf = audioBuffers.get(c.mediaId);
    if (!buf) continue;
    const segment = exportAudioSegment(c, buf.duration, range);
    if (!segment) continue;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = segment.speed;
    const gain = ctx.createGain();
    segment.envelope.forEach((key, i) => {
      if (i === 0) gain.gain.setValueAtTime(key.gain, key.time);
      else gain.gain.linearRampToValueAtTime(key.gain, key.time);
    });
    src.connect(gain).connect(ctx.destination);
    src.start(segment.when, segment.offset, segment.sourceSeconds);
  }
  const sound = ctx.createBuffer(2, Math.ceil(BRAND_OUTRO_DURATION * sampleRate), sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = sound.getChannelData(channel);
    for (let i = 0; i < data.length; i++) data[i] = outroSoundSample(i / sampleRate);
  }
  const ending = ctx.createBufferSource();
  ending.buffer = sound;
  ending.connect(ctx.destination);
  ending.start(range.end - range.start);
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
  if (opts.format === "gif") return exportGif(opts);
  if (!isExportSupported()) {
    throw new Error("Your browser doesn't support video export. Use a Chromium-based browser (Chrome, Edge, Brave, Arc).");
  }

  const { snapshot, media, format, scale, videoBitrate, audioBitrate = 192_000, cutEndAt, onProgress, signal } = opts;
  const { settings, clips, tracks } = snapshot;
  const fps = settings.fps;
  const width = Math.max(2, Math.round(settings.width * scale) & ~1);
  const height = Math.max(2, Math.round(settings.height * scale) & ~1);

  const fullDuration = timelineDuration(settings, clips);
  const range = exportTimeRange(fullDuration, opts.range ?? (cutEndAt != null && cutEndAt > 0 ? { start: 0, end: Math.min(cutEndAt, fullDuration) } : undefined));
  const contentDuration = range.duration;
  if (contentDuration <= 0) throw new Error("Nothing to export — the timeline is empty.");
  const duration = contentDuration + BRAND_OUTRO_DURATION;
  const username = outroUsername(opts.username);

  const totalFrames = Math.ceil(duration * fps);
  onProgress?.(0, "Loading media…");
  const used = new Set(clips.filter(c => !c.hidden && !tracks.find(tr => tr.id === c.trackId)?.hidden && "mediaId" in c).map(c => (c as MediaClip).mediaId));
  for (const c of clips) if (c.kind === "video" && c.videoMatte) used.add(c.videoMatte.mediaId);
  assertVideoMattes(clips.filter(c => !c.hidden && !tracks.find(tr => tr.id === c.trackId)?.hidden), (id, width, height) => media.some(m => m.id === id && m.width === width && m.height === height));
  const { videos, images, audioBuffers } = await loadSources(media.filter(m => used.has(m.id)), true, signal);
  let videoEncoder: VideoEncoder | undefined;
  let audioEncoder: AudioEncoder | undefined;
  let encoderFailure: Error | undefined;
  try {
  assertVideoMattes(clips.filter(c => !c.hidden && !tracks.find(tr => tr.id === c.trackId)?.hidden), (id, width, height) => images.get(id)?.naturalWidth === width && images.get(id)?.naturalHeight === height);
  const artwork = await loadBrandOutroArtwork();
  const logo = artwork.logo;
  checkAbort(signal);

  // Pre-mix audio in parallel with video setup.
  onProgress?.(0.02, "Mixing audio…");
  const audioBufferPromise = renderAudioMix(snapshot, audioBuffers, duration, range);

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not acquire canvas context");

  // Lazy-load the appropriate muxer.
  const trackZ = (trackId: string) => tracks.findIndex((t) => t.id === trackId);
  const { codec: videoCodec, muxerCodec: videoMuxerCodec } = pickVideoCodec(format, width, height, fps);
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
  videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { encoderFailure = e; },
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
    if (encoderFailure) throw encoderFailure;
    const localTime = f / fps;
    const t = range.start + localTime;

    // Draw background.
    ctx.fillStyle = settings.background;
    ctx.fillRect(0, 0, width, height);

    // Compute render ops (handles outgoing + incoming-preroll transitions).
    const ops = (localTime < contentDuration ? computeRenderOps(clips, isVisualTrack, t, width) : []).sort(
      (a, b) => trackZ(a.clip.trackId) - trackZ(b.clip.trackId),
    );

    for (const op of ops) {
      if (op.clip.kind === "video") {
        const mc = op.clip;
        const v = videos.get(mc.mediaId);
        if (v) {
          const speed = mc.speed && mc.speed > 0 ? mc.speed : 1;
          const localT = op.localTimeOverride !== undefined ? op.localTimeOverride : mc.trimIn + (t - mc.start) * speed;
          await waitForVideoFrame(v, localT, { signal });
        }
      }
      // Draw before seeking another cut that may share this decoder.
      ctx.save();
      if (op.translateX) ctx.translate(op.translateX, 0);
      if (op.clipRect) {
        ctx.beginPath();
        ctx.rect(op.clipRect.x, 0, op.clipRect.w, canvas.height);
        ctx.clip();
      }
      ctx.globalAlpha = op.alpha;
      drawClip(ctx, width, height, op.clip, t, { videos, images }, op.localTimeOverride);
      ctx.restore();
    }

    if (localTime >= contentDuration) drawBrandOutro(ctx, width, height, localTime - contentDuration, username, logo, artwork);

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
  if (encoderFailure) throw encoderFailure;
  videoEncoder.close();

  // ── Audio encoding ──
  if (mixed && muxer.addAudioChunk) {
    onProgress?.(0.92, "Encoding audio…");
    const sampleRate = mixed.sampleRate;
    const channels = Math.min(2, mixed.numberOfChannels);
    audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk!(chunk, meta),
      error: (e) => { encoderFailure = e; },
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
      if (encoderFailure) throw encoderFailure;
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
    if (encoderFailure) throw encoderFailure;
    audioEncoder.close();
  }

  onProgress?.(0.98, "Finalising…");
  muxer.finalize();

  const mime = format === "mp4" ? "video/mp4" : "video/webm";
  const blob = stampEnding(new Blob([muxer.target.buffer], { type: mime }), contentDuration, format === "mp4" ? "mp4" : "webm");
  const safeTitle = (snapshot.title || "video").replace(/[^\w-]+/g, "_");
  const filename = `${safeTitle}.${format}`;
  onProgress?.(1, "Done");
  return { blob, filename };
  } finally {
    if (videoEncoder && videoEncoder.state !== "closed") videoEncoder.close();
    if (audioEncoder && audioEncoder.state !== "closed") audioEncoder.close();
    videos.forEach(v => { v.pause(); v.removeAttribute("src"); v.load(); });
    images.forEach(img => { img.src = ""; });
  }
}

/** GIF uses the timeline renderer without a video/audio codec dependency. */
async function exportGif(opts: ExportOptions): Promise<ExportResult> {
  const { snapshot, signal, onProgress } = opts;
  const { settings, clips, tracks } = snapshot;
  const fullDuration = timelineDuration(settings, clips);
  const range = exportTimeRange(fullDuration, opts.range ?? (opts.cutEndAt != null && opts.cutEndAt > 0 ? { start: 0, end: Math.min(opts.cutEndAt, fullDuration) } : undefined));
  const contentDuration = range.duration;
  if (contentDuration > GIF_CONTENT_LIMIT) throw new Error("GIF exports support up to 60 seconds of timeline content");
  const plan = gifPlan(settings.width, settings.height, opts.scale, contentDuration + BRAND_OUTRO_DURATION, settings.fps);
  if (contentDuration <= 0) throw new Error("Nothing to export");
  checkAbort(signal);
  const visual = (id: string) => { const tr = tracks.find(t => t.id === id); return !!tr && !tr.hidden && tr.kind !== "audio"; };
  const ids = new Set(clips.filter(c => !c.hidden && visual(c.trackId) && c.kind !== "audio" && "mediaId" in c).map(c => (c as MediaClip).mediaId));
  onProgress?.(0, "Loading media…");
  for (const c of clips) if (c.kind === "video" && c.videoMatte) ids.add(c.videoMatte.mediaId);
  assertVideoMattes(clips.filter(c => !c.hidden && visual(c.trackId)), (id, width, height) => opts.media.some(m => m.id === id && m.width === width && m.height === height));
  const { videos, images } = await loadSources(opts.media.filter(m => ids.has(m.id)), false, signal);
  let session: ReturnType<typeof gifWorkerSession> | undefined;
  const abort = () => session?.close();
  try {
    assertVideoMattes(clips.filter(c => !c.hidden && visual(c.trackId)), (id, width, height) => images.get(id)?.naturalWidth === width && images.get(id)?.naturalHeight === height);
    const artwork = await loadBrandOutroArtwork();
    const logo = artwork.logo;
    if (document.fonts?.ready) await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 3000))]);
    checkAbort(signal);
    const canvas = document.createElement("canvas"); canvas.width = plan.width; canvas.height = plan.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Could not acquire canvas context");
    session = gifWorkerSession(plan.width, plan.height, GIF_WORKER);
    signal?.addEventListener("abort", abort, { once: true });
    await session.ready;
    const username = outroUsername(opts.username);
    for (let f = 0; f < plan.frames; f++) {
      checkAbort(signal);
      const localTime = f / plan.fps;
      const time = range.start + localTime;
      ctx.clearRect(0, 0, plan.width, plan.height);
      ctx.fillStyle = settings.background; ctx.fillRect(0, 0, plan.width, plan.height);
      const ops = (localTime < contentDuration ? computeRenderOps(clips, visual, time, plan.width) : []).sort((a, b) => tracks.findIndex(t => t.id === a.clip.trackId) - tracks.findIndex(t => t.id === b.clip.trackId));
      for (const op of ops) {
        if (op.clip.kind === "video") {
          const video = videos.get(op.clip.mediaId);
          if (video) await waitForVideoFrame(video, op.localTimeOverride ?? op.clip.trimIn + (time - op.clip.start) * (op.clip.speed || 1), { signal });
        }
        ctx.save();
        if (op.translateX) ctx.translate(op.translateX, 0);
        if (op.clipRect) { ctx.beginPath(); ctx.rect(op.clipRect.x, 0, op.clipRect.w, plan.height); ctx.clip(); }
        ctx.globalAlpha = op.alpha;
        drawClip(ctx, plan.width, plan.height, op.clip, time, { videos, images }, op.localTimeOverride); ctx.restore();
      }
      if (localTime >= contentDuration) drawBrandOutro(ctx, plan.width, plan.height, localTime - contentDuration, username, logo, artwork);
      await session.frame(ctx.getImageData(0, 0, plan.width, plan.height).data, gifFrameDelay(f, plan));
      onProgress?.(0.03 + 0.94 * (f + 1) / plan.frames, `Encoding frame ${f + 1} / ${plan.frames}`);
    }
    const buffer = await session.finish(); checkAbort(signal);
    const filename = `${(snapshot.title || "video").replace(/[^\w-]+/g, "_")}.gif`;
    onProgress?.(1, "Done");
    return { blob: new Blob([buffer], { type: "image/gif" }), filename };
  } catch (error) { checkAbort(signal); throw error; }
  finally {
    signal?.removeEventListener("abort", abort); session?.close();
    videos.forEach(v => { v.pause(); v.removeAttribute("src"); v.load(); });
  }
}

export type StillFormat = "png" | "jpg";

export interface StillOptions {
  snapshot: ProjectSnapshot;
  media: MediaItem[];
  format: StillFormat;
  /** Output scale multiplier: 1 = project resolution, 2 = double. */
  scale: number;
  /** Timeline time of the frame to capture. */
  time: number;
  /** JPEG quality 0..1. */
  quality?: number;
}

/**
 * Render a single frame to PNG or JPG. This is the download for photo and
 * graphic designs, and a frame grab for video projects. Unlike the video path
 * it needs no WebCodecs, so it works in every browser.
 */
export async function exportStill(opts: StillOptions): Promise<ExportResult> {
  const { snapshot, media, format, scale, quality = 0.92 } = opts;
  const { settings, clips, tracks } = snapshot;
  const width = Math.max(2, Math.round(settings.width * scale));
  const height = Math.max(2, Math.round(settings.height * scale));
  const fullDuration = timelineDuration(settings, clips);
  // The playhead can sit exactly on the end of the timeline, where nothing is active.
  const t = Math.max(0, Math.min(opts.time, fullDuration - 1 / Math.max(1, settings.fps)));

  const isVisualTrack = (trackId: string) => {
    const tr = tracks.find((x) => x.id === trackId);
    return !!tr && !tr.hidden && tr.kind !== "audio";
  };
  const trackZ = (trackId: string) => tracks.findIndex((x) => x.id === trackId);
  const ops = computeRenderOps(clips, isVisualTrack, t, width).sort(
    (a, b) => trackZ(a.clip.trackId) - trackZ(b.clip.trackId),
  );

  const used = new Set(ops.map((op) => (op.clip.kind === "text" ? "" : (op.clip as MediaClip).mediaId)));
  for (const op of ops) if (op.clip.kind === "video" && op.clip.videoMatte) used.add(op.clip.videoMatte.mediaId);
  assertVideoMattes(ops.map(op => op.clip), (id, width, height) => media.some(m => m.id === id && m.width === width && m.height === height));
  const { videos, images } = await loadSources(media.filter((m) => used.has(m.id)), false);

  assertVideoMattes(ops.map(op => op.clip), (id, w, h) => images.get(id)?.naturalWidth === w && images.get(id)?.naturalHeight === h);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not acquire canvas context");
  ctx.fillStyle = settings.background;
  ctx.fillRect(0, 0, width, height);
  for (const op of ops) {
    if (op.clip.kind === "video") {
      const mc = op.clip;
      const v = videos.get(mc.mediaId);
      if (v) await waitForVideoFrame(v, op.localTimeOverride !== undefined ? op.localTimeOverride : mc.trimIn + (t - mc.start) * (mc.speed || 1));
    }
    ctx.save();
    if (op.translateX) ctx.translate(op.translateX, 0);
    if (op.clipRect) {
      ctx.beginPath();
      ctx.rect(op.clipRect.x, 0, op.clipRect.w, height);
      ctx.clip();
    }
    ctx.globalAlpha = op.alpha;
    drawClip(ctx, width, height, op.clip, t, { videos, images }, op.localTimeOverride);
    ctx.restore();
  }

  const mime = format === "png" ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode image"))), mime, quality),
  );
  const safeTitle = (snapshot.title || "design").replace(/[^\w-]+/g, "_");
  return { blob, filename: `${safeTitle}.${format}` };
}
