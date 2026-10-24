/**
 * Adaptive (HLS) playback for video posts
 * ========================================
 * A post with an `hlsUrl` has a ladder of renditions next to its MP4 — 360p up
 * to the source size, one shared audio track, a master playlist the player
 * picks from. Playing that instead of the MP4 is what stops a phone on a slow
 * connection downloading the full 1080p file.
 *
 * The session lives on the `<video>` element, not on a card. Post video plays
 * through the shared element pool (lib/video-handoff): one element moves
 * between the feed card, the post page and the shorts viewer, so an hls.js
 * instance owned by a component would be torn down — or left driving an
 * element some other card now holds — on every hand-off.
 *
 * Engines, in order:
 *   - Safari, and every browser on iOS, play HLS themselves. Native playback
 *     is what Apple tunes for, and it keeps AirPlay working.
 *   - Everywhere Media Source Extensions exist: hls.js, imported on first use
 *     (it is ~400 kB raw and must stay out of the entry bundle).
 *   - Anything else plays the MP4.
 *
 * The MP4 is also the fallback. A ladder that errors is retired for the rest
 * of the session and the element switches to the MP4 at the same position,
 * before the card's own error handling ever sees it — so a broken ladder
 * costs a moment of buffering, never a broken post.
 *
 * Live and TV players have their own hls.js setups and do not come through
 * here.
 */
import type Hls from 'hls.js';
import type { HlsConfig } from 'hls.js';

type Engine = 'hlsjs' | 'native' | 'file';

interface Session {
  /** The MP4: what the card asked for, and the fallback. */
  src: string;
  /** The ladder the card asked for, whether or not it is in use. */
  requested: string;
  engine: Engine;
  startLow: boolean;
  player?: Hls;
  parsed: boolean;
  loading: boolean;
  recoveredMedia: boolean;
  disposed: boolean;
  unbind: () => void;
}

const sessions = new WeakMap<object, Session>();

/** Ladders that failed this session. Every card showing that post uses its MP4. */
const failedLadders = new Set<string>();

let hlsModule: Promise<typeof import('hls.js')> | null = null;
const loadHls = () => (hlsModule ??= import('hls.js'));

/**
 * How far ahead hls.js buffers. A card that is only near the viewport gets
 * `preload="metadata"`, and on the MP4 that costs one small range request;
 * here it buys the first segment of the lowest rung, which is enough for a
 * duration, a first frame and an instant start, and nothing more. Playing, or
 * `preload="auto"` (the next short), opens it up.
 *
 * Applied as a ceiling, not just a target. hls.js on its own reads ahead by
 * bytes — up to 60 MB, i.e. the whole of most posts on a low rung — capped at
 * 600 s, so a card scrolled past would have downloaded its entire video.
 */
const METADATA_BUFFER_SECONDS = 4;
const PLAYING_BUFFER_SECONDS = 30;

/** Set both ends of hls.js's read-ahead to `seconds`. */
function capReadAhead(config: Pick<HlsConfig, 'maxBufferLength' | 'maxMaxBufferLength'>, seconds: number) {
  config.maxBufferLength = seconds;
  config.maxMaxBufferLength = seconds;
}

const HLS_TYPE = 'application/vnd.apple.mpegurl';

/** Is this a master playlist URL rather than a file? */
export function isHlsUrl(url: string | null | undefined): url is string {
  return !!url && /\.m3u8(?:[?#]|$)/i.test(url);
}

/**
 * What the element is playing, as the card asked for it: the MP4 URL, even
 * while hls.js has it on a `blob:` MediaSource. Use this, never
 * `getAttribute('src')`, to ask whether a pooled element has its media.
 */
export function videoSourceOf(el: HTMLVideoElement): string | null {
  return sessions.get(el)?.src ?? el.getAttribute('src');
}

/** Is hls.js driving this element? Then `load()` must not be called on it. */
export function isLadderPlayback(el: HTMLVideoElement): boolean {
  return sessions.get(el)?.engine === 'hlsjs';
}

/** Safari plays HLS natively; so does every browser on iOS, which are all WebKit. */
function prefersNativeHls(el: HTMLVideoElement): boolean {
  if (!el.canPlayType(HLS_TYPE)) return false;
  return typeof navigator !== 'undefined' && /apple/i.test(navigator.vendor || '');
}

export interface VideoSourceOptions {
  /** The post's MP4. Always required: it is the identity and the fallback. */
  src: string;
  /** The post's master playlist, when it has one. */
  hls?: string;
  /** Start on the lowest rung — feed cards, which are small and many. */
  startLow?: boolean;
}

/**
 * Point a pooled element at a post's video. Idempotent: asking again for what
 * the element already has is a no-op, so the hand-off pool can re-apply a
 * card's props without restarting the download.
 */
export function setVideoSource(el: HTMLVideoElement, { src, hls, startLow = false }: VideoSourceOptions): void {
  const current = sessions.get(el);
  const ladder = isHlsUrl(hls) && !failedLadders.has(hls) ? hls : undefined;
  // Same post: keep what is running. A card whose copy of the post has no
  // ladder (stale data on one side of a hand-off) must not knock the element
  // off the ladder another card put it on.
  if (current && current.src === src && (!hls || current.requested === hls)) return;
  if (!current && el.getAttribute('src') === src) {
    if (!ladder) return;
    // A ladder that turns up mid-watch (the post refetched just as its first
    // rendition landed) waits for the next load: switching now would restart
    // the clip from the top.
    if (!el.paused || el.currentTime > 0) return;
  }

  if (current) endSession(el, current);
  if (!ladder) {
    el.src = src;
    return;
  }

  const session: Session = {
    src,
    requested: hls ?? '',
    engine: prefersNativeHls(el) ? 'native' : 'hlsjs',
    startLow,
    parsed: false,
    loading: false,
    recoveredMedia: false,
    disposed: false,
    unbind: () => {},
  };
  sessions.set(el, session);

  // Capture phase on the element itself runs ahead of every listener the card
  // and the playback recovery added, so a ladder error is handled here and
  // never reaches them as a failed post.
  const onError = (event: Event) => {
    if (session.engine === 'file') return;
    event.stopImmediatePropagation();
    fallBackToFile(el, session, `media-${el.error?.code ?? 0}`);
  };
  const onPlay = () => applyLoadPolicy(el, session);
  const onMetadata = () => {
    void checkLadderShape(el).then((wrong) => {
      if (wrong && !session.disposed) fallBackToFile(el, session, 'aspect-mismatch');
    });
  };
  el.addEventListener('error', onError, true);
  el.addEventListener('play', onPlay);
  el.addEventListener('loadedmetadata', onMetadata);
  session.unbind = () => {
    el.removeEventListener('error', onError, true);
    el.removeEventListener('play', onPlay);
    el.removeEventListener('loadedmetadata', onMetadata);
  };

  if (session.engine === 'native') {
    el.src = ladder;
    return;
  }

  // Nothing to play until hls.js arrives; a play() meanwhile waits for it.
  el.removeAttribute('src');
  loadHls()
    .then(({ default: HlsCtor }) => {
      if (session.disposed) return;
      if (!HlsCtor.isSupported()) {
        if (el.canPlayType(HLS_TYPE)) {
          session.engine = 'native';
          el.src = ladder;
        } else {
          session.engine = 'file';
          el.src = src;
        }
        return;
      }
      const config: Partial<HlsConfig> = {
        enableWorker: true,
        // Loading waits for the element's own preload rules (applyLoadPolicy).
        autoStartLoad: false,
        startLevel: startLow ? 0 : -1,
        // A 400 px card never needs the 1080p rung, whatever the bandwidth.
        capLevelToPlayerSize: true,
        maxBufferLength: METADATA_BUFFER_SECONDS,
        maxMaxBufferLength: METADATA_BUFFER_SECONDS,
        backBufferLength: 30,
      };
      const player = new HlsCtor(config);
      session.player = player;
      player.on(HlsCtor.Events.MANIFEST_PARSED, () => {
        session.parsed = true;
        applyLoadPolicy(el, session);
      });
      player.on(HlsCtor.Events.ERROR, (_event, data) => {
        if (!data.fatal || session.disposed) return;
        // One attempt at a decoder hiccup; anything else — a playlist or
        // segment hls.js has already retried — goes to the MP4.
        if (data.type === HlsCtor.ErrorTypes.MEDIA_ERROR && !session.recoveredMedia) {
          session.recoveredMedia = true;
          player.recoverMediaError();
          return;
        }
        fallBackToFile(el, session, `${data.type}:${data.details}`);
      });
      player.loadSource(ladder);
      player.attachMedia(el);
    })
    .catch(() => {
      // The chunk itself failed to load (offline, a deploy mid-session).
      if (!session.disposed) fallBackToFile(el, session, 'hls-chunk');
    });
}

/**
 * Start (or widen) segment loading to match what the element is being asked
 * for: nothing for `preload="none"`, one segment for `metadata`, a normal
 * buffer once it plays or for `auto`.
 */
function applyLoadPolicy(el: HTMLVideoElement, session: Session) {
  const player = session.player;
  if (!player || !session.parsed || session.disposed) return;
  const full = !el.paused || el.preload === 'auto';
  if (!full && el.preload !== 'metadata') return;
  capReadAhead(player.config, full ? PLAYING_BUFFER_SECONDS : METADATA_BUFFER_SECONDS);
  if (!session.loading) {
    session.loading = true;
    player.startLoad(-1);
  }
}

/** Re-read the element's preload after the card changes it. */
export function syncVideoLoad(el: HTMLVideoElement): void {
  const session = sessions.get(el);
  if (session) applyLoadPolicy(el, session);
}

/** How lopsided a frame must be before it counts as portrait or landscape. */
const SHAPE_MARGIN = 1.2;

function shapeOf(width: number, height: number): 'portrait' | 'landscape' | null {
  if (!width || !height) return null;
  if (height > width * SHAPE_MARGIN) return 'portrait';
  if (width > height * SHAPE_MARGIN) return 'landscape';
  return null;
}

/**
 * Is the ladder's picture the wrong shape for the post? Ladders made before
 * the backend sized rungs by the displayed size squeeze a phone video shot
 * upright into a landscape frame. The post's thumbnail is cut from the MP4
 * the right way up, so a ladder that is clearly landscape under a clearly
 * portrait poster (or the other way round) is one of those.
 */
async function checkLadderShape(el: HTMLVideoElement): Promise<boolean> {
  const video = shapeOf(el.videoWidth, el.videoHeight);
  const poster = el.poster;
  if (!video || !poster) return false;
  const img = new Image();
  img.src = poster;
  try {
    await img.decode();
  } catch {
    return false;
  }
  const expected = shapeOf(img.naturalWidth, img.naturalHeight);
  return !!expected && expected !== video;
}

function fallBackToFile(el: HTMLVideoElement, session: Session, reason: string) {
  if (session.engine === 'file' || session.disposed) return;
  failedLadders.add(session.requested);
  const position = el.currentTime;
  const resume = !el.paused;
  const engine = session.engine;
  session.engine = 'file';
  session.player?.destroy();
  session.player = undefined;
  el.src = session.src;
  // Applied once the MP4 is seekable; the viewer carries on where they were.
  if (position > 0) el.currentTime = position;
  if (resume) el.play().catch(() => {});
  void import('./logger')
    .then(({ logToBackend }) =>
      logToBackend(
        { level: 'warn', component: 'HlsVod', message: 'hls fallback to mp4', metadata: { reason, engine, ladder: session.requested } },
        true,
      ),
    )
    .catch(() => {});
}

function endSession(el: HTMLVideoElement, session: Session) {
  session.disposed = true;
  session.unbind();
  session.player?.destroy();
  sessions.delete(el);
}

/**
 * Detach the media and free the decoder — hls.js included, or it keeps the
 * MediaSource and any in-flight segment requests alive.
 */
export function clearVideoSource(el: HTMLVideoElement): void {
  const session = sessions.get(el);
  if (session) endSession(el, session);
  el.removeAttribute('src');
  el.load();
}

/**
 * Reload after an error or a stall. `load()` on an element hls.js is driving
 * would tear its MediaSource out from under it, so the ladder restarts through
 * hls.js instead; native HLS and the MP4 reload the ordinary way.
 */
export function reloadVideoSource(el: Pick<HTMLVideoElement, 'load' | 'error'>): void {
  const session = sessions.get(el);
  if (!session || session.engine !== 'hlsjs') {
    el.load();
    return;
  }
  const player = session.player;
  if (!player) return;
  if (el.error) {
    player.recoverMediaError();
    return;
  }
  player.stopLoad();
  session.loading = false;
  applyLoadPolicy(el as HTMLVideoElement, session);
}
