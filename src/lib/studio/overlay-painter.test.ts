import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OVERLAY_KINDS, newWidget, type OverlayKind } from '@/lib/live-overlay/registry';
import type { OverlayWidget, PublicOverlay } from '@/lib/live-overlay/types';
import { samplePoll } from '@/lib/live-overlay/polls';
import { ALERT_LEAVE_MS } from './overlay-paint/motion';
import { englishTranslate } from './overlay-paint/strings';
import { createOverlayPainter, visibleWidgets, widgetBox } from './overlay-painter';

/**
 * A 2D context that records what was drawn. Text is ten pixels a character at
 * any size, which is all the layout needs to be checked.
 */
function fakeContext() {
  const texts: string[] = [];
  const clips: Array<[number, number, number, number]> = [];
  const gradient = { addColorStop: () => undefined };
  const noop = () => undefined;
  const ctx = {
    font: '',
    fillStyle: '' as unknown,
    strokeStyle: '' as unknown,
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    globalAlpha: 1,
    textAlign: 'left',
    textBaseline: 'alphabetic',
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    save: noop,
    restore: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    arc: noop,
    arcTo: noop,
    fill: noop,
    stroke: noop,
    fillRect: noop,
    clip: noop,
    translate: noop,
    scale: noop,
    rotate: noop,
    transform: noop,
    setTransform: noop,
    drawImage: noop,
    rect: (x: number, y: number, w: number, h: number) => clips.push([x, y, w, h]),
    fillText: (text: string) => texts.push(text),
    measureText: (text: string) => ({ width: Array.from(text).length * 10 }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, texts, clips };
}

function widget(kind: OverlayKind, patch: Partial<OverlayWidget> = {}): OverlayWidget {
  return { ...newWidget(kind, []), ...patch };
}

function overlayOf(widgets: OverlayWidget[], patch: Partial<PublicOverlay> = {}): PublicOverlay {
  return {
    renderIn: 'app',
    widgets,
    version: 1,
    stats: { totalTips: 0, followers: 0, startedAt: '2026-10-26T10:00:00.000Z', reactions: 0 },
    ...patch,
  };
}

const WALL = Date.parse('2026-10-26T10:30:00.000Z');

describe('visibleWidgets', () => {
  it('keeps enabled, known widgets in draw order', () => {
    const a = widget('goal_bar', { id: 'a', z: 3 });
    const b = widget('text', { id: 'b', z: 1 });
    const off = widget('ticker', { id: 'off', enabled: false });
    const unknown = { ...widget('text', { id: 'u' }), kind: 'from_the_future' };
    expect(visibleWidgets(overlayOf([a, b, off, unknown]), false).map((w) => w.id)).toEqual(['b', 'a']);
  });

  it('drops alert kinds while alerts are paused, and only those', () => {
    const widgets = [widget('follow_alert', { id: 'f' }), widget('spin_wheel', { id: 's' }), widget('chat_box', { id: 'c' })];
    const paused = overlayOf(widgets, { controls: { alertsPaused: true, soundsMuted: false, readAloudMuted: false } });
    expect(visibleWidgets(paused, false).map((w) => w.id)).toEqual(['c']);
  });

  it('adds a poll at its default spot while one runs and the creator placed none', () => {
    const list = visibleWidgets(overlayOf([widget('text', { id: 't' })]), true);
    expect(list.map((w) => w.kind)).toEqual(['text', 'poll']);
    expect(list[1].landscape).toEqual(newWidget('poll', []).landscape);
    const placed = widget('poll', { id: 'mine', landscape: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } });
    expect(visibleWidgets(overlayOf([placed]), true).map((w) => w.id)).toEqual(['mine']);
  });
});

describe('widgetBox', () => {
  const w = widget('goal_bar', {
    landscape: { x: 0.1, y: 0.2, w: 0.3, h: 0.1 },
    portrait: { x: 0.05, y: 0.5, w: 0.9, h: 0.05 },
  });

  it('places against the whole canvas with the landscape rect', () => {
    expect(widgetBox(w, 1920, 1080, { x: 0, y: 0, w: 0, h: 0 })).toEqual({ x: 192, y: 216, w: 576, h: 108 });
  });

  it('scales with the canvas, so 720p is 1080p shrunk', () => {
    const big = widgetBox(w, 1920, 1080, { x: 0, y: 0, w: 0, h: 0 });
    const small = widgetBox(w, 1280, 720, { x: 0, y: 0, w: 0, h: 0 });
    expect(small.x / big.x).toBeCloseTo(2 / 3);
    expect(small.h / big.h).toBeCloseTo(2 / 3);
  });

  it('uses the portrait rect on an upright canvas, and landscape on a square one', () => {
    expect(widgetBox(w, 1080, 1920, { x: 0, y: 0, w: 0, h: 0 })).toEqual({ x: 54, y: 960, w: 972, h: 96 });
    expect(widgetBox(w, 1000, 1000, { x: 0, y: 0, w: 0, h: 0 }).y).toBeCloseTo(200);
  });
});

describe('createOverlayPainter', () => {
  let now = 0;
  const make = (onError?: (e: unknown) => void) =>
    createOverlayPainter({ clock: () => now, wallClock: () => WALL, translate: englishTranslate, onError });

  beforeEach(() => {
    now = 1000;
    // jsdom has no canvas: scratch canvases (sprites) get the same recording fake.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => fakeContext().ctx as never);
  });
  afterEach(() => vi.restoreAllMocks());

  it('clips each widget to its box on the canvas', () => {
    const painter = make();
    painter.setOverlay(overlayOf([widget('goal_bar', { landscape: { x: 0.5, y: 0.25, w: 0.25, h: 0.1 } })]));
    const { ctx, clips } = fakeContext();
    painter.paint(ctx, 1280, 720, now);
    expect(clips[0]).toEqual([640, 180, 320, 72]);
  });

  it('queues alerts and takes each off after its time', () => {
    const painter = make();
    painter.setOverlay(overlayOf([widget('follow_alert', { settings: { durationMs: 2000 } })]));
    painter.publish({ type: 'follow', user: { displayName: 'Ann' } });
    painter.publish({ type: 'follow', user: { displayName: 'Bo' } });

    const frame = () => {
      const f = fakeContext();
      painter.paint(f.ctx, 1280, 720, now);
      return f.texts;
    };
    expect(frame()).toContain('New follower: Ann');
    now += 2000 + ALERT_LEAVE_MS;
    expect(frame()).toEqual(['New follower: Bo']);
    now += 2000 + ALERT_LEAVE_MS;
    expect(frame()).toEqual([]);
  });

  it('hears nothing for alerts while they are paused', () => {
    const painter = make();
    const follow = widget('follow_alert');
    painter.setOverlay(overlayOf([follow], { controls: { alertsPaused: true, soundsMuted: false, readAloudMuted: false } }));
    painter.publish({ type: 'follow', user: { displayName: 'Ann' } });
    painter.setOverlay(overlayOf([follow]));
    const { ctx, texts } = fakeContext();
    painter.paint(ctx, 1280, 720, now);
    expect(texts).toEqual([]);
  });

  it('keeps an alert running through an overlay update that keeps its widget', () => {
    const painter = make();
    const follow = widget('follow_alert');
    painter.setOverlay(overlayOf([follow]));
    painter.publish({ type: 'follow', user: { displayName: 'Ann' } });
    painter.setOverlay(overlayOf([{ ...follow, landscape: { x: 0, y: 0, w: 0.5, h: 0.1 } }]));
    const { ctx, texts } = fakeContext();
    painter.paint(ctx, 1280, 720, now);
    expect(texts).toContain('New follower: Ann');
  });

  it('counts paid tips onto the goal and starts again from a fresh server figure', () => {
    const painter = make();
    const goal = widget('goal_bar', { settings: { metric: 'tips', target: 1000, title: 'Goal' } });
    painter.setOverlay(overlayOf([goal]));
    painter.publish({ type: 'tipConfirmed', paidAmount: 250, address: '0x1', transactionHash: '0xa' });
    let f = fakeContext();
    painter.paint(f.ctx, 1280, 720, now);
    expect(f.texts).toContain((250).toLocaleString() + ' / ' + (1000).toLocaleString());
    painter.setOverlay(overlayOf([goal], { stats: { totalTips: 400, followers: 0 } }));
    f = fakeContext();
    painter.paint(f.ctx, 1280, 720, now);
    expect(f.texts).toContain('400 / ' + (1000).toLocaleString());
  });

  it('ignores what is not a room event', () => {
    const painter = make();
    painter.setOverlay(overlayOf([widget('chat_box')]));
    painter.publish(null);
    painter.publish('chat');
    painter.publish({ type: 'nonsense' });
    painter.publish({ type: 'chat', id: '1', text: 'hi there', user: { displayName: 'Ann' } });
    painter.publish({ type: 'chat', id: '1', text: 'hi there', user: { displayName: 'Ann' } });
    const { ctx, texts } = fakeContext();
    painter.paint(ctx, 1280, 720, now);
    expect(texts.filter((t) => t === 'hi there')).toHaveLength(1);
  });

  it('draws a running poll read-only, telling people how to vote', () => {
    const painter = make();
    painter.setOverlay(overlayOf([]));
    const poll = { ...samplePoll('Best map?', ['Dust', 'Nuke']), endsAt: new Date(WALL + 65_000).toISOString() };
    painter.setPoll(poll);
    const { ctx, texts } = fakeContext();
    painter.paint(ctx, 1280, 720, now);
    expect(texts).toContain('Best map?');
    expect(texts).toContain('1:05');
    expect(texts.some((t) => t.startsWith('Type !vote'))).toBe(true);
  });

  it('paints every widget kind at 720p, 1080p and portrait without failing', () => {
    const errors: unknown[] = [];
    const painter = make((e) => errors.push(e));
    const widgets = OVERLAY_KINDS.map((kind, i) =>
      widget(kind, {
        id: `${kind}-x`,
        z: i,
        settings: { ...newWidget(kind, []).settings, text: 'Hello stream', subtext: 'Sub', style: kind === 'frame' ? 'glow' : undefined },
      }),
    );
    painter.setOverlay(overlayOf(widgets, { subathon: { running: true, endsAt: new Date(WALL + 3600_000).toISOString() } }));
    painter.setPoll(samplePoll('Q?', ['A', 'B', 'C']));
    painter.setSubathon({ running: true, endsAt: new Date(WALL + 3600_000).toISOString(), lastAdd: { seconds: 90, at: WALL - 500 } });
    painter.setHype({
      streamId: 's',
      active: true,
      points: 10,
      level: 2,
      completed: 1,
      into: 5,
      need: 10,
      startedAt: new Date(WALL - 60_000).toISOString(),
      expiresAt: new Date(WALL + 60_000).toISOString(),
      contributors: 3,
      top: [],
    });
    painter.setTopSupporters([{ address: '0x1', displayName: 'Ann', total: 5000 }]);
    painter.setPointsBoard([{ address: '0x2', displayName: 'Bo', points: 12, watchMinutes: 10, giftedDhb: 0 }]);
    painter.setStreamerLevel({ level: 4, progressToNext: 0.5, currentStreakWeeks: 2 });
    painter.setViewerCount(42);
    painter.publish({ type: 'tip', amount: 1_000_000, user: { displayName: 'Whale' }, message: 'gg' });
    painter.publish({ type: 'tipConfirmed', paidAmount: 1000, address: '0x3', transactionHash: '0xb' });
    painter.publish({ type: 'giftSub', user: { displayName: 'Gift' }, count: 3, recipients: [] });
    painter.publish({ type: 'join', user: { address: '0x4', displayName: 'Joe' } });
    painter.publish({ type: 'share', user: { displayName: 'Sam' } });
    painter.publish({ type: 'reaction', reactionType: 'heart', user: {} });
    painter.publish({ type: 'chat', id: 'c1', text: 'hello', user: { displayName: 'Ann' } });
    painter.fireRule({
      ruleId: 'r',
      user: { displayName: 'Ann' },
      alerts: [{ text: 'Rule!', durationMs: 4000 }],
      sounds: [],
      say: [],
      wheels: [{ segments: ['One', 'Two', 'Three'], result: 1 }],
    });

    for (const [w, h] of [
      [1280, 720],
      [1920, 1080],
      [1080, 1920],
    ]) {
      for (const at of [0, 300, 2500, 6000, 9000]) {
        const { ctx } = fakeContext();
        painter.paint(ctx, w, h, now + at);
      }
    }
    expect(errors).toEqual([]);
  });

  it('draws the gift celebration, and the wheel result once it lands', () => {
    const painter = make();
    painter.setOverlay(overlayOf([widget('tip_alert'), widget('spin_wheel')]));
    painter.publish({ type: 'tip', amount: 1000, user: { displayName: 'Ann' } });
    painter.fireRule({ ruleId: 'r', user: { displayName: 'Bo' }, alerts: [], sounds: [], say: [], wheels: [{ segments: ['A', 'B'], result: 1 }] });
    const early = fakeContext();
    painter.paint(early.ctx, 1280, 720, now + 1000);
    expect(early.texts.some((t) => t.includes('Love Heart'))).toBe(true);
    expect(early.texts).not.toContain('Bo spun: B');
    const landed = fakeContext();
    painter.paint(landed.ctx, 1280, 720, now + 5600);
    expect(landed.texts).toContain('Bo spun: B');
  });

  it('stops drawing once disposed', () => {
    const painter = make();
    painter.setOverlay(overlayOf([widget('text', { settings: { text: 'Hi' } })]));
    painter.dispose();
    const { ctx, texts, clips } = fakeContext();
    painter.paint(ctx, 1280, 720, now);
    expect(texts).toEqual([]);
    expect(clips).toEqual([]);
  });
});
