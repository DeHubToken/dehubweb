/**
 * The promotion ceremony, played as the opening of the badge showcase.
 *
 * A click opens the showcase by flying the badge out of the name and waking
 * it up as a sticker. A promotion does the same trip with a detour: the old
 * badge flies out, shivers, bursts into holo glitter, the glitter swirls back
 * in and pops out as the new badge — landing exactly where the sticker will
 * take over, so the sticker's own reveal finishes the moment.
 *
 * The badges are the shell's DOM flyer; this only moves it and draws the
 * glitter, the shattered wedges of the old art and the rings on a 2D canvas
 * laid over the stage. Glitter is the sticker burst's palette — white with a
 * pastel holo tint — so the ceremony and the sticker read as one thing.
 *
 * Per-tier sizing comes from `lib/badge-motion`: more wedges, more glitter,
 * more rings and a longer build the higher the tier.
 */
import type { BadgeMotion } from '@/lib/badge-motion';

export interface AscensionBox {
  x: number;
  y: number;
  size: number;
}

export interface AscensionOptions {
  canvas: HTMLCanvasElement;
  /** The shell's flying badge. */
  flyer: HTMLImageElement;
  /** Where the old badge sits on the page, or null when it is off screen. */
  from: AscensionBox | null;
  /** Where the sticker will sit. Read every frame, so a resize is followed. */
  hero: () => AscensionBox;
  /** The outgoing badge. Null for someone's first badge. */
  fromArt: string | null;
  /** Resting tilt of the sticker, CSS degrees. */
  restTilt: number;
  motion: BadgeMotion;
  /** The flyer's resting filter, restored on the way out. */
  baseFilter: string;
  place: (box: AscensionBox, rotate: number) => void;
  /** The flyer should now show the new badge. */
  onSwap: () => void;
  /** The new badge sits on the hero box: hand over to the sticker. */
  onLanded: () => void;
}

export interface AscensionHandle {
  /** Jump to the landed state. */
  skip: () => void;
  /** Stop and clean up without landing (the showcase is closing). */
  cancel: () => void;
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const outCubic = (x: number) => 1 - Math.pow(1 - x, 3);
const inOutCubic = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const outBack = (x: number, c = 1.9) => 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const TAU = Math.PI * 2;

/** The sticker burst's tint: a cosine rainbow washed toward white. */
function holo(hue: number, wash: number, alpha: number) {
  const ch = (o: number) => Math.round(255 * lerp(1, 0.5 + 0.5 * Math.cos(TAU * (hue + o)), wash));
  return `rgba(${ch(0)},${ch(0.33)},${ch(0.67)},${alpha})`;
}

export function playAscension(o: AscensionOptions): AscensionHandle {
  const { canvas, flyer, motion } = o;
  const ctx = canvas.getContext('2d');
  const i = motion.intensity;

  // Timeline, ms from the start.
  const hasOld = !!o.fromArt;
  const LIFT = hasOld ? 760 : 0;
  const CHARGE = hasOld ? Math.round(460 + 280 * i) : 0;
  const POP = LIFT + CHARGE;
  const OUT = 620;
  const SWIRL = Math.round(820 + 620 * i);
  const FORM = POP + (hasOld ? OUT * 0.55 : 180) + SWIRL;
  const SETTLE = 560;
  const LAND = FORM + SETTLE;

  let W = 0;
  let H = 0;
  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  window.addEventListener('resize', resize);

  const oldImg = new Image();
  if (o.fromArt) {
    oldImg.decoding = 'async';
    oldImg.src = o.fromArt;
  }

  const shardCount = hasOld ? motion.shards : 0;
  const shards = Array.from({ length: shardCount }, (_, k) => {
    const n = shardCount;
    const a0 = (k / n) * TAU;
    const a1 = ((k + 1) / n) * TAU;
    const mid = (a0 + a1) / 2;
    const throwOut = 1.6 + Math.random() * 1.6;
    return {
      a0,
      a1,
      dx: Math.cos(mid) * throwOut,
      dy: Math.sin(mid) * throwOut - 0.35,
      spin: (Math.random() - 0.5) * 6,
      lag: Math.random() * 0.15,
      grav: 0.8 + Math.random() * 1.3,
    };
  });

  // The glitter the old badge bursts into, which is also what the new one
  // is made of: every flake flies out, hangs, then spirals back in.
  const flakes = Array.from({ length: Math.round(70 + i * 130) }, () => ({
    a0: Math.random() * TAU,
    out: 0.7 + Math.random() * 1.9,
    lag: Math.random() * 0.4,
    swirl: (Math.random() < 0.5 ? -1 : 1) * (0.9 + Math.random() * 1.4),
    size: 1.6 + Math.random() * 3.2,
    rot: Math.random() * TAU,
    rotV: (Math.random() - 0.5) * 14,
    hue: Math.random(),
    star: Math.random() < 0.22,
  }));

  // Drawn in from off stage, with trails, so the swirl fills the screen on the
  // big tiers rather than staying a ring around the badge.
  const motes = Array.from({ length: Math.round(motion.motes * 0.6) }, () => ({
    a0: Math.random() * TAU,
    spread: 0.45 + Math.random() * 0.75,
    lag: Math.random() * 0.4,
    swirl: (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 1.5),
    r: 0.7 + Math.random() * 1.6,
    hue: Math.random(),
  }));

  // Glitter bursts around the stage as the top tiers land, then a slow fall.
  const pops = Array.from({ length: motion.fx.fireworks }, (_, b) => {
    const bx = 0.14 + Math.random() * 0.72;
    const by = 0.12 + Math.random() * 0.4;
    const at = FORM + 80 + b * 170 + Math.random() * 60;
    return Array.from({ length: 18 + Math.round(Math.random() * 12) }, () => {
      const a = Math.random() * TAU;
      const v = 90 + Math.random() * 170;
      return {
        bx,
        by,
        at,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: 900 + Math.random() * 700,
        size: 1.4 + Math.random() * 2.4,
        rot: Math.random() * TAU,
        rotV: (Math.random() - 0.5) * 12,
        hue: Math.random(),
      };
    });
  }).flat();

  const fall = motion.fx.embers
    ? Array.from({ length: 40 }, () => ({
        x: Math.random(),
        y: -0.05 - Math.random() * 0.3,
        at: FORM + Math.random() * 500,
        vy: 0.08 + Math.random() * 0.1,
        sway: Math.random() * TAU,
        size: 1.4 + Math.random() * 2.4,
        rot: Math.random() * TAU,
        rotV: (Math.random() - 0.5) * 6,
        hue: Math.random(),
      }))
    : [];
  const TAIL = LAND + (fall.length ? 2600 : pops.length ? 1500 : 600);

  /** One glitter flake: a spinning diamond that catches the light as it turns. */
  const flake = (x: number, y: number, size: number, rot: number, hue: number, alpha: number, star = false) => {
    if (!ctx || alpha <= 0.01) return;
    const glint = 0.35 + 0.65 * Math.pow(Math.abs(Math.sin(rot)), 3);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.globalAlpha = alpha * (0.45 + 0.55 * glint);
    ctx.fillStyle = holo(hue + rot * 0.05, 0.4 + 0.3 * glint, 1);
    if (star) {
      const s = size * (1.4 + glint * 1.6);
      ctx.fillRect(-s, -0.6, s * 2, 1.2);
      ctx.fillRect(-0.6, -s, 1.2, s * 2);
    }
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(size * 0.62, 0);
    ctx.lineTo(0, size);
    ctx.lineTo(-size * 0.62, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  const bloom = (x: number, y: number, r: number, a: number) => {
    if (!ctx || a <= 0.002) return;
    const g = ctx.createRadialGradient(x, y, r * 0.1, x, y, r * 2.4);
    g.addColorStop(0, `rgba(255,255,255,${0.3 * a})`);
    g.addColorStop(0.4, holo(0.6, 0.25, 0.1 * a));
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.4, 0, TAU);
    ctx.fill();
  };

  const setFlyer = (box: AscensionBox, rotate: number, scale: number, glow: number) => {
    const size = box.size * scale;
    o.place({ x: box.x + (box.size - size) / 2, y: box.y + (box.size - size) / 2, size }, rotate);
    flyer.style.filter =
      glow > 0.01
        ? `${o.baseFilter} brightness(${1 + glow * 0.9}) drop-shadow(0 0 ${Math.round(6 + glow * 26)}px rgba(255,255,255,${0.35 + glow * 0.5}))`
        : o.baseFilter;
  };

  let raf = 0;
  let start = 0;
  let landed = false;
  let swapped = false;
  let stopped = false;

  const land = () => {
    if (landed) return;
    landed = true;
    if (!swapped) {
      swapped = true;
      o.onSwap();
    }
    flyer.style.visibility = '';
    setFlyer(o.hero(), o.restTilt, 1, 0);
    o.onLanded();
  };

  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    ctx?.clearRect(0, 0, W, H);
    flyer.style.visibility = '';
    flyer.style.filter = o.baseFilter;
  };

  if (!hasOld) flyer.style.visibility = 'hidden';

  const frame = (now: number) => {
    if (!start) start = now;
    const t = now - start;
    const hero = o.hero();
    const cx = hero.x + hero.size / 2;
    const cy = hero.y + hero.size / 2;
    const R = hero.size / 2;
    if (ctx) ctx.clearRect(0, 0, W, H);

    /* ---- the old badge: out of the name, then a shiver as it charges ---- */
    if (hasOld && t < POP) {
      const from = o.from ?? { x: cx - R * 0.2, y: cy - R * 0.2, size: R * 0.4 };
      const target: AscensionBox = { x: cx - R * 0.62, y: cy - R * 0.62, size: R * 1.24 };
      if (t < LIFT) {
        const p = t / LIFT;
        const move = outCubic(p);
        const grow = outBack(p, 1.7);
        const arc = Math.min(80, H * 0.1);
        setFlyer(
          {
            x: lerp(from.x, target.x, move),
            y: lerp(from.y, target.y, move) - Math.sin(p * Math.PI) * arc,
            size: lerp(from.size, target.size, grow),
          },
          o.restTilt + (1 - move) * -18,
          1,
          0,
        );
      } else {
        const c = (t - LIFT) / CHARGE;
        const shake = Math.sin(t * 0.06) * c * c * (4 + 6 * i);
        setFlyer(target, o.restTilt + shake, 1 + 0.08 * Math.sin(c * Math.PI * 3) * c - 0.1 * c * c, c);
        bloom(cx, cy, R * 0.62, c * 0.9);
        // A few flakes already lifting off the rim.
        for (let k = 0; k < 14; k++) {
          const a = (k / 14) * TAU + t * 0.0016;
          const d = R * (0.7 + 0.25 * Math.sin(t * 0.01 + k));
          flake(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1.8, t * 0.01 + k, k / 14, c * 0.9, k % 4 === 0);
        }
      }
    }

    if (hasOld && t >= POP && flyer.style.visibility !== 'hidden' && t < FORM) {
      flyer.style.visibility = 'hidden';
      flyer.style.filter = o.baseFilter;
    }
    if (!swapped && t >= POP) {
      swapped = true;
      o.onSwap();
    }

    if (ctx) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      /* ---- the pop: wedges of the old art, and a flash of glitter ---- */
      if (hasOld && t >= POP && t < POP + OUT * 1.4) {
        const k = clamp01((t - POP) / (OUT * 1.4));
        bloom(cx, cy, R * 0.7, (1 - k) * 1.1);
        if (oldImg.complete && oldImg.naturalWidth) {
          ctx.globalCompositeOperation = 'source-over';
          const r = R * 0.62;
          for (const sh of shards) {
            const lp = clamp01((k - sh.lag) / (1 - sh.lag));
            if (lp <= 0) continue;
            const e = outCubic(lp);
            ctx.save();
            ctx.globalAlpha = (1 - e * e) * 0.95;
            ctx.translate(cx + sh.dx * r * e, cy + sh.dy * r * e + sh.grav * r * e * e);
            ctx.rotate((o.restTilt * Math.PI) / 180 + sh.spin * e);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, r * 1.5, sh.a0, sh.a1);
            ctx.closePath();
            ctx.clip();
            ctx.drawImage(oldImg, -r, -r, r * 2, r * 2);
            ctx.restore();
          }
          ctx.globalCompositeOperation = 'lighter';
        }
      }

      /* ---- glitter: out, hang, spiral home ---- */
      const burstAt = hasOld ? POP : 0;
      const swirlAt = hasOld ? POP + OUT * 0.55 : 180;
      if (t >= burstAt && t < FORM + 120) {
        for (const f of flakes) {
          const outK = hasOld ? outCubic(clamp01((t - burstAt) / OUT)) : 1;
          const sk = clamp01((t - swirlAt - f.lag * SWIRL * 0.5) / (SWIRL * (1 - f.lag * 0.5)));
          const inK = inOutCubic(sk);
          const d = R * f.out * outK * (1 - inK);
          const a = f.a0 + f.swirl * inK * 2.4 + (hasOld ? 0 : t * 0.0004);
          // First badge: the glitter fades in where it hangs instead of bursting.
          const appear = hasOld ? 1 : clamp01(t / 260);
          const near = d < R * 0.18 ? d / (R * 0.18) : 1;
          const late = t > FORM ? 1 - (t - FORM) / 120 : 1;
          flake(cx + Math.cos(a) * d, cy + Math.sin(a) * d, f.size, f.rot + (t / 1000) * f.rotV, f.hue, appear * near * late, f.star);
        }
        // The swirl gathers light in the middle before the badge appears.
        const gather = clamp01((t - swirlAt) / SWIRL);
        bloom(cx, cy, R * (0.4 + 0.5 * gather), gather * gather * (0.8 + 0.6 * i));
      }

      if (motes.length && t >= swirlAt && t < FORM) {
        const far = Math.max(W, H) * 0.75;
        ctx.lineCap = 'round';
        for (const m of motes) {
          const lp = clamp01((t - swirlAt - m.lag * SWIRL * 0.6) / (SWIRL * (1 - m.lag * 0.6)));
          if (lp <= 0) continue;
          const e = outCubic(lp);
          const ea = outCubic(clamp01(lp + 0.04));
          const d = far * m.spread * (1 - e);
          const da = far * m.spread * (1 - ea);
          const a = m.a0 + m.swirl * e * 1.3;
          const aa = m.a0 + m.swirl * ea * 1.3;
          const fade = lp > 0.9 ? (1 - lp) / 0.1 : Math.min(1, lp * 4);
          ctx.globalAlpha = 0.8 * fade;
          ctx.strokeStyle = holo(m.hue, 0.3, 0.6);
          ctx.lineWidth = m.r;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d);
          ctx.lineTo(cx + Math.cos(aa) * da, cy + Math.sin(aa) * da);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      /* ---- the new badge lands: rings, a glint, a soft flash ---- */
      if (t >= FORM) {
        const k = clamp01((t - FORM) / SETTLE);
        if (motion.fx.flash && t < FORM + 260) {
          const fa = 1 - (t - FORM) / 260;
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = `rgba(255,255,255,${0.22 * fa * fa})`;
          ctx.fillRect(0, 0, W, H);
          ctx.globalCompositeOperation = 'lighter';
        }
        bloom(cx, cy, R, (1 - k) * (0.9 + 0.9 * i));
        for (let w = 0; w < motion.shockwaves; w++) {
          const wp = clamp01(((t - FORM) / 900 - w * 0.16) / (1 - w * 0.16));
          if (wp <= 0 || wp >= 1) continue;
          ctx.globalAlpha = 1;
          ctx.strokeStyle = holo(0.1 + w * 0.2 + wp * 0.4, 0.35, (1 - wp) * 0.5);
          ctx.lineWidth = Math.max(0.6, 3 * (1 - wp));
          ctx.beginPath();
          ctx.arc(cx, cy, R * (0.9 + outCubic(wp) * 3.6), 0, TAU);
          ctx.stroke();
        }
        // A light sweep across the new badge, like tilting a foil sticker.
        if (motion.fx.streak && k < 1) {
          const sweep = inOutCubic(clamp01((t - FORM - 120) / 520));
          if (sweep > 0 && sweep < 1) {
            const w = R * 2.4;
            const x = cx - w / 2 + sweep * w;
            const g = ctx.createLinearGradient(x - R * 0.5, 0, x + R * 0.5, 0);
            g.addColorStop(0, 'rgba(255,255,255,0)');
            g.addColorStop(0.5, `rgba(255,255,255,${0.5 * Math.sin(sweep * Math.PI)})`);
            g.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = g;
            ctx.save();
            ctx.beginPath();
            ctx.arc(cx, cy, R * 0.98, 0, TAU);
            ctx.clip();
            ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
            ctx.restore();
          }
        }
      }

      for (const s of pops) {
        const age = t - s.at;
        if (age <= 0 || age > s.life) continue;
        const u = age / s.life;
        const sec = age / 1000;
        const x = s.bx * W + s.vx * sec * (1 - u * 0.4);
        const y = s.by * H + s.vy * sec * (1 - u * 0.4) + 140 * sec * sec;
        flake(x, y, s.size, s.rot + sec * s.rotV, s.hue, (1 - u) * (1 - u));
      }

      for (const e of fall) {
        const age = t - e.at;
        if (age <= 0) continue;
        const sec = age / 1000;
        const y = (e.y + e.vy * sec) * H;
        const x = (e.x + Math.sin(e.sway + sec * 1.7) * 0.012) * W;
        const fade = Math.min(1, sec * 2) * clamp01((TAIL - t) / 800);
        flake(x, y, e.size, e.rot + sec * e.rotV, e.hue, fade * 0.8);
      }

      ctx.restore();
    }

    if (t >= FORM && !landed) {
      const k = clamp01((t - FORM) / SETTLE);
      flyer.style.visibility = '';
      setFlyer(hero, o.restTilt + (1 - outCubic(k)) * 24, 0.25 + 0.75 * outBack(k), (1 - k) * 1.2);
      if (k >= 1) land();
    }

    if (t < TAIL) raf = requestAnimationFrame(frame);
    else stop();
  };

  raf = requestAnimationFrame(frame);

  return {
    skip: () => {
      if (landed) return;
      land();
      stop();
    },
    cancel: stop,
  };
}
