/**
 * Guest mixer
 * ===========
 * Puts co-stream guests into the picture and the sound a browser broadcast is
 * already publishing.
 *
 * WHIP carries one video and one audio track, and viewers watch the HLS
 * rendition of exactly those, so "host plus guests" has to be one canvas and
 * one audio mix by the time it reaches the sender. The guests themselves
 * arrive over Agora (see costream-rtc.ts); this file only draws and mixes.
 *
 * It slots in as a wrapper round the WHIP session. The broadcaster keeps
 * calling `session.replaceTrack(...)` for a camera flip, a look, a screen
 * share or a voice effect exactly as it does today; while guests are on, the
 * wrapper takes that track as the HOST TILE instead of sending it, and the
 * sender keeps the composite. When the last guest leaves, the host's own
 * tracks go back on the sender and the wrapper is transparent again. A WHIP
 * session that is reopened (relay or provider fallback) is wrapped the same
 * way and picks the composite straight back up.
 *
 * Inputs are borrowed, never owned: stopping the mixer leaves the camera, the
 * microphone and the guests' tracks running.
 */
import type { WhipSession } from '@/lib/livepeer/whip';
import { createLogger } from '@/lib/logger';

const logger = createLogger('GuestMixer');

export interface GuestTile {
  /** Stable per guest — the seat id. */
  id: string;
  video: MediaStreamTrack | null;
  audio: MediaStreamTrack | null;
  label: string;
  /** Muted by the host: drawn with a marker, left out of the sound. */
  muted: boolean;
}

export interface GuestMixer {
  /**
   * Wraps a WHIP session so track swaps land on the host tile while mixing.
   * `onAir` is the stream the session was opened with: its tracks are what
   * the host is sending until the first swap.
   */
  wrap: (session: WhipSession, onAir?: MediaStream | null) => WhipSession;
  /** The raw session behind a wrapped one, for identity checks. */
  unwrap: (session: WhipSession | null) => WhipSession | null;
  /** Forget the session (it was stopped). */
  release: () => void;
  /**
   * Starts mixing with these as the host's current tracks — what is on the
   * sender right now. Resolves once the composite is on air.
   */
  start: (host: { video: MediaStreamTrack | null; audio: MediaStreamTrack | null }, hostLabel: string) => Promise<void>;
  setGuests: (guests: GuestTile[]) => void;
  /** Puts the host's own tracks back on the sender and retires the canvas. */
  stop: () => Promise<void>;
  isActive: () => boolean;
  /** The composite, for the host's preview. Null while not mixing. */
  preview: () => MediaStream | null;
  /** What the host is putting on air before guests are added. */
  hostTracks: () => { video: MediaStreamTrack | null; audio: MediaStreamTrack | null };
  /** Fires when the host's own video or audio track changes. */
  onHostTracksChange: (listener: () => void) => () => void;
}

const FRAME_RATE = 30;
const GAP = 4;

export interface TileRect { x: number; y: number; w: number; h: number }

/**
 * Where each tile goes, host first. Landscape splits side by side and a phone
 * held upright stacks; three is host-large with the two guests sharing the
 * other half; four is a grid.
 */
export function layoutTiles(count: number, width: number, height: number): TileRect[] {
  const portrait = height > width;
  const half = (a: number) => Math.floor((a - GAP) / 2);
  if (count <= 1) return [{ x: 0, y: 0, w: width, h: height }];
  if (count === 2) {
    return portrait
      ? [{ x: 0, y: 0, w: width, h: half(height) }, { x: 0, y: half(height) + GAP, w: width, h: height - half(height) - GAP }]
      : [{ x: 0, y: 0, w: half(width), h: height }, { x: half(width) + GAP, y: 0, w: width - half(width) - GAP, h: height }];
  }
  if (count === 3) {
    if (portrait) {
      const top = half(height);
      const bottomH = height - top - GAP;
      return [
        { x: 0, y: 0, w: width, h: top },
        { x: 0, y: top + GAP, w: half(width), h: bottomH },
        { x: half(width) + GAP, y: top + GAP, w: width - half(width) - GAP, h: bottomH },
      ];
    }
    const left = half(width);
    const rightW = width - left - GAP;
    return [
      { x: 0, y: 0, w: left, h: height },
      { x: left + GAP, y: 0, w: rightW, h: half(height) },
      { x: left + GAP, y: half(height) + GAP, w: rightW, h: height - half(height) - GAP },
    ];
  }
  const w1 = half(width);
  const h1 = half(height);
  return [
    { x: 0, y: 0, w: w1, h: h1 },
    { x: w1 + GAP, y: 0, w: width - w1 - GAP, h: h1 },
    { x: 0, y: h1 + GAP, w: w1, h: height - h1 - GAP },
    { x: w1 + GAP, y: h1 + GAP, w: width - w1 - GAP, h: height - h1 - GAP },
  ].slice(0, Math.min(count, 4));
}

/** drawImage takes an element, not a track. Muted: sound is mixed separately. */
function videoFor(track: MediaStreamTrack): HTMLVideoElement {
  const video = document.createElement('video');
  video.srcObject = new MediaStream([track]);
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
  void video.play().catch((error) => logger.warn('Mixer source failed to play', error));
  return video;
}

function drawCover(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, r: TileRect) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return false;
  const scale = Math.max(r.w / vw, r.h / vh);
  const sw = r.w / scale;
  const sh = r.h / scale;
  ctx.drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, r.x, r.y, r.w, r.h);
  return true;
}

function drawLabel(ctx: CanvasRenderingContext2D, r: TileRect, text: string, muted: boolean) {
  const size = Math.max(14, Math.round(Math.min(r.w, r.h) * 0.045));
  ctx.font = `600 ${size}px system-ui, -apple-system, sans-serif`;
  const label = muted ? `${text} · muted` : text;
  const pad = Math.round(size * 0.5);
  const width = Math.min(ctx.measureText(label).width + pad * 2, r.w - pad * 2);
  const x = r.x + pad;
  const y = r.y + r.h - size - pad * 3;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath();
  ctx.roundRect?.(x, y, width, size + pad * 2, size * 0.4);
  if (!ctx.roundRect) ctx.rect(x, y, width, size + pad * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'top';
  ctx.fillText(label, x + pad, y + pad, width - pad * 2);
}

function drawPlaceholder(ctx: CanvasRenderingContext2D, r: TileRect, text: string) {
  ctx.fillStyle = '#18181b';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  const size = Math.round(Math.min(r.w, r.h) * 0.28);
  ctx.fillStyle = '#3f3f46';
  ctx.beginPath();
  ctx.arc(r.x + r.w / 2, r.y + r.h / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e4e4e7';
  ctx.font = `700 ${Math.round(size * 0.42)}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText((text.replace(/^@/, '')[0] || '?').toUpperCase(), r.x + r.w / 2, r.y + r.h / 2);
  ctx.textAlign = 'start';
}

export function createGuestMixer(): GuestMixer {
  let inner: WhipSession | null = null;
  let hostVideo: MediaStreamTrack | null = null;
  let hostAudio: MediaStreamTrack | null = null;
  let hostName = '';
  let guests: GuestTile[] = [];
  const listeners = new Set<() => void>();
  const raw = new WeakMap<WhipSession, WhipSession>();

  let active = false;
  let canvas: HTMLCanvasElement | null = null;
  let canvasTrack: MediaStreamTrack | null = null;
  let previewStream: MediaStream | null = null;
  let hostEl: HTMLVideoElement | null = null;
  const guestEls = new Map<string, { track: MediaStreamTrack; el: HTMLVideoElement }>();
  let timer = 0;

  let audioCtx: AudioContext | null = null;
  let mixOut: MediaStreamAudioDestinationNode | null = null;
  let hostNode: MediaStreamAudioSourceNode | null = null;
  const guestAudio = new Map<string, { track: MediaStreamTrack; node: MediaStreamAudioSourceNode; gain: GainNode; el: HTMLAudioElement }>();

  const notify = () => listeners.forEach((l) => { try { l(); } catch { /* listener's problem */ } });

  const setHostVideoEl = () => {
    if (hostEl && (hostEl.srcObject as MediaStream | null)?.getVideoTracks()[0] === hostVideo) return;
    if (hostEl) hostEl.srcObject = null;
    hostEl = hostVideo ? videoFor(hostVideo) : null;
  };

  const wireHostAudio = () => {
    if (!audioCtx || !mixOut) return;
    try { hostNode?.disconnect(); } catch { /* already gone */ }
    hostNode = null;
    if (hostAudio && hostAudio.readyState === 'live') {
      hostNode = audioCtx.createMediaStreamSource(new MediaStream([hostAudio]));
      hostNode.connect(mixOut);
    }
  };

  const syncGuestMedia = () => {
    const wanted = new Set(guests.map((g) => g.id));
    for (const [id, entry] of guestEls) {
      const g = guests.find((x) => x.id === id);
      if (!wanted.has(id) || g?.video !== entry.track) {
        entry.el.srcObject = null;
        guestEls.delete(id);
      }
    }
    for (const g of guests) {
      if (g.video && !guestEls.has(g.id)) guestEls.set(g.id, { track: g.video, el: videoFor(g.video) });
    }
    if (!audioCtx || !mixOut) return;
    for (const [id, entry] of guestAudio) {
      const g = guests.find((x) => x.id === id);
      if (!wanted.has(id) || g?.audio !== entry.track) {
        try { entry.node.disconnect(); entry.gain.disconnect(); } catch { /* gone */ }
        entry.el.srcObject = null;
        guestAudio.delete(id);
      }
    }
    for (const g of guests) {
      let entry = guestAudio.get(g.id);
      if (!entry && g.audio) {
        // Chrome hands Web Audio silence from a remote WebRTC track unless
        // something is also playing it; a muted element is enough.
        const el = new Audio();
        el.muted = true;
        el.srcObject = new MediaStream([g.audio]);
        void el.play().catch(() => undefined);
        const node = audioCtx.createMediaStreamSource(new MediaStream([g.audio]));
        const gain = audioCtx.createGain();
        node.connect(gain).connect(mixOut);
        entry = { track: g.audio, node, gain, el };
        guestAudio.set(g.id, entry);
      }
      if (entry) entry.gain.gain.value = g.muted ? 0 : 1;
    }
  };

  const draw = () => {
    if (!active || !canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D | null;
    if (!ctx) return;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const tiles = [
      { id: 'host', el: hostVideo?.enabled !== false ? hostEl : null, label: hostName, muted: false },
      ...guests.slice(0, 3).map((g) => ({ id: g.id, el: guestEls.get(g.id)?.el ?? null, label: g.label, muted: g.muted })),
    ];
    const rects = layoutTiles(tiles.length, canvas.width, canvas.height);
    tiles.forEach((tile, i) => {
      const r = rects[i];
      if (!r) return;
      ctx.save();
      ctx.beginPath();
      ctx.rect(r.x, r.y, r.w, r.h);
      ctx.clip();
      const drawn = tile.el && tile.el.readyState >= 2 ? drawCover(ctx, tile.el, r) : false;
      if (!drawn) drawPlaceholder(ctx, r, tile.label);
      if (tile.label && tiles.length > 1) drawLabel(ctx, r, tile.label, tile.muted);
      ctx.restore();
    });
  };

  const send = async (session: WhipSession | null) => {
    if (!session) return;
    if (active) {
      await session.replaceTrack('video', canvasTrack);
      await session.replaceTrack('audio', mixOut?.stream.getAudioTracks()[0] ?? hostAudio);
    } else {
      await session.replaceTrack('video', hostVideo);
      await session.replaceTrack('audio', hostAudio);
    }
  };

  return {
    wrap(session, onAir) {
      inner = session;
      if (onAir) {
        hostVideo = onAir.getVideoTracks()[0] ?? null;
        hostAudio = onAir.getAudioTracks()[0] ?? null;
        notify();
      }
      if (active) void send(session).catch((error) => logger.warn('Could not put the mix on a new session', error));
      const wrapped: WhipSession = {
        stop: () => session.stop(),
        replaceTrack: async (kind, track) => {
          if (kind === 'video') hostVideo = track;
          else hostAudio = track;
          notify();
          if (!active) return session.replaceTrack(kind, track);
          if (kind === 'video') setHostVideoEl();
          else wireHostAudio();
        },
      };
      raw.set(wrapped, session);
      return wrapped;
    },

    unwrap: (session) => (session ? raw.get(session) ?? session : null),

    release() {
      inner = null;
    },

    async start(host, label) {
      hostVideo = host.video;
      hostAudio = host.audio;
      hostName = label;
      if (active) return;
      const settings = hostVideo?.getSettings?.() ?? {};
      const portrait = (settings.height || 720) > (settings.width || 1280);
      canvas = document.createElement('canvas');
      canvas.width = portrait ? 720 : 1280;
      canvas.height = portrait ? 1280 : 720;
      canvasTrack = canvas.captureStream(FRAME_RATE).getVideoTracks()[0] ?? null;
      previewStream = canvasTrack ? new MediaStream([canvasTrack]) : null;

      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtx = new Ctx();
      void audioCtx.resume().catch(() => undefined);
      mixOut = audioCtx.createMediaStreamDestination();

      active = true;
      setHostVideoEl();
      wireHostAudio();
      syncGuestMedia();
      draw();
      timer = window.setInterval(draw, 1000 / FRAME_RATE);
      try {
        await send(inner);
      } catch (error) {
        logger.warn('Could not put the mix on air', error);
      }
    },

    setGuests(next) {
      guests = next.slice(0, 3);
      if (!active) return;
      void audioCtx?.resume().catch(() => undefined);
      syncGuestMedia();
    },

    async stop() {
      if (!active) return;
      active = false;
      window.clearInterval(timer);
      try {
        await send(inner);
      } catch (error) {
        logger.warn('Could not hand the sender back to the host tracks', error);
      }
      canvasTrack?.stop();
      canvasTrack = null;
      canvas = null;
      previewStream = null;
      if (hostEl) hostEl.srcObject = null;
      hostEl = null;
      guestEls.forEach((e) => { e.el.srcObject = null; });
      guestEls.clear();
      guestAudio.forEach((e) => {
        try { e.node.disconnect(); e.gain.disconnect(); } catch { /* gone */ }
        e.el.srcObject = null;
      });
      guestAudio.clear();
      try { hostNode?.disconnect(); } catch { /* gone */ }
      hostNode = null;
      mixOut = null;
      void audioCtx?.close().catch(() => undefined);
      audioCtx = null;
    },

    isActive: () => active,
    preview: () => previewStream,
    hostTracks: () => ({ video: hostVideo, audio: hostAudio }),
    onHostTracksChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
