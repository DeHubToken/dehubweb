/**
 * A creator's stream overlay, as the stream API stores it.
 *
 * One overlay per creator, carried by every stream they run. Each widget has a
 * rectangle for a landscape picture and one for a portrait picture, as
 * fractions of the frame: a desktop layout would put the chat box over a phone
 * streamer's face. See dehub-stream-backend models/LiveOverlay.ts.
 */

export interface OverlayRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface OverlayWidget {
  id: string;
  /** A kind from the registry. An unknown kind is stored and skipped. */
  kind: string;
  enabled: boolean;
  z: number;
  landscape: OverlayRect;
  portrait: OverlayRect;
  settings: Record<string, unknown>;
}

/**
 * Where the overlay is drawn. 'app' — every viewer's DeHub player draws it.
 * 'video' — an OBS browser source has already burned it into the picture, and
 * the app must stay out of the way or the room sees every alert twice.
 */
export type OverlayRenderIn = 'app' | 'video';

/** The numbers a goal starts from, held by the server so a refresh is not a reset. */
export interface OverlayStats {
  totalTips: number;
  followers: number;
  /** When the stream went live (ISO), so a timer survives a refresh. */
  startedAt?: string | null;
  /** Reactions the stream has had so far. */
  reactions?: number;
}

export interface PublicOverlay {
  renderIn: OverlayRenderIn;
  widgets: OverlayWidget[];
  version: number;
  stats: OverlayStats;
  /** Missing from an older API: read as all off. */
  controls?: OverlayControls;
}

export interface CreatorOverlay {
  token: string;
  renderIn: OverlayRenderIn;
  widgets: OverlayWidget[];
  version: number;
  obsConnected: boolean;
  controls?: OverlayControls;
}

/**
 * Quick controls: switches a creator flips mid-stream that hold for everyone
 * at once. Off means normal. See dehub-stream-backend models/LiveOverlay.ts.
 */
export interface OverlayControls {
  /** Alerts (gifts, follows, rules, wheels) stop appearing. Counters and the chat box keep going. */
  alertsPaused: boolean;
  soundsMuted: boolean;
  /** Nothing is read aloud: no gift messages, no rule read-aloud. */
  readAloudMuted: boolean;
}

export const NO_CONTROLS: OverlayControls = { alertsPaused: false, soundsMuted: false, readAloudMuted: false };

export function parseControls(raw: unknown): OverlayControls {
  const c = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return { alertsPaused: c.alertsPaused === true, soundsMuted: c.soundsMuted === true, readAloudMuted: c.readAloudMuted === true };
}
