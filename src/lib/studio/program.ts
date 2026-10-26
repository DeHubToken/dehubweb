/**
 * Program output
 * ==============
 * The last stage of a browser broadcast: whatever the broadcaster puts on air
 * (camera, screen, camera bubble, a look, the guests' mix) arrives here as the
 * BASE picture, and what actually reaches the sender is a canvas with the
 * creator's studio drawn over it — a scene card ("Starting soon", "Be right
 * back"), extra sources (a logo, a second camera, a video clip) and the
 * overlay widgets.
 *
 * It is what makes OBS optional. The widgets matter most: drawn by each
 * DeHub viewer's app they never reach Twitch or YouTube, because the
 * multistream relay forwards the video and nothing else. Burned in here, every
 * platform the stream is pushed to sees the same alerts DeHub viewers do.
 *
 * Shaped like the guest mixer next door and for the same reason: WHIP carries
 * one video track, so everything has to be one canvas by the time it reaches
 * the sender. It slots in as a wrapper round the session — the broadcaster
 * keeps calling `session.replaceTrack('video', …)` exactly as it does today;
 * while the program is active, the wrapper takes that track as the base and
 * the sender keeps the canvas. With nothing to draw the wrapper is
 * transparent and the base goes out untouched, so a plain camera stream pays
 * nothing for any of this.
 *
 * Inputs are borrowed, never owned: stopping the program leaves the base
 * track and every source's media running.
 */
import type { WhipSession } from '@/lib/livepeer/whip';
import { createLogger } from '@/lib/logger';

const logger = createLogger('ProgramOutput');

const FRAME_RATE = 30;
/** 1080p is the ceiling the ingest is tuned for; larger captures are scaled down. */
const MAX_LONG_SIDE = 1920;
const DEFAULT_SIZE = { width: 1280, height: 720 };
const CARD_FADE_MS = 400;

/** A rectangle as fractions of the frame, so it survives a resolution change. */
export interface FrameRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A full-frame card a scene shows instead of the live picture. */
export interface ProgramCard {
  title: string;
  subtitle?: string;
  /** CSS colour behind the text. */
  background: string;
  /** Drawn to cover the frame, under the text. */
  image?: CanvasImageSource | null;
  /** Counts down to this time (epoch ms) under the title. */
  countdownTo?: number | null;
}

export type SourceShape = 'rect' | 'rounded' | 'circle';

/** Something the creator placed on top of the live picture. */
export interface ProgramSource {
  id: string;
  /** An <img>, or a <video> playing a file or a second camera. */
  element: HTMLImageElement | HTMLVideoElement;
  rect: FrameRect;
  shape: SourceShape;
  /** Mirrors a self-view camera the way the preview does. */
  mirror?: boolean;
}

/** Draws on top of everything, every frame — the overlay widgets. */
export type ProgramPainter = (ctx: CanvasRenderingContext2D, width: number, height: number, now: number) => void;

export interface ProgramOutput {
  /**
   * Wraps a WHIP session so video swaps land on the base picture while the
   * program is active. `onAir` is the stream the session was opened with.
   */
  wrap: (session: WhipSession, onAir?: MediaStream | null) => WhipSession;
  /** The raw session behind a wrapped one, for identity checks. */
  unwrap: (session: WhipSession | null) => WhipSession | null;
  /** Forget the session (it was stopped). */
  release: () => void;
  setCard: (card: ProgramCard | null) => void;
  setSources: (sources: ProgramSource[]) => void;
  setPainter: (painter: ProgramPainter | null) => void;
  isActive: () => boolean;
  /** The canvas, for the creator's preview. Null while inactive. */
  preview: () => MediaStream | null;
  /** The base picture the broadcaster last put on air. */
  base: () => MediaStreamTrack | null;
  /** Fires when the program starts or stops drawing. */
  onActiveChange: (listener: (active: boolean) => void) => () => void;
  /** Puts the base back on the sender and retires the canvas. */
  stop: () => Promise<void>;
}

/** Even dimensions, long side capped — H.264 needs the former, the ingest the latter. */
export function outputSize(width: number, height: number): { width: number; height: number } {
  if (!width || !height) return { ...DEFAULT_SIZE };
  const scale = Math.min(1, MAX_LONG_SIDE / Math.max(width, height));
  return {
    width: Math.max(2, Math.round((width * scale) / 2) * 2),
    height: Math.max(2, Math.round((height * scale) / 2) * 2),
  };
}

/** 0→1 over the fade, eased; 1 once it is done. */
export function fadeProgress(startedAt: number, now: number, duration = CARD_FADE_MS): number {
  if (duration <= 0) return 1;
  const t = Math.min(1, Math.max(0, (now - startedAt) / duration));
  return t * t * (3 - 2 * t);
}

/** "mm:ss" to a target, "0:00" once it has passed. */
export function formatCountdown(target: number, now: number): string {
  const left = Math.max(0, Math.ceil((target - now) / 1000));
  const m = Math.floor(left / 60);
  const s = left % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Pixel rect for a fractional one, clamped inside the frame. */
export function pixelRect(rect: FrameRect, width: number, height: number) {
  const w = Math.max(1, Math.round(Math.min(1, Math.max(0, rect.w)) * width));
  const h = Math.max(1, Math.round(Math.min(1, Math.max(0, rect.h)) * height));
  const x = Math.round(Math.min(Math.max(0, rect.x), 1) * width);
  const y = Math.round(Math.min(Math.max(0, rect.y), 1) * height);
  return { x: Math.min(x, width - w), y: Math.min(y, height - h), w, h };
}

function mediaSize(el: CanvasImageSource): { w: number; h: number } {
  if (el instanceof HTMLVideoElement) return { w: el.videoWidth, h: el.videoHeight };
  if (el instanceof HTMLImageElement) return { w: el.naturalWidth, h: el.naturalHeight };
  const sized = el as { width?: number; height?: number };
  return { w: Number(sized.width) || 0, h: Number(sized.height) || 0 };
}

function drawCover(ctx: CanvasRenderingContext2D, el: CanvasImageSource, x: number, y: number, w: number, h: number, mirror = false) {
  const { w: vw, h: vh } = mediaSize(el);
  if (!vw || !vh) return false;
  const scale = Math.max(w / vw, h / vh);
  const sw = w / scale;
  const sh = h / scale;
  if (mirror) {
    ctx.save();
    ctx.translate(x + w, y);
    ctx.scale(-1, 1);
    ctx.drawImage(el, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, w, h);
    ctx.restore();
  } else {
    ctx.drawImage(el, (vw - sw) / 2, (vh - sh) / 2, sw, sh, x, y, w, h);
  }
  return true;
}

/** A logo keeps its shape: contained, never cropped. */
function drawContain(ctx: CanvasRenderingContext2D, el: CanvasImageSource, x: number, y: number, w: number, h: number) {
  const { w: vw, h: vh } = mediaSize(el);
  if (!vw || !vh) return;
  const scale = Math.min(w / vw, h / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  ctx.drawImage(el, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function shapePath(ctx: CanvasRenderingContext2D, shape: SourceShape, x: number, y: number, w: number, h: number) {
  ctx.beginPath();
  if (shape === 'circle') {
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  } else if (shape === 'rounded') {
    const r = Math.min(w, h) * 0.08;
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
  } else {
    ctx.rect(x, y, w, h);
  }
  ctx.closePath();
}

function playTrack(track: MediaStreamTrack): HTMLVideoElement {
  const video = document.createElement('video');
  video.srcObject = new MediaStream([track]);
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
  void video.play().catch((error) => logger.warn('Base picture failed to play', error));
  return video;
}

/**
 * A frame clock that keeps ticking in a background tab. A creator streaming a
 * game is looking at the game, not this tab, and the browser throttles rAF to
 * a stop and page timers to about once a second there — a frozen stream. A
 * dedicated worker's timers are not throttled that way, so it posts the beat
 * and the page draws on it. The page interval underneath is a floor for
 * engines that refuse a blob worker.
 */
function startClock(onTick: () => void): () => void {
  const interval = Math.round(1000 / FRAME_RATE);
  let worker: Worker | null = null;
  let url = '';
  try {
    url = URL.createObjectURL(
      new Blob([`setInterval(function(){postMessage(0)},${interval});`], { type: 'text/javascript' }),
    );
    worker = new Worker(url);
    worker.onmessage = onTick;
  } catch {
    worker = null;
  }
  const floor = window.setInterval(onTick, worker ? 250 : interval);
  return () => {
    window.clearInterval(floor);
    worker?.terminate();
    if (url) URL.revokeObjectURL(url);
  };
}

export function createProgramOutput(): ProgramOutput {
  let raw: WhipSession | null = null;
  let wrapped: WhipSession | null = null;
  let baseTrack: MediaStreamTrack | null = null;
  let baseVideo: HTMLVideoElement | null = null;

  let card: ProgramCard | null = null;
  let cardChangedAt = 0;
  let previousCard: ProgramCard | null = null;
  let sources: ProgramSource[] = [];
  let painter: ProgramPainter | null = null;

  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let canvasStream: MediaStream | null = null;
  let canvasTrack: MediaStreamTrack | null = null;
  let stopClock: (() => void) | null = null;
  let onSender: 'base' | 'canvas' = 'base';
  const listeners = new Set<(active: boolean) => void>();

  // Swaps are serialised: a scene change and a camera flip landing together
  // must not interleave their replaceTrack calls.
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T,>(fn: () => Promise<T>): Promise<T> => {
    const next = chain.then(fn, fn);
    chain = next.catch(() => undefined);
    return next;
  };

  const wantsActive = () => Boolean(card || previousCard || sources.length || painter);

  const setBase = (track: MediaStreamTrack | null) => {
    if (track === baseTrack) return;
    baseTrack = track;
    if (baseVideo) baseVideo.srcObject = null;
    baseVideo = track ? playTrack(track) : null;
  };

  const size = () => {
    const settings = baseTrack?.getSettings?.() ?? {};
    const w = baseVideo?.videoWidth || settings.width || 0;
    const h = baseVideo?.videoHeight || settings.height || 0;
    return outputSize(w, h);
  };

  const drawCard = (c: ProgramCard, width: number, height: number, now: number) => {
    if (!ctx) return;
    ctx.fillStyle = c.background || '#0b0b0f';
    ctx.fillRect(0, 0, width, height);
    if (c.image) {
      drawCover(ctx, c.image, 0, 0, width, height);
      // Text must stay readable over any picture.
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(0, 0, width, height);
    }
    const unit = Math.min(width, height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = unit * 0.02;
    const titleSize = Math.round(unit * 0.11);
    ctx.font = `800 ${titleSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    const hasSub = Boolean(c.subtitle) || Boolean(c.countdownTo);
    ctx.fillText(c.title, width / 2, height / 2 - (hasSub ? titleSize * 0.45 : 0), width * 0.9);
    const lines: string[] = [];
    if (c.subtitle) lines.push(c.subtitle);
    if (c.countdownTo) lines.push(formatCountdown(c.countdownTo, Date.now()));
    if (lines.length) {
      const subSize = Math.round(unit * 0.045);
      ctx.font = `600 ${subSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      lines.forEach((line, i) => {
        ctx!.fillText(line, width / 2, height / 2 + titleSize * 0.55 + i * subSize * 1.4, width * 0.9);
      });
    }
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    void now;
  };

  const drawFrame = () => {
    if (!canvas || !ctx) return;
    const { width, height } = size();
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const now = performance.now();

    // The card fades in over the picture and back out of it.
    const fade = fadeProgress(cardChangedAt, now);
    const shown = card ?? previousCard;
    const cardAlpha = card ? fade : previousCard ? 1 - fade : 0;
    if (!card && previousCard && fade >= 1) previousCard = null;

    if (cardAlpha < 1) {
      if (!baseVideo || baseVideo.readyState < 2 || !drawCover(ctx, baseVideo, 0, 0, width, height)) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);
      }
      for (const source of sources) {
        const r = pixelRect(source.rect, width, height);
        const el = source.element;
        if (el instanceof HTMLVideoElement && el.readyState < 2) continue;
        ctx.save();
        shapePath(ctx, source.shape, r.x, r.y, r.w, r.h);
        ctx.clip();
        if (el instanceof HTMLImageElement) drawContain(ctx, el, r.x, r.y, r.w, r.h);
        else drawCover(ctx, el, r.x, r.y, r.w, r.h, source.mirror);
        ctx.restore();
      }
    }
    if (shown && cardAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = cardAlpha;
      drawCard(shown, width, height, now);
      ctx.restore();
    }
    if (painter) {
      try {
        painter(ctx, width, height, now);
      } catch (error) {
        // A widget bug must never take the picture down with it.
        logger.warn('Overlay painter failed; dropping it', error);
        painter = null;
      }
    }
  };

  const ensureCanvas = () => {
    if (canvas) return;
    canvas = document.createElement('canvas');
    const { width, height } = size();
    canvas.width = width;
    canvas.height = height;
    ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D is unavailable, so the studio cannot be composited.');
    drawFrame();
    canvasStream = canvas.captureStream(FRAME_RATE);
    canvasTrack = canvasStream.getVideoTracks()[0] ?? null;
    try {
      if (canvasTrack) canvasTrack.contentHint = 'motion';
    } catch {
      /* read-only on older engines */
    }
    stopClock = startClock(drawFrame);
    logger.info('Program output started', { width, height });
  };

  const retireCanvas = () => {
    stopClock?.();
    stopClock = null;
    canvasTrack?.stop();
    canvasTrack = null;
    canvasStream = null;
    canvas = null;
    ctx = null;
  };

  /** Brings the sender in line with whether there is anything to draw. */
  const sync = () =>
    serial(async () => {
      const active = wantsActive();
      if (active) ensureCanvas();
      const want = active ? 'canvas' : 'base';
      if (raw && want !== onSender) {
        await raw.replaceTrack('video', want === 'canvas' ? canvasTrack : baseTrack);
      }
      const changed = want !== onSender;
      onSender = want;
      // Retired only after the base is back on the sender: never a frame
      // where the session holds a dead track.
      if (!active) retireCanvas();
      if (changed) listeners.forEach((l) => l(active));
    });

  const wrap = (session: WhipSession, onAir?: MediaStream | null): WhipSession => {
    raw = session;
    onSender = 'base';
    if (onAir) setBase(onAir.getVideoTracks()[0] ?? null);
    wrapped = {
      ...session,
      replaceTrack: async (kind: 'audio' | 'video', track: MediaStreamTrack | null) => {
        if (kind !== 'video') return session.replaceTrack(kind, track);
        setBase(track);
        // While drawing, the canvas stays on the sender and simply picks up
        // the new base on its next frame.
        if (onSender === 'canvas') return;
        return serial(() => session.replaceTrack('video', track));
      },
    } as WhipSession;
    void sync();
    return wrapped;
  };

  return {
    wrap,
    unwrap: (session) => (session && session === wrapped ? raw : session),
    release: () => {
      raw = null;
      wrapped = null;
      onSender = 'base';
    },
    setCard: (next) => {
      if (next === card) return;
      previousCard = card;
      card = next;
      cardChangedAt = performance.now();
      void sync();
      // Once the fade-out is over nothing may be left to draw.
      if (!next) window.setTimeout(() => void sync(), CARD_FADE_MS + 50);
    },
    setSources: (next) => {
      sources = next;
      void sync();
    },
    setPainter: (next) => {
      painter = next;
      void sync();
    },
    isActive: () => onSender === 'canvas' || Boolean(canvas),
    preview: () => canvasStream,
    base: () => baseTrack,
    onActiveChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    stop: async () => {
      card = null;
      previousCard = null;
      sources = [];
      painter = null;
      await sync();
      retireCanvas();
      if (baseVideo) baseVideo.srcObject = null;
      baseVideo = null;
      baseTrack = null;
    },
  };
}
