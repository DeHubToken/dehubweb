/**
 * A creator's stream overlay, painted onto a canvas.
 *
 * Overlays reach the picture two ways today: every DeHub viewer's app draws
 * the widgets as DOM over the player (LiveOverlayLayer), and OBS burns them in
 * from a browser source (ObsOverlayPage). A creator who goes live from the
 * browser has neither OBS nor a DOM in the outgoing video, so viewers on the
 * platforms we multistream to would see a bare camera. This paints the same
 * widgets onto a 2D canvas, frame by frame, for the broadcast compositor to
 * draw over the camera or screen picture before it is encoded.
 *
 * It holds the same state the DOM widgets hold and hears the same events, but
 * nothing in it is React: the compositor calls `paint` from its own frame loop
 * (30fps, often in a hidden tab), and React state would mean a render per
 * event and a DOM nobody looks at. Feeding it is use-overlay-painter.ts's job.
 *
 * Placement is the DOM layer's — layout.ts against a picture that is the whole
 * canvas — and every size is a share of the widget's box, as in
 * live-overlay.css, so 720p, 1080p and portrait all come out right.
 */
import type { HypeTrain } from '@/lib/api/dehub/live-hype';
import type { PointsRow } from '@/lib/api/dehub/live-subathon';
import type { LiveRoomEvent } from '@/lib/api/dehub/stream-presence';
import { drawOrder, isPortraitPicture, rectFor } from '@/lib/live-overlay/layout';
import type { LivePoll } from '@/lib/live-overlay/polls';
import { isAlertKind, isKnownKind, newWidget, type OverlayKind } from '@/lib/live-overlay/registry';
import type { RuleFired } from '@/lib/live-overlay/rules';
import type { CreatorOverlay, OverlayStats, OverlayWidget, PublicOverlay } from '@/lib/live-overlay/types';
import { COIN_URL, EmojiSprites, ImageStore } from './overlay-paint/draw';
import { defaultTranslate, type Translate } from './overlay-paint/strings';
import { FONT_FAMILY, TextKit } from './overlay-paint/text';
import {
  createWidget,
  type Box,
  type PainterSubathon,
  type Shared,
  type StreamerLevelData,
  type SupporterRow,
  type Widget,
} from './overlay-paint/widgets';

export type { PainterSubathon, StreamerLevelData, SupporterRow } from './overlay-paint/widgets';
export type { Translate } from './overlay-paint/strings';

export interface OverlayPainter {
  /** Latest overlay config (widgets, controls, stats, subathon…). Null clears the picture. */
  setOverlay(overlay: PublicOverlay | CreatorOverlay | null): void;
  /**
   * A live-room event, exactly what LiveOverlayLayer publishes to its bus:
   * tips, confirmations, follows, subscriptions, gifted subs, shares, joins,
   * viewer counts, reactions and chat lines. Anything else is ignored.
   */
  publish(event: unknown): void;
  /** A fired stream rule: its alerts go to rule_alert widgets, its wheels to spin_wheel. */
  fireRule(fired: RuleFired): void;
  /** The stream's live poll, drawn read-only (voting is `!vote 2` in chat). */
  setPoll(poll: LivePoll | null): void;
  /** The stream's subathon, as useStreamSubathon keeps it. */
  setSubathon(subathon: PainterSubathon | null): void;
  /** The stream's hype train, as useStreamHype keeps it (null once it is off screen). */
  setHype(train: HypeTrain | null): void;
  /** The live audience's top tippers, for top_supporters. */
  setTopSupporters(rows: readonly SupporterRow[]): void;
  /** The creator's points board, for points_board. */
  setPointsBoard(rows: readonly PointsRow[]): void;
  /** The creator's streamer level, for streamer_level. Null hides it. */
  setStreamerLevel(level: StreamerLevelData | null): void;
  /** The audience figure until the room sends one. */
  setViewerCount(count: number): void;
  /** How strings are translated; null goes back to the default (i18next, else English). */
  setTranslator(translate: Translate | null): void;
  /**
   * Draw every enabled widget for a frame of this size, over whatever is on
   * the canvas already. `now` is performance.now() (or a rAF timestamp).
   */
  paint(ctx: CanvasRenderingContext2D, width: number, height: number, now: number): void;
  dispose(): void;
}

export interface OverlayPainterOptions {
  /** Monotonic clock for events, on the same timeline as paint's `now`. Default performance.now. */
  clock?: () => number;
  /** Wall clock, for timers counted against server times. Default Date.now. */
  wallClock?: () => number;
  translate?: Translate;
  /** Told when a widget throws while painting; the frame carries on without it. */
  onError?: (error: unknown, widget: OverlayWidget) => void;
}

const NO_STATS: OverlayStats = { totalTips: 0, followers: 0 };

/** The synthetic poll widget's id when the creator never placed one. */
const DEFAULT_POLL_ID = '\u0000poll';

/**
 * The widgets a frame draws, bottom to top: enabled, known, alerts dropped
 * while the creator has paused them. A poll the creator started is shown even
 * if they never placed the widget — they started it to be seen — at its
 * default spot, as the OBS page does.
 */
export function visibleWidgets(overlay: PublicOverlay | CreatorOverlay | null | undefined, hasPoll: boolean): OverlayWidget[] {
  if (!overlay) return [];
  const paused = !!overlay.controls?.alertsPaused;
  const placed = drawOrder(overlay.widgets.filter((w) => w.enabled && isKnownKind(w.kind) && !(paused && isAlertKind(w.kind))));
  if (hasPoll && !placed.some((w) => w.kind === 'poll')) placed.push({ ...newWidget('poll', placed), id: DEFAULT_POLL_ID });
  return placed;
}

/** A widget's pixel box on a canvas whose whole area is the picture, written into `out`. */
export function widgetBox(widget: OverlayWidget, width: number, height: number, out: Box): Box {
  const rect = rectFor(widget, isPortraitPicture(width, height));
  out.x = rect.x * width;
  out.y = rect.y * height;
  out.w = rect.w * width;
  out.h = rect.h * height;
  return out;
}

const EVENT_TYPES = new Set<string>([
  'tip',
  'tipConfirmed',
  'follow',
  'share',
  'join',
  'subscribe',
  'giftSub',
  'viewers',
  'reaction',
  'chat',
  'chatDeleted',
]);

interface Placed {
  widget: OverlayWidget;
  painter: Widget;
  box: Box;
}

export function createOverlayPainter(options: OverlayPainterOptions = {}): OverlayPainter {
  const clock = options.clock ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  const wallClock = options.wallClock ?? Date.now;
  const images = new ImageStore();
  const sh: Shared = {
    t: options.translate ?? defaultTranslate,
    lang: 0,
    text: new TextKit(),
    images,
    sprites: new EmojiSprites(FONT_FAMILY),
    ctx: null as unknown as CanvasRenderingContext2D,
    now: 0,
    wall: 0,
    unit: 1,
    hair: 1,
    stats: NO_STATS,
    viewers: 0,
    poll: null,
    subathon: null,
    hype: null,
    supporters: [],
    supportersVersion: 0,
    points: [],
    pointsVersion: 0,
    level: null,
  };

  let overlay: PublicOverlay | CreatorOverlay | null = null;
  let placed: Placed[] = [];
  let disposed = false;

  // Widths measured before Exo finished loading are the fallback font's.
  // Ask for the weights the widgets use, and re-measure once fonts land.
  const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
  const onFontsLoaded = () => {
    sh.text.flush();
    sh.sprites.clear();
  };
  if (fonts) {
    for (const weight of [500, 600, 700, 800]) void fonts.load(`${weight} 16px Exo`).catch(() => undefined);
    fonts.addEventListener?.('loadingdone', onFontsLoaded);
  }
  // Start the coin's download now, so the first gift has it.
  images.get(COIN_URL);

  /**
   * Keep each widget's painter across overlay updates while its id and kind
   * hold: a creator nudging the goal bar mid-alert must not cut the alert off.
   * A widget switched off loses its state, as an unmounted component does.
   */
  const reconcile = () => {
    const before = new Map(placed.map((p) => [p.widget.id, p]));
    placed = visibleWidgets(overlay, !!sh.poll).map((widget) => {
      const kept = before.get(widget.id);
      const settings = widget.settings || {};
      if (kept && kept.widget.kind === widget.kind) {
        kept.widget = widget;
        kept.painter.settings = settings;
        return kept;
      }
      return { widget, painter: createWidget(widget.kind as OverlayKind, sh, settings), box: { x: 0, y: 0, w: 0, h: 0 } };
    });
  };

  return {
    setOverlay(next) {
      if (disposed) return;
      overlay = next;
      sh.stats = next && 'stats' in next && next.stats ? next.stats : NO_STATS;
      reconcile();
    },

    publish(raw) {
      if (disposed || !raw || typeof raw !== 'object') return;
      const event = raw as LiveRoomEvent;
      if (typeof event.type !== 'string' || !EVENT_TYPES.has(event.type)) return;
      if (event.type === 'viewers') {
        if (Number.isFinite(event.count)) sh.viewers = event.count;
        return;
      }
      const now = clock();
      for (const p of placed) p.painter.onEvent?.(event, now);
    },

    fireRule(fired) {
      if (disposed || !fired) return;
      const now = clock();
      for (const p of placed) p.painter.onRule?.(fired, now);
    },

    setPoll(poll) {
      const had = !!sh.poll;
      sh.poll = poll;
      if (had !== !!poll) reconcile();
    },

    setSubathon(subathon) {
      sh.subathon = subathon;
    },

    setHype(train) {
      sh.hype = train;
    },

    setTopSupporters(rows) {
      sh.supporters = [...rows];
      sh.supportersVersion += 1;
    },

    setPointsBoard(rows) {
      sh.points = [...rows];
      sh.pointsVersion += 1;
    },

    setStreamerLevel(level) {
      sh.level = level;
    },

    setViewerCount(count) {
      if (Number.isFinite(count)) sh.viewers = count;
    },

    setTranslator(translate) {
      sh.t = translate ?? defaultTranslate;
      sh.lang += 1;
    },

    paint(ctx, width, height, now) {
      if (disposed || !placed.length || !(width > 0) || !(height > 0)) return;
      sh.ctx = ctx;
      sh.now = now;
      sh.wall = wallClock();
      // A CSS pixel, for the few sizes the CSS gives in pixels: 1 at 720p.
      sh.unit = Math.min(width, height) / 720;
      sh.hair = Math.max(1, sh.unit);

      ctx.save();
      for (const p of placed) {
        const box = widgetBox(p.widget, width, height, p.box);
        if (!(box.w > 0) || !(box.h > 0)) continue;
        ctx.save();
        // Each widget is clipped to its box, as `[data-overlay-widget]` is.
        ctx.beginPath();
        ctx.rect(box.x, box.y, box.w, box.h);
        ctx.clip();
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.globalAlpha = 1;
        sh.text.use(ctx);
        try {
          p.painter.paint(box);
        } catch (error) {
          // One widget with bad data must not take the whole overlay (or the broadcast's frame loop) down.
          options.onError?.(error, p.widget);
        }
        ctx.restore();
      }
      ctx.restore();
    },

    dispose() {
      disposed = true;
      fonts?.removeEventListener?.('loadingdone', onFontsLoaded);
      placed = [];
      overlay = null;
      images.dispose();
      sh.sprites.clear();
      sh.text.flush();
    },
  };
}
