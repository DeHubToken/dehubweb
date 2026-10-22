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
}

export interface PublicOverlay {
  renderIn: OverlayRenderIn;
  widgets: OverlayWidget[];
  version: number;
  stats: OverlayStats;
}

export interface CreatorOverlay {
  token: string;
  renderIn: OverlayRenderIn;
  widgets: OverlayWidget[];
  version: number;
  obsConnected: boolean;
}
