/**
 * OS media session — one owner at a time
 * ======================================
 *
 * `navigator.mediaSession` is a single global slot. Whatever writes to it last
 * owns the lock screen, the notification shade, the headphone button and the
 * keyboard media keys. DeHub can have several things making noise at once — a
 * radio station, a stage recording, a video card, a TV channel — so writing to
 * it directly from each player means the last one to mount wins, and pressing
 * pause on your headphones stops whichever of them happened to render most
 * recently rather than the one you can hear.
 *
 * This module makes ownership explicit. A player claims the session when it
 * starts, keeps it updated while it plays, and releases it when it stops. Late
 * writes from a player that no longer owns the session are dropped instead of
 * stealing it back.
 *
 * ## Why this is also what "background play" means on the web
 *
 * There is no switch for playing audio with the tab in the background — the
 * behaviour falls out of whether the browser thinks a real, user-meaningful
 * media session exists. Chrome on Android keeps a backgrounded tab's audio
 * alive and posts a media notification once metadata and handlers are set, and
 * suspends it fairly readily when they are not. iOS Safari will not show
 * anything on the lock screen without them. So the same few lines that give
 * you transport controls are what stop playback dying when the user switches
 * apps, which is the whole feature.
 *
 * ## The three things that throw
 *
 * Every entry point here is defensive, because this API fails in three
 * different ways and all of them are easy to hit:
 *
 * 1. `navigator.mediaSession` is absent entirely on some browsers.
 * 2. `setActionHandler` throws `TypeError` for an action the browser does not
 *    implement — `seekto` is the usual one — and a throw halfway through
 *    leaves the rest of the handlers unset.
 * 3. `setPositionState` throws `TypeError` on a non-finite duration, a
 *    negative position, or a position past the end. Live streams and
 *    MediaRecorder webm files produce all three routinely, so the guard is not
 *    theoretical.
 */

/** What the lock screen shows. */
export interface MediaSessionTrack {
  title: string;
  /** Creator, station, host — whatever reads as the "by" line. */
  artist?: string;
  album?: string;
  /** One image URL; the browser is told it can use it at any size. */
  artwork?: string | null;
}

/**
 * Transport controls to offer. Only the ones passed are wired — omitting
 * `nexttrack` means the OS hides the skip button rather than showing a dead
 * one.
 */
export interface MediaSessionHandlers {
  play?: () => void;
  pause?: () => void;
  stop?: () => void;
  previoustrack?: () => void;
  nexttrack?: () => void;
  /** Offset in seconds, defaulting to 10 when the OS does not supply one. */
  seekbackward?: (offset: number) => void;
  seekforward?: (offset: number) => void;
  /** Absolute position in seconds, from scrubbing the OS progress bar. */
  seekto?: (time: number) => void;
}

/** Every action this module knows how to wire, in the order it sets them. */
const ACTIONS = [
  'play',
  'pause',
  'stop',
  'previoustrack',
  'nexttrack',
  'seekbackward',
  'seekforward',
  'seekto',
] as const;

type Action = (typeof ACTIONS)[number];

/**
 * Id of the player currently owning the session, or null when nothing does.
 * Module scope on purpose: the point is that there is exactly one.
 */
let owner: string | null = null;

function session(): MediaSession | null {
  if (typeof navigator === 'undefined') return null;
  return 'mediaSession' in navigator ? navigator.mediaSession : null;
}

/** Set one handler, tolerating browsers that do not implement the action. */
function setHandler(ms: MediaSession, action: Action, fn: (() => void) | null) {
  try {
    ms.setActionHandler(action as MediaSessionAction, fn);
  } catch {
    // Unimplemented action. Nothing to do — and importantly, nothing that
    // should stop the remaining handlers from being set.
  }
}

function clearHandlers(ms: MediaSession) {
  for (const action of ACTIONS) setHandler(ms, action, null);
}

/**
 * Take ownership of the OS media session.
 *
 * Safe to call repeatedly with the same id — a player that re-renders or
 * changes track just overwrites its own metadata.
 */
export function claimMediaSession(
  ownerId: string,
  track: MediaSessionTrack,
  handlers: MediaSessionHandlers,
): void {
  const ms = session();
  if (!ms) return;

  owner = ownerId;

  try {
    if (typeof MediaMetadata !== 'undefined') {
      ms.metadata = new MediaMetadata({
        title: track.title || 'DeHub',
        artist: track.artist || 'DeHub',
        album: track.album || 'DeHub',
        // `sizes: 'any'` rather than a guessed pixel size: these are remote
        // images of unknown dimensions, and claiming a size the file does not
        // have makes some launchers skip the artwork altogether.
        artwork: track.artwork
          ? [{ src: track.artwork, sizes: 'any', type: '' }]
          : [],
      });
    }
  } catch {
    // A malformed artwork URL is not worth losing the transport controls over.
  }

  // Clear first. Handlers are sticky, so a player that offers fewer controls
  // than the last one would otherwise inherit its leftovers — a stage
  // recording showing a skip button that seeks a radio station.
  clearHandlers(ms);

  for (const action of ACTIONS) {
    const fn = handlers[action];
    if (!fn) continue;

    if (action === 'seekbackward' || action === 'seekforward') {
      const seek = fn as (offset: number) => void;
      setHandler(ms, action, ((details: MediaSessionActionDetails) => {
        seek(details.seekOffset ?? 10);
      }) as unknown as () => void);
      continue;
    }

    if (action === 'seekto') {
      const seekTo = fn as (time: number) => void;
      setHandler(ms, action, ((details: MediaSessionActionDetails) => {
        if (typeof details.seekTime === 'number') seekTo(details.seekTime);
      }) as unknown as () => void);
      continue;
    }

    setHandler(ms, action, fn as () => void);
  }
}

/**
 * Tell the OS whether the owner is currently making sound.
 *
 * This drives which way round the play/pause button is drawn. Getting it wrong
 * is the difference between a lock screen that responds and one that looks
 * broken.
 */
export function setMediaSessionPlaying(ownerId: string, playing: boolean): void {
  const ms = session();
  if (!ms || owner !== ownerId) return;
  try {
    ms.playbackState = playing ? 'playing' : 'paused';
  } catch {
    // Older implementations expose the session without the state setter.
  }
}

/**
 * Publish the scrub position, so the OS can draw a progress bar.
 *
 * Silently skipped when the numbers cannot describe a real position. Live
 * streams report Infinity, and MediaRecorder webm files report either Infinity
 * or the length of their first cluster — both throw here, and a throw from a
 * progress pump running at frame rate is not a small problem.
 */
export function setMediaSessionPosition(
  ownerId: string,
  position: number,
  duration: number,
  playbackRate = 1,
): void {
  const ms = session();
  if (!ms || owner !== ownerId) return;
  if (typeof ms.setPositionState !== 'function') return;

  if (!Number.isFinite(duration) || duration <= 0) return;
  if (!Number.isFinite(position) || position < 0) return;
  if (!Number.isFinite(playbackRate) || playbackRate <= 0) return;

  try {
    ms.setPositionState({
      duration,
      position: Math.min(position, duration),
      playbackRate,
    });
  } catch {
    // Position outside the duration the browser believes in. Not fatal.
  }
}

/**
 * Give up the session, if this player still holds it.
 *
 * The ownership check is the point: a player unmounting after something else
 * has already claimed the session must not wipe the new owner's metadata. That
 * race is normal — closing the stage drawer while a radio station plays on.
 */
export function releaseMediaSession(ownerId: string): void {
  const ms = session();
  if (!ms || owner !== ownerId) return;

  owner = null;
  clearHandlers(ms);
  try {
    ms.metadata = null;
    ms.playbackState = 'none';
  } catch {
    // Nothing left worth reporting.
  }
}

/** Which player owns the session right now, for debugging and tests. */
export function getMediaSessionOwner(): string | null {
  return owner;
}
