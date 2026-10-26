/**
 * Every overlay widget kind, painted.
 *
 * One class per widget in overlay-widgets.tsx (and poll, subathon, hype-train,
 * level-and-jar), holding the same state the component holds — its alert
 * queue, the tips counted since the server's last figure, the chat lines on
 * screen — and drawing what the component renders, at the sizes
 * live-overlay.css gives it. Sizes are shares of the widget's box exactly as
 * the CSS writes them (`--ow-h` is `box.h` here), so a widget lands the same
 * in a 720p, 1080p or portrait picture.
 *
 * Strings a widget shows are built when what they say changes — an event, a
 * new second on a clock — never per frame: formatting a number and running it
 * through i18next is cheap once, not thirty times a second for every widget.
 */
import type { LiveRoomEvent, StreamJoinUser } from '@/lib/api/dehub/stream-presence';
import type { HypeTrain } from '@/lib/api/dehub/live-hype';
import type { PointsRow } from '@/lib/api/dehub/live-subathon';
import { tierFromGift } from '@/lib/live/gift-tiers';
import { isPollOpen, pollLeaders, pollShares, type LivePoll } from '@/lib/live-overlay/polls';
import { setting, type OverlayKind } from '@/lib/live-overlay/registry';
import { WHEEL_SPIN_MS, type RuleFired } from '@/lib/live-overlay/rules';
import type { OverlayStats } from '@/lib/live-overlay/types';
import {
  AlertQueue,
  Tween,
  alertPose,
  clamp01,
  cubicBezier,
  easeInOut,
  easeOut,
  keyframes,
  newPose,
  rowEnter,
  type Pose,
} from './motion';
import {
  MUTED,
  accentOf,
  avatarRings,
  drawAvatar,
  drawCoin,
  drawIcon,
  glassPanel,
  lippedDisc,
  makeCanvas,
  mixWithWhite,
  noShadow,
  roundRectPath,
  shadow,
  white,
  withAlpha,
  type EmojiSprites,
  type GlassDrop,
  type GlassOptions,
  type IconName,
  type ImageStore,
  type Raster,
} from './draw';
import { LINE_HEIGHT, ellipsize, fontOf, type TextKit } from './text';
import { MAX_CELEBRATIONS, celebrationLife, paintCelebration, type Celebration } from './celebration';
import type { Translate } from './strings';

type Ctx = CanvasRenderingContext2D;

// ─── What widgets share ──────────────────────────────────────────────────────

/** The stream's subathon as useStreamSubathon keeps it. `lastAdd.at` is wall-clock ms. */
export interface PainterSubathon {
  running: boolean;
  endsAt: string | null;
  lastAdd: { seconds: number; at: number } | null;
}

/** A row of the live audience's top tippers. */
export interface SupporterRow {
  address: string;
  displayName?: string;
  username?: string;
  total: number;
}

/** The parts of a streamer's progress the level widget shows. */
export interface StreamerLevelData {
  level: number;
  progressToNext: number;
  currentStreakWeeks: number;
}

/**
 * State the painter owns and every widget reads: the drawing kit, the clocks
 * for this frame, and the stream data the DOM widgets get from contexts and
 * queries.
 */
export interface Shared {
  t: Translate;
  /** Bumped when `t` changes, so cached strings know to rebuild. */
  lang: number;
  text: TextKit;
  images: ImageStore;
  sprites: EmojiSprites;
  ctx: Ctx;
  /** The painter's monotonic clock (performance.now) for this frame. */
  now: number;
  /** Wall-clock ms for this frame, for anything counted against a server time. */
  wall: number;
  /** A CSS pixel at this picture size: 1 at 720p, 1.5 at 1080p. */
  unit: number;
  /** A hairline border, never thinner than a device pixel. */
  hair: number;
  stats: OverlayStats;
  viewers: number;
  poll: LivePoll | null;
  subathon: PainterSubathon | null;
  hype: HypeTrain | null;
  supporters: SupporterRow[];
  supportersVersion: number;
  points: PointsRow[];
  pointsVersion: number;
  level: StreamerLevelData | null;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Widget {
  settings: Record<string, unknown>;
  onEvent?(event: LiveRoomEvent, now: number): void;
  onRule?(fired: RuleFired, now: number): void;
  paint(box: Box): void;
}

const nameOf = (sh: Shared, user: StreamJoinUser | undefined) => user?.displayName || user?.username || sh.t('liveOverlay.someone');

/** Text drawn at its line's middle: the painter sets `textBaseline = 'middle'` once per frame. */
const lineMid = (top: number, px: number) => top + (px * LINE_HEIGHT) / 2;

/** Scale and fade a box about its centre for an alert pose. Call inside a save/restore. */
function applyPose(ctx: Ctx, box: Box, pose: Pose) {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  ctx.globalAlpha = pose.alpha;
  ctx.translate(cx, cy + pose.dy * box.h);
  if (pose.scale !== 1) ctx.scale(pose.scale, pose.scale);
  ctx.translate(-cx, -cy);
}

/** The glass every panel wears, at this frame's pixel scale. */
function glassOf(sh: Shared, drop: GlassDrop = null, extra?: { edge?: boolean; sheen?: boolean }): GlassOptions {
  return { hair: sh.hair, unit: sh.unit, drop, edge: extra?.edge, sheen: extra?.sheen };
}

/**
 * A figure the server keeps plus what this widget has counted since the server
 * last sent it. A fresh figure already includes everything counted here, so it
 * starts the count again — the DOM widgets' `useEffect(() => setDelta(0), [base])`.
 */
class Counted {
  private delta = 0;

  constructor(private base: number) {}

  add(base: number, n: number): void {
    this.value(base);
    this.delta += n;
  }

  value(base: number): number {
    if (base !== this.base) {
      this.base = base;
      this.delta = 0;
    }
    return base + this.delta;
  }
}

// ─── The alert card (`[data-ow-alert] [data-ow-card]`) ───────────────────────

interface CardContent {
  user?: StreamJoinUser;
  /** An emoji instead of an avatar (tip banners). */
  emoji?: string;
  /** The small tracked label over the title, already upper-cased. */
  eyebrow?: string;
  title: string;
  message?: string;
  /** The big amount on the trailing side, the coin after it. */
  figure?: string;
}

/** Tracking as CSS writes it, in ems of the text's own size. */
const track = (px: number, em: number) => px * em;

/** A string as `text-transform: uppercase` shows it. */
const upper = (s: string) => s.toLocaleUpperCase();

/** Draw a tracked, upper-case label (eyebrows, list titles, goal titles) at its line's middle. */
function drawEyebrow(sh: Shared, label: string, x: number, mid: number, px: number, em: number, maxW: number, color = MUTED) {
  const { ctx, text } = sh;
  text.font(fontOf(700, px));
  ctx.fillStyle = color;
  text.drawTracked(text.fitTracked(label, maxW, track(px, em)), x, mid, track(px, em));
}

function paintCard(sh: Shared, box: Box, card: CardContent, pose: Pose) {
  const { ctx, text } = sh;
  const h = box.h;
  ctx.save();
  applyPose(ctx, box, pose);

  // The panel comes into focus as it arrives; its contents only fade.
  if (pose.blur > 0.05) ctx.filter = `blur(${(pose.blur * sh.unit).toFixed(1)}px)`;
  glassPanel(ctx, box.x, box.y, box.w, h, h * 0.26, glassOf(sh));
  if (pose.blur > 0.05) ctx.filter = 'none';

  // The accent edge: a sliver of light down the leading side, fading at both ends.
  const sliverW = h * 0.035;
  const sliverTop = box.y + h * 0.18;
  const sliverH = h * 0.64;
  const g = ctx.createLinearGradient(0, sliverTop, 0, sliverTop + sliverH);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.3, '#fff');
  g.addColorStop(0.7, '#fff');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  const alpha = ctx.globalAlpha;
  ctx.globalAlpha = alpha * 0.9;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(box.x + sh.hair, sliverTop);
  ctx.lineTo(box.x + sh.hair + sliverW - sliverW / 2, sliverTop);
  ctx.arc(box.x + sh.hair + sliverW / 2, sliverTop + sliverW / 2, sliverW / 2, -Math.PI / 2, 0);
  ctx.lineTo(box.x + sh.hair + sliverW, sliverTop + sliverH - sliverW / 2);
  ctx.arc(box.x + sh.hair + sliverW / 2, sliverTop + sliverH - sliverW / 2, sliverW / 2, 0, Math.PI / 2);
  ctx.lineTo(box.x + sh.hair, sliverTop + sliverH);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = alpha;

  const gap = h * 0.16;
  const right = box.x + box.w - h * 0.24;
  let x = box.x + h * 0.22;
  const mid = box.y + h / 2;
  if (card.emoji) {
    const px = h * 0.46;
    text.font(fontOf(400, px));
    const w = Math.max(px, text.width(card.emoji));
    shadow(ctx, 'rgba(0,0,0,0.45)', h * 0.06, h * 0.03);
    sh.sprites.draw(ctx, card.emoji, x + w / 2, mid, px);
    noShadow(ctx);
    x += w + gap;
  } else {
    const size = h * 0.6;
    avatarRings(ctx, x + size / 2, mid, size, h * 0.024, 'rgba(255,255,255,0.92)', h * 0.07);
    drawAvatar(ctx, sh.images, card.user, x, mid - size / 2, size);
    x += size + gap;
  }

  // The figure takes what it needs on the trailing side; the lines get the rest.
  let linesRight = right;
  if (card.figure) {
    const px = h * 0.3;
    text.font(fontOf(800, px));
    const coin = px * 0.25 + px * 1.15;
    const figW = Math.min(text.tabularWidth(card.figure) + coin, Math.max(0, right - x));
    const fx = right - figW;
    ctx.fillStyle = '#fff';
    const drawn = text.drawTabular(card.figure, fx, mid);
    drawCoin(ctx, sh.images, fx + drawn + px * 0.25, mid, px);
    linesRight = fx - gap;
  }

  const maxW = linesRight - x;
  if (maxW > 0) {
    const eyePx = h * 0.15;
    const titlePx = h * 0.29;
    const msgPx = h * 0.17;
    text.font(fontOf(500, msgPx));
    const message = card.message ? text.wrap(card.message, maxW, 2) : NONE;
    const blockH =
      (card.eyebrow ? eyePx * LINE_HEIGHT + h * 0.03 : 0) +
      titlePx * LINE_HEIGHT +
      (message.length ? h * 0.05 + message.length * msgPx * LINE_HEIGHT : 0);
    let top = box.y + (h - blockH) / 2;

    if (card.eyebrow) {
      drawEyebrow(sh, card.eyebrow, x, lineMid(top, eyePx), eyePx, 0.16, maxW);
      top += eyePx * LINE_HEIGHT + h * 0.03;
    }
    text.font(fontOf(800, titlePx));
    ctx.fillStyle = '#fff';
    ctx.fillText(text.fit(card.title, maxW), x, lineMid(top, titlePx));
    top += titlePx * LINE_HEIGHT;

    if (message.length) {
      top += h * 0.05;
      text.font(fontOf(500, msgPx));
      ctx.fillStyle = white(0.86);
      for (const line of message) {
        ctx.fillText(line, x, lineMid(top, msgPx));
        top += msgPx * LINE_HEIGHT;
      }
    }
  }
  ctx.restore();
  text.use(ctx);
}
const NONE: string[] = [];

// ─── Tip alert ───────────────────────────────────────────────────────────────

interface TipItem {
  amount: number;
  selectedTier?: string;
  user: StreamJoinUser;
  message?: string;
}

/** An unconfirmed tip waits this long for its payment when only paid tips are shown, then is dropped. */
const CONFIRM_WAIT_MS = 120_000;

class TipAlert implements Widget {
  private banner = new AlertQueue<CardContent & { durationMs: number }>((item) => item.durationMs);
  private celebrations: Celebration[] = [];
  private held = new Map<string, { item: TipItem; at: number }>();
  private seq = 0;
  private pose = newPose();

  constructor(
    private sh: Shared,
    public settings: Record<string, unknown>,
  ) {}

  onEvent(event: LiveRoomEvent, now: number) {
    const confirmedOnly = setting(this.settings, 'confirmedOnly', false);
    if (event.type === 'tip') {
      const item = { amount: event.amount, selectedTier: event.selectedTier, user: event.user, message: event.message };
      if (!confirmedOnly) return this.play(item, now);
      if (!event.transactionHash) return;
      const wall = Date.now();
      for (const [hash, entry] of this.held) if (wall - entry.at > CONFIRM_WAIT_MS) this.held.delete(hash);
      this.held.set(event.transactionHash, { item, at: wall });
    } else if (event.type === 'tipConfirmed' && confirmedOnly) {
      const entry = this.held.get(event.transactionHash);
      if (!entry) return;
      this.held.delete(event.transactionHash);
      // The paid amount, not the claim, and the tier that amount actually buys.
      this.play({ ...entry.item, amount: event.paidAmount, selectedTier: undefined }, now);
    }
  }

  private play(item: TipItem, now: number) {
    if (item.amount < setting(this.settings, 'minAmount', 0)) return;
    const message = setting(this.settings, 'showMessage', true) ? item.message : undefined;
    const tier = tierFromGift(item);
    const label = this.sh.t(tier.labelKey, { defaultValue: tier.name });
    const name = nameOf(this.sh, item.user);
    if (setting(this.settings, 'style', 'celebration') === 'banner') {
      this.banner.push(
        { emoji: tier.emoji, eyebrow: upper(label), title: name, message, figure: item.amount.toLocaleString(), durationMs: tier.durationMs },
        now,
      );
      return;
    }
    const amount = Number(item.amount) || 0;
    if (amount <= 0) return;
    this.seq += 1;
    const username = item.user.displayName || item.user.username;
    this.celebrations.push({
      id: this.seq,
      tier,
      amount,
      title: `${tier.emoji} ${label}`,
      sub: `${username ? `${username} · ` : ''}${amount.toLocaleString()}`,
      message,
      start: now,
      end: now + celebrationLife(tier),
    });
    // The newest plays on top; past two, the oldest goes.
    while (this.celebrations.length > MAX_CELEBRATIONS) this.celebrations.shift();
  }

  paint(box: Box) {
    const { sh } = this;
    if (this.celebrations.length) {
      this.celebrations = this.celebrations.filter((c) => c.end > sh.now);
      for (const c of this.celebrations) {
        // The DOM's caption is fixed-size type in a stage up to 340px wide; it keeps that share of the box here.
        const unit = Math.min(sh.unit * 2, Math.max(sh.unit, box.w / 340));
        paintCelebration(sh.ctx, c, box.x, box.y, box.w, box.h, sh.now, unit, sh.sprites, sh.images, sh.text);
      }
    }
    const slot = this.banner.at(sh.now);
    if (slot) paintCard(sh, box, slot.item, alertPose(slot, sh.now, this.pose));
  }
}

// ─── Follow, subscribe, share, join ──────────────────────────────────────────

const PERSON_EVENT: Partial<Record<OverlayKind, LiveRoomEvent['type']>> = {
  follow_alert: 'follow',
  subscribe_alert: 'subscribe',
  share_alert: 'share',
  join_alert: 'join',
};

class PersonAlert implements Widget {
  private queue = new AlertQueue<CardContent>(() => setting(this.settings, 'durationMs', 5000));
  /** The gateway re-sends a viewer's join on every reconnect. Each person arrives once. */
  private seen = new Set<string>();
  private pose = newPose();

  constructor(
    private sh: Shared,
    private kind: OverlayKind,
    public settings: Record<string, unknown>,
  ) {}

  onEvent(event: LiveRoomEvent, now: number) {
    const { t } = this.sh;
    const wanted = PERSON_EVENT[this.kind];
    // Gifted subscriptions are a subscriber alert: one card for the whole checkout.
    if (event.type === 'giftSub' && wanted === 'subscribe') {
      const eyebrow = upper(t('liveOverlay.eyebrow.gifted', { count: event.count }));
      this.queue.push({ user: event.user, eyebrow, title: nameOf(this.sh, event.user) }, now);
      return;
    }
    if (event.type !== wanted || !('user' in event) || !event.user) return;
    if (event.type === 'join') {
      const key = event.user.address;
      if (!key || this.seen.has(key)) return;
      this.seen.add(key);
    }
    // A small label over the name: the name is what the room reads first.
    const eyebrow =
      event.type === 'follow'
        ? t('liveOverlay.eyebrow.follow')
        : event.type === 'subscribe'
          ? event.planName
            ? t('liveOverlay.eyebrow.subscribedTo', { plan: event.planName })
            : t('liveOverlay.eyebrow.subscribe')
          : event.type === 'share'
            ? t('liveOverlay.eyebrow.share')
            : t('liveOverlay.eyebrow.join');
    this.queue.push({ user: event.user, eyebrow: upper(eyebrow), title: nameOf(this.sh, event.user) }, now);
  }

  paint(box: Box) {
    const slot = this.queue.at(this.sh.now);
    if (slot) paintCard(this.sh, box, slot.item, alertPose(slot, this.sh.now, this.pose));
  }
}

// ─── Rule alert ──────────────────────────────────────────────────────────────

class RuleAlert implements Widget {
  private queue = new AlertQueue<CardContent & { durationMs: number }>((item) => item.durationMs);
  /** Alerts naming where a wheel stopped wait until it has stopped. */
  private delayed: Array<{ at: number; fired: RuleFired }> = [];
  private pose = newPose();

  constructor(
    private sh: Shared,
    public settings: Record<string, unknown>,
  ) {}

  onRule(fired: RuleFired, now: number) {
    if (fired.wheels.length) this.delayed.push({ at: now + WHEEL_SPIN_MS, fired });
    else this.show(fired, now);
  }

  private show(fired: RuleFired, at: number) {
    for (const alert of fired.alerts) this.queue.push({ user: fired.user, title: alert.text, durationMs: alert.durationMs }, at);
  }

  paint(box: Box) {
    const { now } = this.sh;
    while (this.delayed.length && this.delayed[0].at <= now) {
      const next = this.delayed.shift()!;
      this.show(next.fired, next.at);
    }
    const slot = this.queue.at(now);
    if (slot) paintCard(this.sh, box, slot.item, alertPose(slot, now, this.pose));
  }
}

// ─── Spin wheel ──────────────────────────────────────────────────────────────

const WHEEL_COLORS = ['#f43f5e', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#14b8a6', '#ec4899', '#eab308', '#6366f1', '#10b981', '#ef4444', '#0ea5e9'];
/** How long the result stays up after the wheel lands. */
const WHEEL_HOLD_MS = 4000;
const WHEEL_EASE = cubicBezier(0.12, 0.8, 0.12, 1);
const WHEEL_ENTER_MS = 300;

interface SpinItem {
  segments: string[];
  result: number;
  user: StreamJoinUser;
  /** "name spun: result", built when the wheel was queued. */
  line: string;
}

/**
 * The disc with its slices and labels, drawn once per wheel into a sprite and
 * then only turned each frame. `ctx` is the sprite's (or the frame's, where no
 * scratch canvas exists).
 */
function drawDisc(ctx: Ctx | OffscreenCanvasRenderingContext2D, segments: string[], cx: number, cy: number, d: number) {
  const n = segments.length;
  const r = d / 2;
  const slice = (Math.PI * 2) / n;
  for (let i = 0; i < n; i++) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    // Slice 0 starts at twelve o'clock, as `conic-gradient` does.
    ctx.arc(cx, cy, r, -Math.PI / 2 + i * slice, -Math.PI / 2 + (i + 1) * slice);
    ctx.closePath();
    ctx.fillStyle = WHEEL_COLORS[i % WHEEL_COLORS.length];
    ctx.fill();
  }
  const border = d * 0.015;
  ctx.beginPath();
  ctx.arc(cx, cy, r - border / 2, 0, Math.PI * 2);
  ctx.lineWidth = border;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.stroke();

  // Each label on its slice's centre line, reading from the rim toward the hub.
  const px = d * 0.055;
  ctx.font = fontOf(700, px);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = px * 0.3;
  const measure = (s: string) => ctx.measureText(s).width;
  for (let i = 0; i < n; i++) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((i + 0.5) * slice);
    ctx.translate(0, -r + border + d * 0.06);
    ctx.rotate(Math.PI / 2);
    ctx.fillText(ellipsize(segments[i], d * 0.34, measure), 0, 0);
    ctx.restore();
  }
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
}

class SpinWheel implements Widget {
  private queue = new AlertQueue<SpinItem>(() => WHEEL_SPIN_MS + WHEEL_HOLD_MS);
  private pose = newPose();
  private sprite: { id: number; d: number; raster: Raster | null } | null = null;

  constructor(
    private sh: Shared,
    public settings: Record<string, unknown>,
  ) {}

  onRule(fired: RuleFired, now: number) {
    const name = nameOf(this.sh, fired.user);
    for (const wheel of fired.wheels) {
      const line = this.sh.t('liveOverlay.wheelLanded', { name, result: wheel.segments[wheel.result] });
      this.queue.push({ ...wheel, user: fired.user, line }, now);
    }
  }

  paint(box: Box) {
    const { sh } = this;
    const { ctx, text } = sh;
    const slot = this.queue.at(sh.now);
    if (!slot) {
      this.sprite = null;
      return;
    }
    const item = slot.item;
    const d = Math.min(box.w, box.h * 0.82);
    if (d <= 0) return;
    const resultPx = d * 0.06;
    const pillH = resultPx * LINE_HEIGHT + d * 0.04;
    const stackH = d + d * 0.04 + pillH;
    const top = box.y + (box.h - stackH) / 2;
    const cx = box.x + box.w / 2;
    const cy = top + d / 2;

    ctx.save();
    applyPose(ctx, box, alertPose(slot, sh.now, this.pose, WHEEL_ENTER_MS, easeOut));

    // Five full turns, then the chosen slice's middle under the pointer at the top.
    const n = item.segments.length;
    const target = 360 * 5 + (360 - (item.result + 0.5) * (360 / n));
    const angle = target * WHEEL_EASE(clamp01((sh.now - slot.start) / WHEEL_SPIN_MS));

    if (!this.sprite || this.sprite.id !== slot.id || Math.abs(this.sprite.d - d) > 2) {
      const pad = Math.ceil(d * 0.1);
      const scratch = makeCanvas(d + pad * 2, d + pad * 2);
      if (scratch) {
        const s = scratch.ctx;
        s.shadowColor = 'rgba(0,0,0,0.45)';
        s.shadowBlur = d * 0.06;
        s.beginPath();
        s.arc(pad + d / 2, pad + d / 2, d / 2, 0, Math.PI * 2);
        s.fillStyle = '#000';
        s.fill();
        s.shadowColor = 'transparent';
        s.shadowBlur = 0;
        drawDisc(s, item.segments, pad + d / 2, pad + d / 2, d);
      }
      this.sprite = { id: slot.id, d, raster: scratch?.canvas ?? null };
    }
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((angle * Math.PI) / 180);
    if (this.sprite.raster) {
      const side = this.sprite.raster.width * (d / this.sprite.d);
      ctx.drawImage(this.sprite.raster, -side / 2, -side / 2, side, side);
    } else {
      drawDisc(ctx, item.segments, 0, 0, d);
      text.use(ctx);
    }
    ctx.restore();

    // The pointer, over the disc at twelve o'clock.
    shadow(ctx, 'rgba(0,0,0,0.5)', 4 * sh.unit, 2 * sh.unit);
    ctx.beginPath();
    ctx.moveTo(cx - d * 0.05, top - d * 0.02);
    ctx.lineTo(cx + d * 0.05, top - d * 0.02);
    ctx.lineTo(cx, top - d * 0.02 + d * 0.09);
    ctx.closePath();
    ctx.fillStyle = '#fff';
    ctx.fill();
    noShadow(ctx);

    // The result, once it has landed.
    const landedFor = sh.now - slot.start - WHEEL_SPIN_MS;
    if (landedFor > 0) {
      const e = easeOut(clamp01(landedFor / 250));
      text.font(fontOf(700, resultPx));
      const padX = d * 0.05;
      const line = text.fit(item.line, box.w - padX * 2);
      const pillW = Math.min(box.w, text.width(line) + padX * 2);
      const pillTop = top + d + d * 0.04 + 4 * sh.unit * (1 - e);
      ctx.globalAlpha *= e;
      glassPanel(ctx, cx - pillW / 2, pillTop, pillW, pillH, pillH / 2, glassOf(sh, 'panel'));
      ctx.fillStyle = '#fff';
      ctx.fillText(line, cx - pillW / 2 + padX, pillTop + pillH / 2);
    }
    ctx.restore();
  }
}

// ─── Goal-bar look: goal bar, streamer level, hype train ─────────────────────

const GOAL_FILL_EASE = cubicBezier(0.2, 0.8, 0.2, 1);

/** `ow-sheen`: a band of light crossing the bar every 3.6s, resting for the first 30%. */
const SHEEN_MS = 3600;
const sheenEase = cubicBezier(0.42, 0, 0.58, 1);

/**
 * The goal bar's look, shared by the streamer level and the hype train: a
 * tracked upper-case title on the left, the bold figure on the right, and an
 * inset track whose fill runs from a faint to the full accent under a glossy
 * top, with a sheen passing along it.
 */
function paintGoal(sh: Shared, box: Box, left: string, right: string, rightCoin: boolean, progress: number, accent: string) {
  const { ctx, text } = sh;
  const h = box.h;
  glassPanel(ctx, box.x, box.y, box.w, h, h * 0.26, glassOf(sh));
  const pad = h * 0.24;
  const innerW = box.w - pad * 2;
  if (innerW <= 0) return;
  const big = h * 0.22;
  const small = h * 0.15;
  const trackH = h * 0.18;
  const headH = big * LINE_HEIGHT;
  const top = box.y + (h - (headH + h * 0.11 + trackH)) / 2;
  // Baseline-aligned: the small title sits on the figure's baseline.
  const bigMid = lineMid(top, big);
  const baseline = bigMid + big * 0.3;

  text.font(fontOf(800, big));
  const coinW = rightCoin ? big * 0.25 + big * 1.15 : 0;
  const rightText = text.fit(right, innerW - coinW);
  const textW = text.tabularWidth(rightText);
  const rightW = textW + coinW;
  const rx = box.x + box.w - pad - rightW;
  ctx.fillStyle = '#fff';
  text.drawTabular(rightText, rx, bigMid);
  if (rightCoin) drawCoin(ctx, sh.images, rx + textW + big * 0.25, bigMid, big);

  if (left) drawEyebrow(sh, left, box.x + pad, baseline - small * 0.3, small, 0.14, innerW - rightW - h * 0.15);

  const tx = box.x + pad;
  const ty = top + headH + h * 0.11;
  const tr = trackH / 2;
  ctx.save();
  roundRectPath(ctx, tx, ty, innerW, trackH, tr);
  ctx.fillStyle = white(0.07);
  ctx.fill();
  ctx.clip();
  // inset 0 1px 2px black/55: cast into the track from everything around it.
  shadow(ctx, 'rgba(0,0,0,0.55)', 2 * sh.unit, sh.unit);
  roundRectPath(ctx, tx, ty, innerW, trackH, tr);
  ctx.rect(tx - 20, ty - 20, innerW + 40, trackH + 40);
  ctx.fillStyle = '#000';
  ctx.fill('evenodd');
  noShadow(ctx);

  const fillW = innerW * clamp01(progress);
  if (fillW > 0.5) {
    const fill = ctx.createLinearGradient(tx, 0, tx + fillW, 0);
    fill.addColorStop(0, withAlpha(accent, 0.45));
    fill.addColorStop(1, accent);
    roundRectPath(ctx, tx, ty, fillW, trackH, Math.min(tr, fillW / 2));
    ctx.fillStyle = fill;
    ctx.fill();
    const gloss = ctx.createLinearGradient(0, ty, 0, ty + trackH);
    gloss.addColorStop(0, 'rgba(255,255,255,0.35)');
    gloss.addColorStop(0.55, 'rgba(255,255,255,0)');
    ctx.fillStyle = gloss;
    ctx.fill();
  }

  const phase = (sh.now % SHEEN_MS) / SHEEN_MS;
  if (phase > 0.3) {
    const offset = (-1 + 2 * sheenEase((phase - 0.3) / 0.7)) * innerW;
    const sx = tx + offset;
    const sheen = ctx.createLinearGradient(sx, 0, sx + innerW, 0);
    sheen.addColorStop(0.3, 'rgba(255,255,255,0)');
    sheen.addColorStop(0.5, 'rgba(255,255,255,0.28)');
    sheen.addColorStop(0.7, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(sx, ty, innerW, trackH);
  }
  ctx.restore();
}

class GoalBar implements Widget {
  private count: Counted;
  private fill = new Tween(700, GOAL_FILL_EASE);
  private key = '';
  private left = '';
  private right = '';

  constructor(
    private sh: Shared,
    public settings: Record<string, unknown>,
  ) {
    this.count = new Counted(this.base);
  }

  private get metric() {
    return setting(this.settings, 'metric', 'tips') === 'followers' ? 'followers' : 'tips';
  }

  private get base() {
    return Number(this.metric === 'tips' ? this.sh.stats.totalTips : this.sh.stats.followers) || 0;
  }

  onEvent(event: LiveRoomEvent) {
    if (this.metric === 'tips' && event.type === 'tipConfirmed') this.count.add(this.base, event.paidAmount);
    if (this.metric === 'followers' && event.type === 'follow') this.count.add(this.base, 1);
  }

  paint(box: Box) {
    const { sh } = this;
    const metric = this.metric;
    const target = Math.max(1, setting(this.settings, 'target', metric === 'tips' ? 1_000_000 : 1000));
    const value = this.count.value(this.base);
    const reached = value >= target;
    const title = setting(this.settings, 'title', '');
    const key = `${sh.lang}|${Math.floor(value)}|${target}|${metric}|${title}`;
    if (key !== this.key) {
      this.key = key;
      this.left = upper(reached ? sh.t('liveOverlay.goalReached') : title);
      this.right = `${Math.floor(value).toLocaleString()} / ${target.toLocaleString()}${metric === 'tips' ? '' : ` ${sh.t('liveOverlay.followersUnit')}`}`;
    }
    this.fill.set(Math.min(1, value / target), sh.now);
    paintGoal(sh, box, this.left, this.right, metric === 'tips', this.fill.get(sh.now), accentOf(this.settings));
  }
}

class StreamerLevel implements Widget {
  private fill = new Tween(700, GOAL_FILL_EASE);
  private key = '';
  private left = '';
  private right = '';

  constructor(
    private sh: Shared,
    public settings: Record<string, unknown>,
  ) {}

  paint(box: Box) {
    const { sh } = this;
    const data = sh.level;
    if (!data) return;
    const streak = setting(this.settings, 'showStreak', true) && data.currentStreakWeeks > 0 ? data.currentStreakWeeks : 0;
    const key = `${sh.lang}|${data.level}|${streak}`;
    if (key !== this.key) {
      this.key = key;
      this.left = upper(sh.t('liveOverlay.level', { level: data.level }));
      this.right = streak ? sh.t('liveOverlay.streak', { count: streak }) : '';
    }
    this.fill.set(clamp01(Number(data.progressToNext) || 0), sh.now);
    paintGoal(sh, box, this.left, this.right, false, this.fill.get(sh.now), accentOf(this.settings));
  }
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

class HypeTrainWidget implements Widget {
  private fill = new Tween(700, GOAL_FILL_EASE);
  private key = '';
  private left = '';
  private right = '';

  constructor(
    private sh: Shared,
    public settings: Record<string, unknown>,
  ) {}

  paint(box: Box) {
    const { sh } = this;
    const train = sh.hype;
    if (!train) return;
    const left = train.ended ? 0 : Math.max(0, Math.ceil((Date.parse(train.expiresAt) - sh.wall) / 1000) || 0);
    const key = `${sh.lang}|${train.level}|${train.ended}|${train.completed}|${train.contributors}|${left}`;
    if (key !== this.key) {
      this.key = key;
      const t = sh.t;
      this.left = `🚂 ${upper(
        train.ended
          ? train.completed > 0
            ? t('liveHype.train.endedLevel', { level: train.completed })
            : t('liveHype.train.ended')
          : t('liveHype.train.level', { level: train.level }),
      )}`;
      this.right = train.ended ? t('liveHype.train.thanks', { count: train.contributors }) : mmss(left);
    }
    this.fill.set(train.ended ? 1 : Math.min(1, train.into / Math.max(1, train.need)), sh.now);
    paintGoal(sh, box, this.left, this.right, false, this.fill.get(sh.now), accentOf(this.settings, '#f97316'));
  }
}

// ─── Lists: top supporters, points board, event feed ─────────────────────────

interface ListRow {
  rank: string;
  /** 1–3 wear a medal; 0 for the plain disc. */
  place: number;
  name: string;
  amount: string;
  coin: boolean;
  /** When it arrived, for the slide-in; 0 for rows that never animate. */
  addedAt: number;
}

/** Brushed gold, silver and bronze (`[data-ow-rank][data-place]`): gradient stops and the numeral's colour. */
const MEDALS: Array<{ stops: [string, string, string]; ink: string }> = [
  { stops: ['#fff1b8', '#f2c94c', '#b8860b'], ink: '#3b2a05' },
  { stops: ['#ffffff', '#d6dae0', '#8e959e'], ink: '#1f2329' },
  { stops: ['#ffd9b8', '#e0975a', '#9a5427'], ink: '#3a1d0b' },
];

/** `linear-gradient(145deg, ...)` across a disc of diameter `d` centred on (cx, cy). */
function medalGradient(ctx: Ctx, cx: number, cy: number, d: number, stops: [string, string, string]): CanvasGradient {
  const a = (145 * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const half = (d * (Math.abs(dx) + Math.abs(dy))) / 2;
  const g = ctx.createLinearGradient(cx - dx * half, cy - dy * half, cx + dx * half, cy + dy * half);
  g.addColorStop(0, stops[0]);
  g.addColorStop(0.45, stops[1]);
  g.addColorStop(1, stops[2]);
  return g;
}

/** `title` upper-cased, remembered so a frame does not re-case an unchanged title. */
class Upper {
  private from = '';
  private to = '';

  of(value: string): string {
    if (value !== this.from) {
      this.from = value;
      this.to = upper(value);
    }
    return this.to;
  }
}

function paintList(sh: Shared, box: Box, title: string, rows: readonly ListRow[], divisor: number, pose: Pose) {
  const { ctx, text } = sh;
  const row = box.h / divisor;
  glassPanel(ctx, box.x, box.y, box.w, box.h, row * 0.42, glassOf(sh));
  const padX = row * 0.45;
  const innerW = box.w - padX * 2;
  if (innerW <= 0) return;
  const left = box.x + padX;
  let top = box.y + row * 0.32;
  if (title) {
    const px = row * 0.3;
    drawEyebrow(sh, title, left, lineMid(top, px), px, 0.16, innerW);
    top += px * LINE_HEIGHT + row * 0.12;
  }
  const px = row * 0.4;
  const gap = row * 0.3;
  const rankPx = px * 0.72;
  const disc = rankPx * 1.45;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (top > box.y + box.h) break;
    let dy = 0;
    if (r.addedAt) {
      rowEnter(r.addedAt, sh.now, pose);
      ctx.globalAlpha = pose.alpha;
      dy = pose.dy * row;
    }
    // Hairlines between rows, never above the first.
    if (i > 0) {
      ctx.fillStyle = white(0.06);
      ctx.fillRect(left, top + dy, innerW, sh.hair);
    }
    const mid = top + row / 2 + dy;
    let x = left;
    let right = box.x + box.w - padX;
    if (r.rank) {
      const medal = MEDALS[r.place - 1];
      const cx = x + disc / 2;
      if (medal) lippedDisc(ctx, cx, mid, disc, medalGradient(ctx, cx, mid, disc, medal.stops), '', sh.hair);
      else lippedDisc(ctx, cx, mid, disc, white(0.09), white(0.12), sh.hair);
      text.font(fontOf(800, rankPx));
      ctx.fillStyle = medal ? medal.ink : white(0.85);
      ctx.textAlign = 'center';
      ctx.fillText(r.rank, cx, mid);
      ctx.textAlign = 'left';
      x += disc + gap;
    }
    if (r.amount) {
      text.font(fontOf(800, px));
      const coinW = r.coin ? px * 0.25 + px * 1.15 : 0;
      const textW = text.tabularWidth(r.amount);
      const amountW = textW + coinW;
      ctx.fillStyle = '#fff';
      text.drawTabular(r.amount, right - amountW, mid);
      if (r.coin) drawCoin(ctx, sh.images, right - coinW + px * 0.25, mid, px);
      right -= amountW + gap;
    }
    text.font(fontOf(600, px));
    ctx.fillStyle = '#fff';
    ctx.fillText(text.fit(r.name, right - x), x, mid);
    ctx.globalAlpha = 1;
    top += row;
  }
}

class TopSupporters implements Widget {
  private rows: ListRow[] = [];
  private title = new Upper();
  private key = '';
  private pose = newPose();

  constructor(
    private sh: Shared,
    public settings: Record<string, unknown>,
  ) {}

  paint(box: Box) {
    const { sh } = this;
    const count = Math.min(10, Math.max(1, setting(this.settings, 'count', 3)));
    const key = `${sh.lang}|${sh.supportersVersion}|${count}`;
    if (key !== this.key) {
      this.key = key;
      this.rows = sh.supporters.slice(0, count).map((s, i) => ({
        rank: String(i + 1),
        place: i + 1,
        name: s.displayName || s.username || sh.t('liveOverlay.someone'),
        amount: Math.floor(Number(s.total) || 0).toLocaleString(),
        coin: true,
        addedAt: 0,
      }));
    }
    const title = this.title.of(setting(this.settings, 'title', '') || sh.t('liveOverlay.topSupporters'));
    paintList(sh, box, title, this.rows, count + 1, this.pose);
  }
}

class PointsBoard implements Widget {
  private rows: ListRow[] = [];
  private title = new Upper();
  private key = '';
  private pose = newPose();

  constructor(
    private sh: Shared,
    public settings: Record<string, unknown>,
  ) {}

  paint(box: Box) {
    const { sh } = this;
    const count = Math.min(10, Math.max(1, setting(this.settings, 'count', 5)));
    const key = `${sh.lang}|${sh.pointsVersion}|${count}`;
    if (key !== this.key) {
      this.key = key;
      this.rows = sh.points.slice(0, count).map((r, i) => ({
        rank: String(i + 1),
        place: i + 1,
        name: r.displayName || r.username || `${r.address.slice(0, 6)}…`,
        amount: sh.t('liveOverlay.points', { count: r.points, formatted: r.points.toLocaleString() }),
        coin: false,
        addedAt: 0,
      }));
    }
    if (!this.rows.length) return;
    const title = this.title.of(setting(this.settings, 'title', '') || sh.t('liveOverlay.pointsTitle'));
    paintList(sh, box, title, this.rows, count + 1, this.pose);
  }
}

class EventFeed implements Widget {
  private rows: ListRow[] = [];
  private title = new Upper();
  /** Tips are listed once PAID; the claim that came first is the fallback for the sender's name. */
  private tippers = new Map<string, StreamJoinUser>();
  private pose = newPose();

  constructor(
    private sh: Shared,
    public settings: Record<string, unknown>,
  ) {}

  private get count() {
    return Math.min(8, Math.max(1, setting(this.settings, 'count', 4)));
  }

  onEvent(event: LiveRoomEvent, now: number) {
    const { t } = this.sh;
    let name = '';
    let amount = '';
    if (event.type === 'tip' && event.transactionHash) {
      this.tippers.set(event.transactionHash, event.user);
      if (this.tippers.size > 50) this.tippers.delete(this.tippers.keys().next().value as string);
      return;
    } else if (event.type === 'tipConfirmed') {
      const user = event.user ?? this.tippers.get(event.transactionHash) ?? { address: event.address };
      name = t('liveOverlay.tipped', { name: nameOf(this.sh, user) });
      amount = Math.floor(event.paidAmount).toLocaleString();
    } else if (event.type === 'follow') {
      name = t('liveOverlay.newFollower', { name: nameOf(this.sh, event.user) });
    } else if (event.type === 'share') {
      name = t('liveOverlay.shared', { name: nameOf(this.sh, event.user) });
    } else if (event.type === 'subscribe') {
      const who = nameOf(this.sh, event.user);
      name = event.planName ? t('liveOverlay.subscribedTo', { name: who, plan: event.planName }) : t('liveOverlay.newSubscriber', { name: who });
    } else if (event.type === 'giftSub') {
      name = t('liveOverlay.giftedSubs', { name: nameOf(this.sh, event.user), count: event.count });
    } else {
      return;
    }
    this.rows = [{ rank: '', place: 0, name, amount, coin: !!amount, addedAt: now }, ...this.rows].slice(0, this.count);
  }

  paint(box: Box) {
    const title = this.title.of(setting(this.settings, 'title', ''));
    const count = this.count;
    if (this.rows.length > count) this.rows = this.rows.slice(0, count);
    paintList(this.sh, box, title, this.rows, count + (title ? 1 : 0), this.pose);
  }
}

// ─── Counters: viewers, stream timer, reactions ──────────────────────────────

/** `ow-live`: the audience dot breathes between full and 45% every 1.6s. */
const LIVE_MS = 1600;
const LIVE_AT = [0, 0.5, 1];
const LIVE_OP = [1, 0.45, 1];

/**
 * A counter pill: the icon in its own small disc, an optional tracked label,
 * the figure in tabular digits — and, on the audience count, a live dot.
 */
function paintCounter(sh: Shared, box: Box, icon: IconName, iconColor: string, label: string, value: string, live = false) {
  const { ctx, text } = sh;
  const h = box.h;
  const px = h * 0.4;
  const padL = live ? h * 0.2 : h * 0.12;
  const padR = h * 0.3;
  const gap = h * 0.16;
  const iconPx = px * 0.8;
  const well = px * 1.36;
  const dot = px * 0.34;
  const labelPx = px * 0.62;
  const labelTrack = track(labelPx, 0.14);
  text.font(fontOf(700, labelPx));
  const labelW = label ? text.trackedWidth(label, labelTrack) : 0;
  text.font(fontOf(800, px));
  const valueW = text.tabularWidth(value);
  const width = Math.min(box.w, padL + (live ? dot + gap : 0) + well + gap + (label ? labelW + gap : 0) + valueW + padR);
  glassPanel(ctx, box.x, box.y, width, h, h / 2, glassOf(sh, 'panel'));
  const mid = box.y + h / 2;
  let x = box.x + padL;

  if (live) {
    const r = dot / 2;
    const alpha = ctx.globalAlpha;
    ctx.globalAlpha = alpha * keyframes((sh.now % LIVE_MS) / LIVE_MS, LIVE_AT, LIVE_OP, easeInOut);
    // A soft ring and a red glow, then the dot itself.
    ctx.beginPath();
    ctx.arc(x + r, mid, r + px * 0.06, 0, Math.PI * 2);
    ctx.lineWidth = px * 0.12;
    ctx.strokeStyle = 'rgba(255,59,78,0.25)';
    ctx.stroke();
    shadow(ctx, 'rgba(255,59,78,0.8)', px * 0.5);
    ctx.beginPath();
    ctx.arc(x + r, mid, r, 0, Math.PI * 2);
    ctx.fillStyle = '#ff3b4e';
    ctx.fill();
    noShadow(ctx);
    ctx.globalAlpha = alpha;
    x += dot + gap;
  }

  lippedDisc(ctx, x + well / 2, mid, well, white(0.1), white(0.14), sh.hair);
  drawIcon(ctx, icon, x + (well - iconPx) / 2, mid - iconPx / 2, iconPx, iconColor);
  x += well + gap;
  if (label) {
    text.font(fontOf(700, labelPx));
    ctx.fillStyle = MUTED;
    text.drawTracked(label, x, mid, labelTrack);
    x += labelW + gap;
    text.font(fontOf(800, px));
  }
  ctx.fillStyle = '#fff';
  text.drawTabular(value, x, mid);
}

class ViewerCount implements Widget {
  private shown = NaN;
  private value = '';

  constructor(
    private sh: Shared,
    public settings: Record<string, unknown>,
  ) {}

  paint(box: Box) {
    if (this.sh.viewers !== this.shown) {
      this.shown = this.sh.viewers;
      this.value = this.shown.toLocaleString();
    }
    paintCounter(this.sh, box, 'eye', '#ffffff', '', this.value, true);
  }
}

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

class StreamTimer implements Widget {
  /** With no start time from the server, it counts from when it was first drawn, as a preview does. */
  private drawnAt = Date.now();
  private second = -1;
  private value = '';
  private label = new Upper();

  constructor(
    private sh: Shared,
    public settings: Record<string, unknown>,
  ) {}

  paint(box: Box) {
    const { sh } = this;
    const startedAt = sh.stats.startedAt ? Date.parse(sh.stats.startedAt) : NaN;
    const from = Number.isFinite(startedAt) ? startedAt : this.drawnAt;
    const second = Math.floor((sh.wall - from) / 1000);
    if (second !== this.second) {
      this.second = second;
      this.value = formatElapsed(sh.wall - from);
    }
    paintCounter(sh, box, 'clock', accentOf(this.settings), this.label.of(setting(this.settings, 'label', '')), this.value);
  }
}

class ReactionCounter implements Widget {
  private count: Counted;
  private shown = NaN;
  private value = '';

  constructor(
    private sh: Shared,
    public settings: Record<string, unknown>,
  ) {
    this.count = new Counted(this.base);
  }

  private get base() {
    return Number(this.sh.stats.reactions) || 0;
  }

  onEvent(event: LiveRoomEvent) {
    if (event.type === 'reaction') this.count.add(this.base, 1);
  }

  paint(box: Box) {
    const total = this.count.value(this.base);
    if (total !== this.shown) {
      this.shown = total;
      this.value = total.toLocaleString();
    }
    paintCounter(this.sh, box, 'heart', accentOf(this.settings), '', this.value);
  }
}

// ─── Text, lower third, frame, ticker ────────────────────────────────────────

class TextWidget implements Widget {
  constructor(
    private sh: Shared,
    public settings: Record<string, unknown>,
  ) {}

  paint(box: Box) {
    const { ctx, text } = this.sh;
    const lowerThird = setting(this.settings, 'style', 'plain') === 'lower_third';
    const main = setting(this.settings, 'text', '');
    const sub = setting(this.settings, 'subtext', '');
    if (!main && !sub) return;
    const h = box.h;
    let x = box.x;
    let maxW = box.w;
    const px = h * (lowerThird ? 0.32 : 0.5);
    const subPx = h * 0.19;

    if (lowerThird) {
      const r = h * 0.14;
      glassPanel(ctx, box.x, box.y, box.w, h, r, glassOf(this.sh, null, { sheen: true }));
      // The accent bar down the leading side, fading toward its foot, inside the rounded corners.
      const accent = accentOf(this.settings);
      const bar = ctx.createLinearGradient(0, box.y, 0, box.y + h);
      bar.addColorStop(0, accent);
      bar.addColorStop(1, withAlpha(accent, 0.4));
      ctx.save();
      roundRectPath(ctx, box.x + this.sh.hair, box.y + this.sh.hair, box.w - this.sh.hair * 2, h - this.sh.hair * 2, r);
      ctx.clip();
      ctx.fillStyle = bar;
      ctx.fillRect(box.x + this.sh.hair, box.y, h * 0.06, h);
      ctx.restore();
      x = box.x + h * 0.3;
      maxW = box.w - h * 0.6;
    } else {
      shadow(ctx, 'rgba(0,0,0,0.6)', 10 * this.sh.unit, 2 * this.sh.unit);
    }
    if (maxW <= 0) return;

    // The heading wraps, as a block of text does; the subtext is one line, cut short.
    text.font(fontOf(800, px));
    const lines = main ? text.wrap(main, maxW, Math.max(1, Math.floor(h / (px * LINE_HEIGHT)))) : NONE;
    const blockH = lines.length * px * LINE_HEIGHT + (sub ? h * 0.04 + subPx * LINE_HEIGHT : 0);
    let top = box.y + (h - blockH) / 2;
    ctx.fillStyle = '#fff';
    for (const line of lines) {
      ctx.fillText(line, x, lineMid(top, px));
      top += px * LINE_HEIGHT;
    }
    if (sub) {
      top += h * 0.04;
      text.font(fontOf(500, subPx));
      ctx.fillStyle = MUTED;
      ctx.fillText(text.fit(sub, maxW), x, lineMid(top, subPx));
    }
    noShadow(ctx);
  }
}

class Frame implements Widget {
  private glow: { key: string; raster: Raster | null } | null = null;

  constructor(
    private sh: Shared,
    public settings: Record<string, unknown>,
  ) {}

  paint(box: Box) {
    const { ctx } = this.sh;
    const glow = setting(this.settings, 'style', 'solid') === 'glow';
    // Thickness and rounding are thousandths of the widget's height.
    const thickness = (Math.min(80, Math.max(1, setting(this.settings, 'thickness', 6))) / 1000) * box.h;
    const radius = (Math.min(300, Math.max(0, setting(this.settings, 'radius', 0))) / 1000) * box.h;
    const accent = accentOf(this.settings);
    if (!glow) {
      strokeFrame(ctx, box.x, box.y, box.w, box.h, thickness, radius, accent);
      return;
    }
    // A glow is a big blur: drawn once into a sprite, then copied each frame.
    const key = `${box.w | 0}x${box.h | 0}|${thickness}|${radius}|${accent}`;
    if (!this.glow || this.glow.key !== key) {
      const scratch = makeCanvas(box.w, box.h);
      if (scratch) {
        const s = scratch.ctx as Ctx;
        s.shadowColor = accent;
        s.shadowBlur = thickness * 3;
        strokeFrame(s, 0, 0, box.w, box.h, thickness, radius, accent);
        strokeFrame(s, 0, 0, box.w, box.h, thickness, radius, accent);
      }
      this.glow = { key, raster: scratch?.canvas ?? null };
    }
    if (this.glow.raster) ctx.drawImage(this.glow.raster, box.x, box.y, box.w, box.h);
    else strokeFrame(ctx, box.x, box.y, box.w, box.h, thickness, radius, accent);
  }
}

function strokeFrame(ctx: Ctx, x: number, y: number, w: number, h: number, thickness: number, radius: number, color: string) {
  roundRectPath(ctx, x + thickness / 2, y + thickness / 2, w - thickness, h - thickness, Math.max(0, radius - thickness / 2));
  ctx.lineWidth = thickness;
  ctx.strokeStyle = color;
  ctx.stroke();
}

const TICKER_SECONDS: Record<string, number> = { slow: 30, normal: 18, fast: 10 };

class Ticker implements Widget {
  /** The strip is drawn here first, then faded out at both ends and copied: a mask on the picture itself would erase the camera. */
  private layer: { canvas: Raster; ctx: Ctx; w: number; h: number } | null = null;
  private raw = '';
  private value = '';

  constructor(
    private sh: Shared,
    public settings: Record<string, unknown>,
  ) {}

  paint(box: Box) {
    const { sh } = this;
    const { text, now } = sh;
    const raw = setting(this.settings, 'text', '');
    // Runs of spaces collapse to one, as they do in the DOM's text.
    if (raw !== this.raw) {
      this.raw = raw;
      this.value = raw.replace(/\s+/g, ' ').trim();
    }
    const value = this.value;
    if (!value) return;
    const seconds = TICKER_SECONDS[setting(this.settings, 'speed', 'normal')] ?? TICKER_SECONDS.normal;
    const w = Math.max(1, Math.round(box.w));
    const h = Math.max(1, Math.round(box.h));
    if (!this.layer || this.layer.w !== w || this.layer.h !== h) {
      const scratch = makeCanvas(w, h);
      this.layer = scratch ? { canvas: scratch.canvas, ctx: scratch.ctx as Ctx, w, h } : null;
    }
    const layer = this.layer;
    const ctx = layer ? layer.ctx : sh.ctx;
    const ox = layer ? 0 : box.x;
    const oy = layer ? 0 : box.y;
    if (layer) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, w, h);
    }

    glassPanel(ctx, ox, oy, w, h, 0, glassOf(sh, null, { edge: false }));
    // An accent hairline along the top, fading out to the sides.
    const accent = accentOf(this.settings);
    const line = ctx.createLinearGradient(ox, 0, ox + w, 0);
    line.addColorStop(0, withAlpha(accent, 0));
    line.addColorStop(0.2, accent);
    line.addColorStop(0.8, accent);
    line.addColorStop(1, withAlpha(accent, 0));
    ctx.fillStyle = line;
    ctx.fillRect(ox, oy, w, h * 0.05);

    const px = h * 0.44;
    const font = fontOf(700, px);
    text.font(font);
    // Two copies side by side, moved by one copy's width: the loop never jumps.
    const copy = text.width(value) + px * 4;
    const offset = (((now / 1000) % seconds) / seconds) * copy;
    ctx.font = font;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff';
    ctx.fillText(value, ox - offset, oy + h / 2);
    ctx.fillText(value, ox - offset + copy, oy + h / 2);

    if (layer) {
      // mask-image: linear-gradient(90deg, transparent, #000 5%, #000 95%, transparent)
      const mask = ctx.createLinearGradient(0, 0, w, 0);
      mask.addColorStop(0, 'rgba(0,0,0,0)');
      mask.addColorStop(0.05, '#000');
      mask.addColorStop(0.95, '#000');
      mask.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalCompositeOperation = 'destination-in';
      ctx.fillStyle = mask;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
      sh.ctx.drawImage(layer.canvas, box.x, box.y, box.w, box.h);
    }
    text.use(sh.ctx);
  }
}

// ─── Chat box ────────────────────────────────────────────────────────────────

interface ChatLine {
  id: string;
  user: StreamJoinUser;
  name: string;
  text: string;
  addedAt: number;
}

class ChatBox implements Widget {
  private lines: ChatLine[] = [];
  private pose = newPose();

  constructor(
    private sh: Shared,
    public settings: Record<string, unknown>,
  ) {}

  private get count() {
    return Math.min(12, Math.max(1, setting(this.settings, 'count', 6)));
  }

  onEvent(event: LiveRoomEvent, now: number) {
    if (event.type === 'chat') {
      if (this.lines.some((l) => l.id === event.id)) return;
      this.lines = [...this.lines, { id: event.id, user: event.user, name: nameOf(this.sh, event.user), text: event.text, addedAt: now }].slice(-this.count);
    } else if (event.type === 'chatDeleted') {
      this.lines = this.lines.filter((l) => l.id !== event.id);
    }
  }

  paint(box: Box) {
    const { sh } = this;
    const { ctx, text } = sh;
    const count = this.count;
    if (this.lines.length > count) this.lines = this.lines.slice(-count);
    const row = box.h / count;
    const lineH = row * 0.9;
    const gap = row * 0.08;
    const padL = row * 0.16;
    const padR = row * 0.36;
    const inner = row * 0.25;
    const px = row * 0.4;
    const avatar = setting(this.settings, 'showAvatars', true) ? row * 0.6 : 0;
    // Newest at the bottom, the rest stacked up above it.
    let bottom = box.y + box.h;
    for (let i = this.lines.length - 1; i >= 0 && bottom > box.y; i--) {
      const line = this.lines[i];
      rowEnter(line.addedAt, sh.now, this.pose);
      const top = bottom - lineH + this.pose.dy * lineH;
      const mid = top + lineH / 2;

      // A line with no avatar keeps the wider padding on both sides.
      const lead = avatar ? padL : padR;
      text.font(fontOf(800, px));
      const name = text.fit(line.name, box.w * 0.5);
      const nameW = text.width(name);
      text.font(fontOf(500, px));
      const fixed = lead + padR + (avatar ? avatar + inner : 0) + nameW + inner;
      const message = text.fit(line.text, box.w - fixed);
      const width = Math.min(box.w, fixed + text.width(message));

      ctx.globalAlpha = this.pose.alpha;
      glassPanel(ctx, box.x, top, width, lineH, row * 0.45, glassOf(sh, 'chat'));
      let x = box.x + lead;
      if (avatar) {
        avatarRings(ctx, x + avatar / 2, mid, avatar, row * 0.03, 'rgba(255,255,255,0.5)');
        drawAvatar(ctx, sh.images, line.user, x, mid - avatar / 2, avatar);
        x += avatar + inner;
      }
      text.font(fontOf(800, px));
      ctx.fillStyle = '#fff';
      ctx.fillText(name, x, mid);
      x += nameW + inner;
      text.font(fontOf(500, px));
      ctx.fillStyle = white(0.86);
      ctx.fillText(message, x, mid);
      ctx.globalAlpha = 1;
      bottom -= lineH + gap;
    }
  }
}

// ─── Poll (read-only: viewers of the video vote with `!vote 2`) ──────────────

const POLL_FILL_EASE = cubicBezier(0.2, 0.8, 0.2, 1);

class PollPainter implements Widget {
  private pollId = '';
  private fills: Tween[] = [];
  private key = '';
  private time = '';
  private foot = '';

  constructor(
    private sh: Shared,
    public settings: Record<string, unknown>,
  ) {}

  paint(box: Box) {
    const { sh } = this;
    const { ctx, text } = sh;
    const poll = sh.poll;
    if (!poll) return;
    if (poll.id !== this.pollId) {
      this.pollId = poll.id;
      this.fills = poll.options.map(() => new Tween(600, POLL_FILL_EASE));
    }
    const seconds = Math.max(0, Math.ceil((Date.parse(poll.endsAt) - sh.wall) / 1000) || 0);
    const open = isPollOpen(poll, sh.wall) && seconds > 0;
    const key = `${sh.lang}|${seconds}|${open}|${poll.total}`;
    if (key !== this.key) {
      this.key = key;
      this.time = open ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : sh.t('liveOverlay.poll.closed');
      this.foot = open
        ? sh.t('liveOverlay.poll.howToVote', { count: poll.total, command: '!vote' })
        : sh.t('liveOverlay.poll.votes', { count: poll.total });
    }
    const shares = pollShares(poll);
    const leaders = open ? null : pollLeaders(poll);
    const accent = accentOf(this.settings);

    const n = poll.options.length;
    const row = box.h / (n + 2);
    glassPanel(ctx, box.x, box.y, box.w, box.h, row * 0.42, glassOf(sh));
    const padX = row * 0.4;
    const padY = row * 0.3;
    const gap = row * 0.14;
    const innerW = box.w - padX * 2;
    if (innerW <= 0) return;
    const x = box.x + padX;
    let top = box.y + padY;

    // Question and countdown.
    const headPx = row * 0.46;
    text.font(fontOf(600, headPx));
    const timeW = text.width(this.time);
    ctx.fillStyle = white(0.75);
    ctx.fillText(this.time, x + innerW - timeW, lineMid(top, headPx));
    text.font(fontOf(700, headPx));
    ctx.fillStyle = '#fff';
    ctx.fillText(text.fit(poll.question, innerW - timeW - row * 0.3), x, lineMid(top, headPx));
    top += headPx * LINE_HEIGHT + gap;

    const footPx = row * 0.32;
    const footH = footPx * LINE_HEIGHT;
    const optionsH = box.y + box.h - padY - footH - gap - top;
    const optGap = row * 0.12;
    const optH = (optionsH - optGap * (n - 1)) / n;
    const px = row * 0.4;
    for (let i = 0; i < n && optH > 0; i++) {
      const oy = top + i * (optH + optGap);
      const mid = oy + optH / 2;
      const or = row * 0.28;
      ctx.save();
      roundRectPath(ctx, x, oy, innerW, optH, or);
      ctx.fillStyle = white(0.06);
      ctx.fill();
      ctx.clip();
      const fill = this.fills[i];
      fill?.set(shares[i] / 100, sh.now);
      const share = fill ? fill.get(sh.now) : shares[i] / 100;
      if (share > 0) {
        // The fill runs from a faint to a stronger accent across its own width.
        const fw = innerW * share;
        const g = ctx.createLinearGradient(x, 0, x + fw, 0);
        g.addColorStop(0, withAlpha(accent, 0.18));
        g.addColorStop(1, withAlpha(accent, 0.42));
        ctx.fillStyle = g;
        ctx.fillRect(x, oy, fw, optH);
      }
      // inset 0 1px 0 white/6, then the 1px white/6 edge.
      roundRectPath(ctx, x, oy + sh.hair * 2, innerW, optH, or);
      ctx.rect(x - 4, oy - 4, innerW + 8, optH + 8);
      ctx.fillStyle = white(0.06);
      ctx.fill('evenodd');
      ctx.restore();
      roundRectPath(ctx, x + sh.hair / 2, oy + sh.hair / 2, innerW - sh.hair, optH - sh.hair, or);
      ctx.lineWidth = sh.hair;
      ctx.strokeStyle = white(0.06);
      ctx.stroke();

      let ox = x + row * 0.3;
      const numPx = px * 0.8;
      const disc = numPx * 1.4;
      ctx.beginPath();
      ctx.arc(ox + disc / 2, mid, disc / 2, 0, Math.PI * 2);
      ctx.fillStyle = white(0.16);
      ctx.fill();
      text.font(fontOf(700, numPx));
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText(String(i + 1), ox + disc / 2, mid);
      ctx.textAlign = 'left';
      ox += disc + row * 0.25;

      text.font(fontOf(600, px));
      const pct = `${shares[i]}%`;
      const pctW = text.width(pct);
      const pctX = x + innerW - row * 0.3 - pctW;
      ctx.fillText(pct, pctX, mid);
      text.font(fontOf(leaders?.has(i) ? 700 : 400, px));
      ctx.fillText(text.fit(poll.options[i].text, pctX - row * 0.25 - ox), ox, mid);
    }

    text.font(fontOf(400, footPx));
    ctx.fillStyle = white(0.75);
    ctx.fillText(text.fit(this.foot, innerW), x, lineMid(box.y + box.h - padY - footH, footPx));
  }
}

// ─── Subathon timer ──────────────────────────────────────────────────────────

const FLASH_MS = 2500;
const FLASH_AT = [0, 0.15, 0.8, 1];
const FLASH_OP = [0, 1, 1, 0];
const FLASH_Y = [-0.2, -0.5, -0.8, -1.1];
const FLASH_S = [0.8, 1, 1, 1];

export function clockOf(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

class SubathonTimer implements Widget {
  private key = '';
  private label = '';
  private clock = '';
  private flash = '';

  constructor(
    private sh: Shared,
    public settings: Record<string, unknown>,
  ) {}

  paint(box: Box) {
    const { sh } = this;
    const { ctx, text } = sh;
    const sub = sh.subathon;
    if (!sub?.running || !sub.endsAt) return;
    const left = Math.max(0, Math.ceil((Date.parse(sub.endsAt) - sh.wall) / 1000) || 0);
    const custom = setting(this.settings, 'label', '');
    const added = sub.lastAdd && sh.wall - sub.lastAdd.at < FLASH_MS ? sub.lastAdd.seconds : 0;
    const key = `${sh.lang}|${left}|${custom}|${added}`;
    if (key !== this.key) {
      this.key = key;
      this.label = upper(custom || sh.t('liveOverlay.subathon'));
      this.clock = left === 0 ? sh.t('liveOverlay.subathonOver') : clockOf(left);
      this.flash = added ? `+${clockOf(added).replace(/^0:/, '')}` : '';
    }
    const h = box.h;
    glassPanel(ctx, box.x, box.y, box.w, h, h * 0.26, glassOf(sh));
    const pad = h * 0.24;
    const innerW = box.w - pad * 2;
    if (innerW <= 0) return;
    const labelPx = h * 0.15;
    const clockPx = h * (left === 0 ? 0.3 : 0.46);
    const blockH = labelPx * LINE_HEIGHT + clockPx * 1.05;
    let top = box.y + (h - blockH) / 2;
    drawEyebrow(sh, this.label, box.x + pad, lineMid(top, labelPx), labelPx, 0.16, innerW);
    top += labelPx * LINE_HEIGHT;
    text.font(fontOf(800, clockPx));
    const accent = accentOf(this.settings);
    ctx.fillStyle = accent;
    // A soft glow of the accent behind the digits.
    shadow(ctx, withAlpha(accent, 0.35), h * 0.18);
    if (left === 0) ctx.fillText(text.fit(this.clock, innerW), box.x + pad, top + (clockPx * 1.05) / 2);
    else text.drawTabular(this.clock, box.x + pad, top + (clockPx * 1.05) / 2);
    noShadow(ctx);

    if (this.flash && sub.lastAdd) {
      // `ow-subathon-add`: "+1:30" floats up the right edge and fades.
      const p = clamp01((sh.wall - sub.lastAdd.at) / FLASH_MS);
      const e = easeOut(p);
      const px = h * 0.3;
      text.font(fontOf(800, px));
      const w = text.width(this.flash);
      const s = keyframes(e, FLASH_AT, FLASH_S);
      const lineH = px * LINE_HEIGHT;
      ctx.save();
      ctx.globalAlpha = keyframes(e, FLASH_AT, FLASH_OP);
      ctx.translate(box.x + box.w - pad - w / 2, box.y + h / 2 + keyframes(e, FLASH_AT, FLASH_Y) * lineH + lineH / 2);
      ctx.scale(s, s);
      shadow(ctx, 'rgba(0,0,0,0.5)', 6 * sh.unit, 1 * sh.unit);
      ctx.fillStyle = '#4ade80';
      ctx.fillText(this.flash, -w / 2, 0);
      ctx.restore();
    }
  }
}

// ─── Tip jar ─────────────────────────────────────────────────────────────────

const DROP_MS = 1200;
const JAR_FILL_EASE = cubicBezier(0.2, 0.8, 0.2, 1);
const DROP_OP_AT = [0, 0.2, 1];
const DROP_OP = [0, 1, 0];

class TipJar implements Widget {
  private count: Counted;
  private drops: number[] = [];
  private fill = new Tween(800, JAR_FILL_EASE);
  private key = '';
  private title = '';
  private line = '';
  private gradient: { key: string; g: CanvasGradient } | null = null;

  constructor(
    private sh: Shared,
    public settings: Record<string, unknown>,
  ) {
    this.count = new Counted(this.base);
  }

  private get base() {
    return Number(this.sh.stats.totalTips) || 0;
  }

  onEvent(event: LiveRoomEvent, now: number) {
    if (event.type !== 'tipConfirmed') return;
    this.count.add(this.base, event.paidAmount);
    this.drops = [...this.drops.slice(-4), now];
  }

  paint(box: Box) {
    const { sh } = this;
    const { ctx, text } = sh;
    const target = Math.max(1, setting(this.settings, 'target', 100_000));
    const value = this.count.value(this.base);
    const custom = setting(this.settings, 'title', '');
    const key = `${sh.lang}|${Math.floor(value)}|${target}|${custom}`;
    if (key !== this.key) {
      this.key = key;
      this.title = custom || sh.t('liveOverlay.tipJar');
      this.line = `${Math.floor(value).toLocaleString()} / ${target.toLocaleString()} DHB`;
    }
    const accent = accentOf(this.settings, '#facc15');
    const w = box.w;
    const capPx = w * 0.09;
    const captionH = capPx * LINE_HEIGHT * 2;
    const glassH = box.h - captionH - w * 0.04;
    const glassW = w * 0.7;
    const gx = box.x + (w - glassW) / 2;
    const gy = box.y;

    if (glassH > 0) {
      const border = w * 0.025;
      shadow(ctx, 'rgba(0,0,0,0.35)', 24 * sh.unit, 6 * sh.unit);
      roundRectPath(ctx, gx, gy, glassW, glassH, w * 0.08, w * 0.2);
      ctx.fillStyle = white(0.08);
      ctx.fill();
      noShadow(ctx);
      ctx.save();
      ctx.clip();
      this.fill.set(Math.min(1, value / target), sh.now);
      const fillH = glassH * this.fill.get(sh.now);
      if (fillH > 0) {
        const gkey = `${gy | 0},${glassH | 0},${accent}`;
        if (!this.gradient || this.gradient.key !== gkey) {
          const g = ctx.createLinearGradient(0, gy + glassH, 0, gy);
          g.addColorStop(0, accent);
          g.addColorStop(1, mixWithWhite(accent, 0.4));
          this.gradient = { key: gkey, g };
        }
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = this.gradient.g;
        ctx.fillRect(gx, gy + glassH - fillH, glassW, fillH);
        ctx.globalAlpha = 1;
      }
      // Coins falling in.
      this.drops = this.drops.filter((at) => sh.now - at < DROP_MS);
      const coinPx = w * 0.16;
      for (let i = 0; i < this.drops.length; i++) {
        const p = (sh.now - this.drops[i]) / DROP_MS;
        const e = p * p; // ease-in
        const cy = gy + (-1.2 * coinPx * LINE_HEIGHT) * (1 - e) + box.h * 0.6 * e + (coinPx * LINE_HEIGHT) / 2;
        ctx.globalAlpha = keyframes(p, DROP_OP_AT, DROP_OP);
        sh.sprites.draw(ctx, '🪙', gx + glassW * ((20 + ((i * 23) % 60)) / 100) + coinPx / 2, cy, coinPx);
      }
      ctx.globalAlpha = 1;
      ctx.restore();
      roundRectPath(ctx, gx + border / 2, gy + border / 2, glassW - border, glassH - border, w * 0.08, w * 0.2);
      ctx.lineWidth = border;
      ctx.strokeStyle = white(0.75);
      ctx.stroke();
      // `inset 0 0 8% white/15`, as a soft inner rim.
      ctx.lineWidth = border * 1.5;
      ctx.strokeStyle = withAlpha('#ffffff', 0.08);
      ctx.stroke();
    }

    const cx = box.x + w / 2;
    const capTop = box.y + box.h - captionH;
    shadow(ctx, 'rgba(0,0,0,0.6)', 6 * sh.unit, 1 * sh.unit);
    ctx.textAlign = 'center';
    text.font(fontOf(700, capPx));
    ctx.fillStyle = '#fff';
    ctx.fillText(text.fit(this.title, w), cx, lineMid(capTop, capPx));
    text.font(fontOf(600, capPx));
    ctx.fillStyle = white(0.85);
    ctx.fillText(text.fit(this.line, w), cx, lineMid(capTop + capPx * LINE_HEIGHT, capPx));
    ctx.textAlign = 'left';
    noShadow(ctx);
  }
}

// ─── Registry ────────────────────────────────────────────────────────────────

export function createWidget(kind: OverlayKind, sh: Shared, settings: Record<string, unknown>): Widget {
  switch (kind) {
    case 'tip_alert':
      return new TipAlert(sh, settings);
    case 'follow_alert':
    case 'subscribe_alert':
    case 'share_alert':
    case 'join_alert':
      return new PersonAlert(sh, kind, settings);
    case 'goal_bar':
      return new GoalBar(sh, settings);
    case 'top_supporters':
      return new TopSupporters(sh, settings);
    case 'viewer_count':
      return new ViewerCount(sh, settings);
    case 'text':
      return new TextWidget(sh, settings);
    case 'frame':
      return new Frame(sh, settings);
    case 'stream_timer':
      return new StreamTimer(sh, settings);
    case 'reaction_counter':
      return new ReactionCounter(sh, settings);
    case 'event_feed':
      return new EventFeed(sh, settings);
    case 'chat_box':
      return new ChatBox(sh, settings);
    case 'ticker':
      return new Ticker(sh, settings);
    case 'rule_alert':
      return new RuleAlert(sh, settings);
    case 'poll':
      return new PollPainter(sh, settings);
    case 'spin_wheel':
      return new SpinWheel(sh, settings);
    case 'subathon_timer':
      return new SubathonTimer(sh, settings);
    case 'points_board':
      return new PointsBoard(sh, settings);
    case 'streamer_level':
      return new StreamerLevel(sh, settings);
    case 'tip_jar':
      return new TipJar(sh, settings);
    case 'hype_train':
      return new HypeTrainWidget(sh, settings);
  }
}
