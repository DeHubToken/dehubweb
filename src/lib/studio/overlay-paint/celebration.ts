/**
 * Gift celebrations for the tip alert's default style, painted.
 *
 * The DOM version (GiftAnimationOverlay.tsx) is ninety-odd CSS-animated emoji
 * per Ultimate. This is the same choreography — the same tiers, glyphs,
 * counts, delays, durations and keyframes, and the same deterministic jitter so
 * a particle lands where it would in the app — computed from the clock and
 * drawn from emoji sprites. Each tier's particle table is built once and
 * shared by every gift of that tier, so a frame allocates nothing.
 *
 * What is simplified: drop shadows on glyphs and the stage-wide shake under
 * the Spartans are left out (each would cost a blur per glyph per frame), and
 * the gold siren's inset glow is a radial gradient.
 */
import type { GiftTier, GiftTierKey } from '@/lib/live/gift-tiers';
import { clamp01, cubicBezier, easeInOut, easeOut, keyframes, linear, type Easing } from './motion';
import { drawCoin, roundRectPath, white, type EmojiSprites, type ImageStore } from './draw';
import { fontOf, type TextKit } from './text';

type Ctx = CanvasRenderingContext2D;

export interface Celebration {
  id: number;
  tier: GiftTier;
  amount: number;
  /** "🏆 Ultimate Celebration", already translated. */
  title: string;
  /** "name · 1,000,000", the coin drawn after it. */
  sub: string;
  message?: string;
  start: number;
  end: number;
}

/** At most two at once: a busy stream must not cut a Golden Screen short for a heart. */
export const MAX_CELEBRATIONS = 2;

/** The DOM's deterministic pseudo-random, so particles land where the app puts them. */
const jitter = (seed: number, salt: number) => {
  const v = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

type Motion = 'rise' | 'sweep' | 'fall' | 'burst' | 'cross';

interface Particle {
  glyph: string;
  motion: Motion;
  /** Top-left of the glyph box, as a share of the stage. For 'rise' and 'sweep', y is from the bottom. */
  x: number;
  y: number;
  /** Glyph size as a share of stage width. */
  size: number;
  delay: number;
  dur: number;
  iterations: number;
  /** Travel, as shares of stage width and height. */
  dx: number;
  dy: number;
  spin: number;
  /** 'cross' only: where it starts (share of width) and its tilt. */
  from: number;
  tilt: number;
  /** Heartbeat period in ms, 0 for none. */
  beat: number;
  /** Index into the effect's gates, or -1 when always visible. */
  gate: number;
}

interface Hero {
  glyph: string;
  size: number;
  motion: 'drop' | 'fly' | 'lid' | 'swing';
  dur: number;
}

interface Rings {
  count: number;
  color: string;
  gate: number;
}

interface WashSpec {
  /** Angle of the CSS gradient: 'b' to bottom, 'r' to right, 'tr' to top right, 't' to top. */
  dir: 'b' | 'r' | 'tr' | 't' | 'br';
  stops: readonly string[];
  /** `mix-blend-screen`: the gold washes lighten the picture rather than paint over it. */
  screen?: boolean;
}

interface Effect {
  washes: WashSpec[];
  siren: boolean;
  /** Delays (ms) of the wash windows that gate some particles in. */
  gates: number[];
  particles: Particle[];
  heroes: Hero[];
  rings: Rings[];
  glints: Array<{ delay: number; gate: number }>;
  searchlight: boolean;
  march: boolean;
  streamers: boolean;
}

const COINS = ['🪙', '💰', '🟡'];
const CONFETTI = ['🎊', '🎉', '✨', '🔴', '🔵', '🟢', '🟣'];
const CHOCOLATES = ['🍫', '🍬', '🍪', '🟤'];
const PETALS = ['🌸', '🌹', '💐', '🌷', '🌺'];
const SPARKS = ['✨', '💫', '⭐', '🌟'];

const FLOAT_COUNT: Record<GiftTierKey, number> = {
  heart: 8,
  chocolate: 9,
  bouquet: 8,
  crown: 9,
  magicRing: 9,
  spartans: 10,
  party: 12,
  gold3: 12,
  gold10: 16,
  ultimate: 18,
};

const base = (p: Partial<Particle> & Pick<Particle, 'glyph' | 'motion'>): Particle => ({
  x: 0,
  y: 0,
  size: 0.1,
  delay: 0,
  dur: 1000,
  iterations: 1,
  dx: 0,
  dy: 0,
  spin: 0,
  from: 0,
  tilt: 0,
  beat: 0,
  gate: -1,
  ...p,
});

function fallField(count: number, glyphs: string[], d: number, sizeFrom: number, sizeTo: number, gate = -1): Particle[] {
  return Array.from({ length: count }, (_, i) => {
    const a = jitter(i + 1, 23);
    const b = jitter(i + 1, 31);
    return base({
      glyph: glyphs[i % glyphs.length],
      motion: 'fall',
      x: a,
      y: 0,
      size: sizeFrom + b * (sizeTo - sizeFrom),
      delay: a * d * 0.5,
      dur: 1300 + b * 1300,
      iterations: Math.max(1, Math.round(d / 2200)),
      dx: (b - 0.5) * 0.3,
      spin: (a - 0.5) * 900,
      gate,
    });
  });
}

function burstField(
  count: number,
  glyphs: string[],
  ox: number,
  oy: number,
  reach: number,
  size: number,
  stagger: number,
  gate: number,
): Particle[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (Math.PI * 2 * i) / count + jitter(i + 1, 7);
    const r = reach * (0.55 + jitter(i + 1, 5) * 0.8);
    return base({
      glyph: glyphs[i % glyphs.length],
      motion: 'burst',
      x: ox,
      y: oy,
      size: size * (0.7 + jitter(i + 1, 19) * 0.8),
      delay: i * stagger,
      dur: 1100 + jitter(i + 1, 11) * 800,
      dx: Math.cos(angle) * r,
      dy: Math.sin(angle) * r,
      spin: (jitter(i + 1, 13) - 0.5) * 540,
      gate,
    });
  });
}

function cornerFloat(tier: GiftTier): Particle[] {
  const count = FLOAT_COUNT[tier.key] ?? 8;
  return Array.from({ length: count }, (_, i) => {
    const a = jitter(i + 1, 3);
    const b = jitter(i + 1, 9);
    const c = jitter(i + 1, 17);
    return base({
      glyph: tier.emoji,
      motion: 'rise',
      x: 0.06 + a * 0.82,
      y: 0.02 + b * 0.1,
      size: 0.07 + c * 0.07,
      delay: (i / Math.max(count, 1)) * (tier.durationMs * 0.6),
      dur: 1700 + b * 1400,
      dx: (a - 0.5) * 0.35,
      spin: (b - 0.5) * 90,
    });
  });
}

function heartSweep(): Particle[] {
  return Array.from({ length: 12 }, (_, i) => {
    const a = jitter(i + 1, 3);
    const b = jitter(i + 1, 21);
    return base({
      glyph: ['❤️', '💖', '💕', '💗'][i % 4],
      motion: 'sweep',
      x: a * 0.55,
      y: b * 0.18,
      size: 0.09 + b * 0.09,
      delay: i * 95,
      dur: 1700 + a * 900,
      dx: 0.55 + a * 0.45,
      dy: -0.85 - b * 0.3,
      spin: (b - 0.5) * 90,
      beat: 740 + a * 320,
    });
  });
}

function flowerCross(): Particle[] {
  return Array.from({ length: 12 }, (_, i) => {
    const fromLeft = i % 2 === 0;
    const a = jitter(i + 1, 5);
    return base({
      glyph: PETALS[i % PETALS.length],
      motion: 'cross',
      x: 0.5,
      y: 0.18 + a * 0.52,
      size: 0.09 + a * 0.08,
      delay: i * 75,
      dur: 1400 + a * 600,
      from: fromLeft ? -0.65 : 0.65,
      dx: fromLeft ? 0.7 : -0.7,
      tilt: fromLeft ? -40 : 40,
    });
  });
}

const empty = (): Effect => ({
  washes: [],
  siren: false,
  gates: [],
  particles: [],
  heroes: [],
  rings: [],
  glints: [],
  searchlight: false,
  march: false,
  streamers: false,
});

function buildEffect(tier: GiftTier): Effect {
  const d = tier.durationMs;
  const fx = empty();
  switch (tier.key) {
    case 'ultimate': {
      fx.washes.push({ dir: 'b', stops: ['rgba(252,211,77,0.5)', 'rgba(250,204,21,0.25)', 'rgba(245,158,11,0.5)'], screen: true });
      fx.siren = true;
      fx.particles.push(...fallField(22, COINS, d, 0.055, 0.12), ...fallField(20, CONFETTI, d, 0.04, 0.09));
      const fireworks = [
        [0.24, 0.24, 400],
        [0.76, 0.18, 1200],
        [0.5, 0.12, 2000],
        [0.18, 0.58, 2900],
        [0.82, 0.52, 3800],
      ];
      for (const [x, y, delay] of fireworks) {
        fx.gates.push(delay);
        fx.particles.push(...burstField(8, SPARKS, x, y, 0.26, 0.07, 0, fx.gates.length - 1));
      }
      fx.heroes.push({ glyph: '🪩', size: 0.18, motion: 'swing', dur: d }, { glyph: '🏆', size: 0.42, motion: 'drop', dur: d });
      fx.rings.push({ count: 4, color: 'rgba(253,230,138,0.8)', gate: -1 });
      fx.glints.push({ delay: 600, gate: -1 });
      break;
    }
    case 'gold10':
    case 'gold3': {
      const long = tier.key === 'gold10';
      fx.washes.push({ dir: 'b', stops: ['rgba(252,211,77,0.55)', 'rgba(250,204,21,0.35)', 'rgba(245,158,11,0.55)'], screen: true });
      fx.siren = true;
      fx.particles.push(...fallField(long ? 30 : 18, COINS, d, 0.055, 0.13));
      // The long one earns a searchlight; the 3s one is over before a slow sweep reads.
      fx.searchlight = long;
      fx.glints.push({ delay: 200, gate: -1 });
      break;
    }
    case 'party':
      fx.washes.push({ dir: 'br', stops: ['rgba(217,70,239,0.2)', 'rgba(0,0,0,0)', 'rgba(34,211,238,0.2)'] });
      fx.streamers = true;
      fx.particles.push(...fallField(26, CONFETTI, d, 0.045, 0.1));
      fx.heroes.push({ glyph: '🪩', size: 0.2, motion: 'swing', dur: d });
      break;
    case 'spartans':
      fx.washes.push({ dir: 't', stops: ['rgba(24,24,27,0.55)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0)'] });
      fx.march = true;
      break;
    case 'magicRing':
      fx.washes.push({ dir: 'r', stops: ['rgba(168,85,247,0.25)', 'rgba(232,121,249,0.12)', 'rgba(168,85,247,0.25)'] });
      fx.heroes.push({ glyph: '💍', size: 0.32, motion: 'fly', dur: d });
      fx.gates.push(d * 0.42);
      fx.rings.push({ count: 4, color: 'rgba(216,180,254,0.8)', gate: 0 });
      fx.particles.push(...burstField(14, SPARKS, 0.5, 0.48, 0.58, 0.075, 35, 0));
      break;
    case 'crown':
      fx.washes.push({ dir: 'b', stops: ['rgba(253,224,71,0.25)', 'rgba(0,0,0,0)', 'rgba(245,158,11,0.2)'] });
      fx.heroes.push({ glyph: '👑', size: 0.42, motion: 'drop', dur: d });
      // Gated to the frame the crown lands on.
      fx.gates.push(d * 0.4);
      fx.rings.push({ count: 3, color: 'rgba(254,240,138,0.8)', gate: 0 });
      fx.glints.push({ delay: 0, gate: 0 });
      fx.particles.push(...burstField(10, SPARKS, 0.5, 0.46, 0.45, 0.08, 45, 0));
      break;
    case 'bouquet':
      fx.washes.push({ dir: 'b', stops: ['rgba(251,113,133,0.2)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0)'] });
      fx.particles.push(...flowerCross(), ...fallField(12, ['🌸', '🌺'], d, 0.04, 0.08));
      break;
    case 'chocolate':
      fx.washes.push({ dir: 'b', stops: ['rgba(120,53,15,0.25)', 'rgba(120,53,15,0.25)', 'rgba(120,53,15,0.25)'] });
      fx.heroes.push({ glyph: '🎁', size: 0.34, motion: 'lid', dur: d * 0.72 });
      fx.gates.push(d * 0.3, d * 0.36);
      fx.particles.push(...burstField(14, CHOCOLATES, 0.5, 0.46, 0.62, 0.11, 35, 0), ...fallField(12, CHOCOLATES, d, 0.05, 0.1, 1));
      break;
    case 'heart':
    default:
      fx.washes.push({ dir: 'tr', stops: ['rgba(244,63,94,0.25)', 'rgba(0,0,0,0)', 'rgba(244,114,182,0.15)'] });
      fx.particles.push(...heartSweep());
      break;
  }
  fx.particles.push(...cornerFloat(tier));
  return fx;
}

const effects = new Map<GiftTierKey, Effect>();
function effectFor(tier: GiftTier): Effect {
  let fx = effects.get(tier.key);
  if (!fx) {
    fx = buildEffect(tier);
    effects.set(tier.key, fx);
  }
  return fx;
}

// ─── Keyframes (GiftAnimationOverlay.tsx) ────────────────────────────────────

const RISE_EASE = easeOut;
const SWEEP_EASE = cubicBezier(0.3, 0.1, 0.4, 1);
const BURST_EASE = cubicBezier(0.15, 0.7, 0.3, 1);
const CROSS_EASE = cubicBezier(0.2, 0.6, 0.3, 1);
const HERO_EASE = cubicBezier(0.2, 0.8, 0.3, 1);
const FLY_EASE = cubicBezier(0.3, 0.1, 0.3, 1);
const STREAMER_EASE = cubicBezier(0.3, 0.8, 0.4, 1);

const AT_RISE = [0, 0.12, 0.72, 1];
const AT_SWEEP = [0, 0.12, 0.82, 1];
const AT_FALL = [0, 0.1, 0.86, 1];
const AT_BURST = [0, 0.16, 1];
const AT_CROSS = [0, 0.14, 1];
const FADE_IN_OUT = [0, 1, 1, 0];
const FADE_IN_ONLY = [0, 1, 0];
const AT_BEAT = [0, 0.14, 0.3, 0.46, 0.62, 1];
const BEAT = [1, 1.4, 1.05, 1.25, 1, 1];

const DROP = {
  opAt: [0, 0.16, 0.82, 1],
  op: [0, 1, 1, 0],
  yAt: [0, 0.42, 0.52, 0.62, 0.7, 1],
  y: [-0.7, 0, -0.14, 0, -0.05, 0],
  sAt: [0, 0.42, 0.52, 0.62, 0.7, 0.82, 1],
  s: [0.55, 1, 0.97, 1.05, 1, 1, 1.45],
  rAt: [0, 0.42, 0.52, 0.62, 1],
  r: [-14, 0, 4, 0, 0],
};
const FLY = {
  at: [0, 0.46, 0.6, 1],
  x: [-0.7, 0, 0, 0.7],
  y: [0.2, 0, 0, -0.2],
  s: [0.45, 1.2, 1.2, 0.55],
  r: [-25, 0, 0, 25],
};
const LID = {
  yAt: [0, 0.22, 0.58, 0.72, 1],
  y: [0.2, 0, 0, -0.06, -0.22],
  at: [0, 0.22, 0.36, 0.46, 0.58, 0.72, 1],
  s: [0.35, 1, 1.06, 1.06, 1.2, 1.24, 0.8],
  r: [0, 0, -9, 9, 0, 0, 14],
  opAt: [0, 0.22, 0.72, 1],
};
const SWING = {
  at: [0, 0.16, 0.45, 0.75, 1],
  y: [-1.2, 0, 0, 0, -1.2],
  r: [-20, -20, 20, -14, 0],
  opAt: [0, 0.16, 1],
};
const WASH_AT = [0, 0.12, 0.88, 1];
const STREAMER_COLORS = ['rgba(244,114,182,0.8)', 'rgba(103,232,249,0.8)', 'rgba(252,211,77,0.8)', 'rgba(167,139,250,0.8)'];
const DEG = Math.PI / 180;

/** Progress through one run of an animation with a delay and repeats, or -1 before it starts / after it ends. */
function progress(elapsed: number, delay: number, dur: number, iterations: number): number {
  const t = elapsed - delay;
  if (t < 0) return -1;
  const run = t / dur;
  if (run >= iterations) return 2;
  return run - Math.floor(run);
}

/** `dhg-wash`: in over the first 12%, out over the last. Before its delay, hidden. */
function wash(elapsed: number, delay: number, dur: number, easing: Easing): number {
  const p = (elapsed - delay) / dur;
  if (p < 0 || p > 1) return 0;
  return keyframes(p, WASH_AT, FADE_IN_OUT, easing);
}

/**
 * Paint one celebration over the stage (the tip alert widget's box). `unit` is
 * the caption's pixel scale.
 */
export function paintCelebration(
  ctx: Ctx,
  c: Celebration,
  x: number,
  y: number,
  w: number,
  h: number,
  now: number,
  unit: number,
  sprites: EmojiSprites,
  images: ImageStore,
  text: TextKit,
): void {
  const fx = effectFor(c.tier);
  const d = c.tier.durationMs;
  const elapsed = now - c.start;

  // Washes over the whole stage.
  const washAlpha = wash(elapsed, 0, d, easeInOut);
  if (washAlpha > 0) {
    for (const spec of fx.washes) {
      ctx.globalAlpha = washAlpha;
      if (spec.screen) ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = gradientFor(ctx, spec, x, y, w, h);
      ctx.fillRect(x, y, w, h);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (fx.siren) {
      // `dhg-siren`: a gold glow round the edges, pulsing every 900ms.
      const pulse = 0.2 + 0.6 * (0.5 - 0.5 * Math.cos(((elapsed % 900) / 900) * Math.PI * 2));
      const g = ctx.createRadialGradient(x + w / 2, y + h / 2, Math.min(w, h) * 0.25, x + w / 2, y + h / 2, Math.max(w, h) * 0.75);
      g.addColorStop(0, 'rgba(251,191,36,0)');
      g.addColorStop(1, 'rgba(251,191,36,0.85)');
      ctx.globalAlpha = washAlpha * pulse;
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
    }
  }

  if (fx.streamers) paintStreamers(ctx, x, y, w, h, elapsed, d);
  if (fx.march) paintMarch(ctx, x, y, w, h, elapsed, d, sprites);
  if (fx.searchlight && elapsed <= d) {
    ctx.globalAlpha = 1;
    paintBar(ctx, x, y, w, h, elapsed / d, 0.2, 'rgba(255,255,255,0.45)', 14, 1);
  }

  for (const p of fx.particles) {
    const gate = p.gate >= 0 ? wash(elapsed, fx.gates[p.gate], d, linear) : 1;
    if (gate <= 0) continue;
    paintParticle(ctx, p, x, y, w, h, elapsed, gate, sprites);
  }

  for (const hero of fx.heroes) paintHero(ctx, hero, x, y, w, h, elapsed, sprites);

  for (const ring of fx.rings) {
    const gate = ring.gate >= 0 ? wash(elapsed, fx.gates[ring.gate], d, linear) : 1;
    if (gate > 0) paintRings(ctx, ring, x, y, w, h, elapsed, d, gate);
  }

  for (const glint of fx.glints) {
    // A gated glint starts with the stage, like the DOM's: the gate only lets it show.
    const gate = glint.gate >= 0 ? wash(elapsed, fx.gates[glint.gate], d, linear) : 1;
    const p = (elapsed - glint.delay) / Math.min(d, 1700);
    if (gate > 0 && p >= 0 && p <= 1) {
      ctx.globalAlpha = keyframes(p, GLINT_AT, GLINT_OP, easeInOut) * gate;
      paintBar(ctx, x, y, w, h, easeInOut(p), 0.28, 'rgba(255,255,255,0.7)', -20, 0);
    }
  }

  ctx.globalAlpha = 1;
  paintCaption(ctx, c, x, y, w, h, elapsed, unit, images, text);
}

const GLINT_AT = [0, 0.5, 1];
const GLINT_OP = [0, 0.85, 0];

const gradients = new WeakMap<WashSpec, { key: string; g: CanvasGradient }>();

function gradientFor(ctx: Ctx, spec: WashSpec, x: number, y: number, w: number, h: number): CanvasGradient {
  const key = `${x | 0},${y | 0},${w | 0},${h | 0}`;
  const cached = gradients.get(spec);
  if (cached && cached.key === key) return cached.g;
  const [x0, y0, x1, y1] =
    spec.dir === 'b'
      ? [x, y, x, y + h]
      : spec.dir === 't'
        ? [x, y + h, x, y]
        : spec.dir === 'r'
          ? [x, y, x + w, y]
          : spec.dir === 'tr'
            ? [x, y + h, x + w, y]
            : [x, y, x + w, y + h];
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  spec.stops.forEach((color, i) => g.addColorStop(i / (spec.stops.length - 1), color));
  gradients.set(spec, { key, g });
  return g;
}

function paintParticle(
  ctx: Ctx,
  p: Particle,
  sx: number,
  sy: number,
  w: number,
  h: number,
  elapsed: number,
  gate: number,
  sprites: EmojiSprites,
): void {
  const t = progress(elapsed, p.delay, p.dur, p.iterations);
  if (t < 0 || t > 1) return;
  const size = p.size * w;
  let alpha = 1;
  let tx = 0;
  let ty = 0;
  let scale = 1;
  let rot = 0;
  // Glyph box top-left; transforms turn about its centre.
  const left = sx + p.x * w;
  let top = sy + p.y * h;
  switch (p.motion) {
    case 'rise': {
      top = sy + h - p.y * h - size * 1.15;
      alpha = keyframes(t, AT_RISE, FADE_IN_OUT);
      const e = RISE_EASE(t);
      tx = p.dx * w * e;
      ty = -h * e;
      scale = 0.4 + 0.7 * e;
      rot = p.spin * e;
      break;
    }
    case 'sweep': {
      top = sy + h - p.y * h - size * 1.15;
      alpha = keyframes(t, AT_SWEEP, FADE_IN_OUT);
      const e = SWEEP_EASE(t);
      tx = p.dx * w * e;
      ty = p.dy * h * e;
      scale = 0.4 + 0.65 * e;
      rot = p.spin * e;
      if (p.beat) scale *= keyframes(((elapsed % p.beat) / p.beat), AT_BEAT, BEAT, easeInOut);
      break;
    }
    case 'fall':
      alpha = keyframes(t, AT_FALL, FADE_IN_OUT);
      tx = p.dx * w * t;
      ty = -0.15 * h + 1.25 * h * t;
      rot = p.spin * t;
      break;
    case 'burst': {
      alpha = keyframes(t, AT_BURST, FADE_IN_ONLY);
      const e = BURST_EASE(t);
      tx = p.dx * w * e;
      ty = p.dy * h * e;
      scale = 0.2 + 0.85 * e;
      rot = p.spin * e;
      break;
    }
    case 'cross': {
      alpha = keyframes(t, AT_CROSS, FADE_IN_ONLY);
      const e = CROSS_EASE(t);
      tx = (p.from + (p.dx - p.from) * e) * w;
      ty = (0.3 - 0.55 * e) * h;
      scale = 0.45 + 0.6 * e;
      rot = p.tilt - 2 * p.tilt * e;
      break;
    }
  }
  if (alpha <= 0) return;
  const cx = left + size / 2 + tx;
  const cy = top + (size * 1.15) / 2 + ty;
  ctx.globalAlpha = alpha * gate;
  if (rot) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot * DEG);
    sprites.draw(ctx, p.glyph, 0, 0, size * scale);
    ctx.restore();
  } else {
    sprites.draw(ctx, p.glyph, cx, cy, size * scale);
  }
  ctx.globalAlpha = 1;
}

function paintHero(ctx: Ctx, hero: Hero, sx: number, sy: number, w: number, h: number, elapsed: number, sprites: EmojiSprites): void {
  const p = elapsed / hero.dur;
  if (p < 0 || p > 1) return;
  const size = hero.size * w;
  let cx = sx + w / 2;
  let cy = sy + h / 2;
  let alpha = 1;
  let scale = 1;
  let rot = 0;
  switch (hero.motion) {
    case 'drop':
      alpha = keyframes(p, DROP.opAt, DROP.op, HERO_EASE);
      cy += keyframes(p, DROP.yAt, DROP.y, HERO_EASE) * h;
      scale = keyframes(p, DROP.sAt, DROP.s, HERO_EASE);
      rot = keyframes(p, DROP.rAt, DROP.r, HERO_EASE);
      break;
    case 'fly':
      alpha = keyframes(p, AT_CROSS, FADE_IN_ONLY, FLY_EASE);
      cx += keyframes(p, FLY.at, FLY.x, FLY_EASE) * w;
      cy += keyframes(p, FLY.at, FLY.y, FLY_EASE) * h;
      scale = keyframes(p, FLY.at, FLY.s, FLY_EASE);
      rot = keyframes(p, FLY.at, FLY.r, FLY_EASE);
      break;
    case 'lid':
      alpha = keyframes(p, LID.opAt, FADE_IN_OUT, easeOut);
      cy += keyframes(p, LID.yAt, LID.y, easeOut) * h;
      scale = keyframes(p, LID.at, LID.s, easeOut);
      rot = keyframes(p, LID.at, LID.r, easeOut);
      break;
    case 'swing': {
      // Hangs from the top edge and swings about its own top.
      alpha = keyframes(p, SWING.opAt, FADE_IN_ONLY, easeInOut);
      const top = sy + keyframes(p, SWING.at, SWING.y, easeInOut) * size * 1.15;
      rot = keyframes(p, SWING.at, SWING.r, easeInOut);
      ctx.globalAlpha = alpha;
      ctx.save();
      ctx.translate(cx, top);
      ctx.rotate(rot * DEG);
      sprites.draw(ctx, hero.glyph, 0, (size * 1.15) / 2, size);
      ctx.restore();
      ctx.globalAlpha = 1;
      return;
    }
  }
  if (alpha <= 0) return;
  ctx.globalAlpha = alpha;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot * DEG);
  sprites.draw(ctx, hero.glyph, 0, 0, size * scale);
  ctx.restore();
  ctx.globalAlpha = 1;
}

/** `dhg-shock`: rings a third of the stage wide, growing threefold and fading, staggered 240ms. */
function paintRings(ctx: Ctx, ring: Rings, sx: number, sy: number, w: number, h: number, elapsed: number, d: number, gate: number): void {
  const dur = Math.min(d, 1600);
  ctx.strokeStyle = ring.color;
  for (let i = 0; i < ring.count; i++) {
    const t = elapsed - i * 240;
    if (t < 0) continue;
    const p = easeOut((t % dur) / dur);
    const r = (w * 0.34 * 3 * p) / 2;
    if (r <= 0) continue;
    ctx.globalAlpha = 0.9 * (1 - p) * gate;
    ctx.lineWidth = Math.max(1, w * 0.006) * 3 * p + 0.5;
    ctx.beginPath();
    ctx.arc(sx + w / 2, sy + h / 2, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/**
 * A soft vertical bar raking across the stage: the glint (`p` is its eased
 * progress, skewed) and the gold searchlight (tilted).
 */
function paintBar(ctx: Ctx, sx: number, sy: number, w: number, h: number, p: number, width: number, color: string, angle: number, mode: 0 | 1): void {
  if (p < 0 || p > 1) return;
  const bw = width * w;
  const left = sx + (-0.6 + 2.2 * p) * w;
  ctx.save();
  ctx.beginPath();
  ctx.rect(sx, sy, w, h);
  ctx.clip();
  ctx.translate(left + bw / 2, sy + h / 2);
  if (mode === 1) ctx.rotate(angle * DEG);
  else ctx.transform(1, 0, Math.tan(angle * DEG), 1, 0, 0);
  const g = ctx.createLinearGradient(mode === 1 ? 0 : -bw / 2, mode === 1 ? -h * 0.75 : 0, mode === 1 ? 0 : bw / 2, mode === 1 ? h * 0.75 : 0);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.5, color);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(-bw / 2, -h * 0.75, bw, h * 1.5);
  ctx.restore();
}

function paintStreamers(ctx: Ctx, sx: number, sy: number, w: number, h: number, elapsed: number, d: number): void {
  for (let i = 0; i < 7; i++) {
    const a = jitter(i + 1, 29);
    const p = (elapsed - i * 85) / d;
    if (p < 0 || p > 1) continue;
    const alpha = keyframes(p, STREAMER_AT, FADE_IN_OUT, STREAMER_EASE);
    const len = (0.18 + a * 0.32) * h;
    const grow = keyframes(p, STREAMER_AT, STREAMER_SCALE, STREAMER_EASE);
    const shift = keyframes(p, STREAMER_AT, STREAMER_Y, STREAMER_EASE) * len;
    const sw = w * 0.02;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = STREAMER_COLORS[i % 4];
    roundRectPath(ctx, sx + ((i / 7) * 100 + a * 8) * 0.01 * w, sy + shift, sw, len * grow, 0, sw / 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
const STREAMER_AT = [0, 0.16, 0.84, 1];
const STREAMER_SCALE = [0.2, 1, 1, 1];
const STREAMER_Y = [-1, 0, 0, 0.12];

/** The Spartans: nine shields and swords marching across, each bobbing in step. */
function paintMarch(ctx: Ctx, sx: number, sy: number, w: number, h: number, elapsed: number, d: number, sprites: EmojiSprites): void {
  const fade = wash(elapsed, 0, d, linear);
  if (fade <= 0) return;
  // Dust along the line they march.
  const dust = ctx.createLinearGradient(0, sy + h * 0.74, 0, sy + h * 0.58);
  dust.addColorStop(0, 'rgba(254,243,199,0.25)');
  dust.addColorStop(1, 'rgba(254,243,199,0)');
  ctx.globalAlpha = fade;
  ctx.fillStyle = dust;
  ctx.fillRect(sx, sy + h * 0.58, w, h * 0.16);
  const size = 0.16 * w;
  const gap = 0.015 * w;
  const shift = (-0.55 + 1.7 * clamp01(elapsed / d)) * w;
  for (let i = 0; i < 9; i++) {
    const period = 600 + (i % 3) * 70;
    const t = elapsed - i * 60;
    const step = t < 0 ? 0 : (t % period) / period;
    const bob = keyframes(step, STEP_AT, STEP_Y, easeInOut) * h;
    const rot = keyframes(step, STEP_AT, STEP_R, easeInOut);
    ctx.save();
    ctx.translate(sx + shift + i * (size + gap) + size / 2, sy + h * 0.46 + (size * 1.15) / 2 + bob);
    ctx.rotate(rot * DEG);
    sprites.draw(ctx, i % 3 === 1 ? '🗡️' : '🛡️', 0, 0, size);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}
const STEP_AT = [0, 0.5, 1];
const STEP_Y = [0, -0.035, 0];
const STEP_R = [-5, 5, -5];

const BANNER_AT = [0, 0.14, 0.86, 1];
const BANNER_Y = [0.4, 0, 0, -0.24];
const BANNER_S = [0.92, 1, 1, 0.96];

/** Who paid and how much, in a card along the bottom of the stage (`dhg-banner`). */
function paintCaption(
  ctx: Ctx,
  c: Celebration,
  sx: number,
  sy: number,
  w: number,
  h: number,
  elapsed: number,
  unit: number,
  images: ImageStore,
  text: TextKit,
): void {
  const p = elapsed / c.tier.durationMs;
  if (p < 0 || p > 1) return;
  const alpha = keyframes(p, BANNER_AT, FADE_IN_OUT, easeOut);
  if (alpha <= 0) return;
  const inset = 8 * unit;
  const padX = 12 * unit;
  const padY = 8 * unit;
  const titlePx = 12 * unit;
  const subPx = 11 * unit;
  const lineGap = 2 * unit;
  const innerW = w - inset * 2 - padX * 2;
  if (innerW <= 0) return;

  text.font(fontOf(400, subPx));
  const messageLines = c.message ? text.wrap(c.message, innerW, 2) : NO_LINES;
  const cardH = padY * 2 + titlePx * 1.33 + subPx * 1.4 + (messageLines.length ? lineGap + messageLines.length * subPx * 1.4 : 0);
  const cardW = w - inset * 2;
  const left = sx + inset;
  const top = sy + h - inset - cardH;

  ctx.save();
  ctx.globalAlpha = alpha;
  const scale = keyframes(p, BANNER_AT, BANNER_S, easeOut);
  ctx.translate(left + cardW / 2, top + cardH / 2 + keyframes(p, BANNER_AT, BANNER_Y, easeOut) * cardH);
  ctx.scale(scale, scale);
  ctx.translate(-cardW / 2, -cardH / 2);
  roundRectPath(ctx, 0, 0, cardW, cardH, 12 * unit);
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fill();
  ctx.lineWidth = Math.max(1, unit);
  ctx.strokeStyle = white(0.2);
  ctx.stroke();

  // The painter draws with textBaseline 'middle': each y is a line's middle.
  let y = padY + (titlePx * 1.33) / 2;
  text.font(fontOf(600, titlePx));
  ctx.fillStyle = '#fff';
  ctx.fillText(text.fit(c.title, innerW), padX, y);

  y += (titlePx * 1.33) / 2 + (subPx * 1.4) / 2;
  text.font(fontOf(400, subPx));
  ctx.fillStyle = white(0.75);
  const sub = text.fit(c.sub, innerW - subPx * 1.4);
  ctx.fillText(sub, padX, y);
  drawCoin(ctx, images, padX + text.width(sub) + subPx * 0.25, y, subPx);

  if (messageLines.length) {
    ctx.fillStyle = white(0.85);
    y += lineGap;
    for (const line of messageLines) {
      y += subPx * 1.4;
      ctx.fillText(line, padX, y);
    }
  }
  ctx.restore();
  text.use(ctx);
}
const NO_LINES: string[] = [];

/** How long a celebration stays: its tier's duration, plus the DOM's 250ms grace. */
export const celebrationLife = (tier: GiftTier) => tier.durationMs + 250;
