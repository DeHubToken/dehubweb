/**
 * BadgeAscension — the promotion ceremony.
 *
 * The badge lifts out of the username, evolves in the middle of the screen and
 * flies back to its slot one tier higher. It is a shared-element transition,
 * not an overlay dropped on top: the element that changes is the one the
 * holder was already looking at.
 *
 * Everything is drawn on one canvas from the live badge artwork, which is what
 * makes the shatter beat possible — the wedges are cut out of the outgoing
 * badge's own PNG, so a Crocodile visibly shatters into Crocodile. A
 * pre-rendered clip could not do that, could not carry transparency over the
 * profile behind it, and would go stale the day the artwork is re-exported.
 *
 * Only the ladder's own colour reaches the screen: the motes, bloom and rings
 * are white, so the badge artwork is the one thing on the canvas with any hue.
 *
 * See `lib/badge-motion.ts` for the per-tier numbers and `use-badge-ceremony`
 * for when this is allowed to run.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import dehubCoin from '@/assets/dehub-coin.png';
import { badgeThreshold } from '@/lib/staking-badges';
import { BEATS, badgeMotion, shortDhb } from '@/lib/badge-motion';

interface BadgeAscensionProps {
  /** Tier being left behind. Null when this is the holder's first badge. */
  from: string | null;
  /** Tier being arrived at. */
  to: string;
  /** The badge element on the profile the ceremony flies out of and back to. */
  anchor: HTMLElement | null;
  /** The holder's DHB balance, printed under the threshold. */
  balance?: number | null;
  onDone: () => void;
}

interface Disc {
  x: number;
  y: number;
  r: number;
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const beat = (p: number, b: readonly [number, number]) => clamp01((p - b[0]) / (b[1] - b[0]));
const outCubic = (x: number) => 1 - Math.pow(1 - x, 3);
const inOutCubic = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const outBack = (x: number) => {
  const c = 2.2;
  return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Where the ceremony stops and waits. Everything up to the end of the name
 * beat is timed; the trip home is not played until the holder asks for it.
 */
const HOLD_AT = BEATS.name[1];
/** The trip home, once they do. */
const RETURN_MS = 760;

export function BadgeAscension({ from, to, anchor, balance, onDone }: BadgeAscensionProps) {
  const { t, i18n } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const captionRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  const motionTo = useMemo(() => badgeMotion(to), [to]);
  const motionFrom = useMemo(() => badgeMotion(from), [from]);
  const threshold = useMemo(() => badgeThreshold(to), [to]);

  /**
   * `intro` while the timed beats play, `hold` once it is waiting on the
   * holder, `return` while the badge flies home. A ref rather than state
   * because the animation loop reads it every frame.
   */
  const phaseRef = useRef<'intro' | 'hold' | 'return'>('intro');
  const [holding, setHolding] = useState(false);
  /** True when nothing is animating, so dismissing just closes. */
  const staticRef = useRef(false);

  /**
   * A tap during the ceremony skips to the end of it rather than dismissing:
   * someone who taps early wants the answer sooner, not to lose it. Only a tap
   * once it is holding sends the badge home.
   */
  const requestReturn = useCallback(() => {
    if (phaseRef.current === 'intro') {
      phaseRef.current = 'hold';
      setHolding(true);
      return;
    }
    if (phaseRef.current === 'hold') {
      phaseRef.current = 'return';
      setHolding(false);
      // Nothing to fly home under reduced motion — just close.
      if (staticRef.current) doneRef.current();
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !motionTo) {
      doneRef.current();
      return;
    }

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      // The information, without the journey: the caption stands there and
      // waits to be dismissed like any other. Nothing flies, the badge never
      // leaves its slot.
      captionRef.current?.style.setProperty('--reveal', '1');
      staticRef.current = true;
      phaseRef.current = 'hold';
      setHolding(true);
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      doneRef.current();
      return;
    }

    let W = 0;
    let H = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    /** Hero size is capped: the shipped artwork is 128px and shows its seams
     *  past roughly 1.4x. */
    const hero = (zoom = 1): Disc => ({
      x: W / 2,
      y: H * 0.42,
      r: Math.max(50, Math.min(Math.min(W, H) * 0.155, 88)) * zoom,
    });
    /** Where the badge sits beside the username. Falls back to just under the
     *  hero when the profile header has scrolled out from under us. */
    const slot = (): Disc => {
      const rect = anchor?.getBoundingClientRect();
      if (!rect || rect.width === 0) return { x: W / 2, y: H * 0.18, r: 11 };
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, r: rect.width / 2 };
    };

    const images: Record<string, HTMLImageElement> = {};
    const load = (src: string | null) => {
      if (!src || images[src]) return;
      const im = new Image();
      im.decoding = 'async';
      im.src = src;
      images[src] = im;
    };
    load(motionTo.asset);
    load(motionFrom?.asset ?? null);

    const shardCount = motionFrom?.shards ?? motionTo.shards;
    const shards = Array.from({ length: shardCount }, (_, i) => {
      const n = shardCount;
      const a0 = (i / n) * Math.PI * 2;
      const a1 = ((i + 1) / n) * Math.PI * 2;
      const mid = (a0 + a1) / 2;
      const throwOut = 2.3 + Math.random() * 2.2;
      return {
        a0,
        a1,
        dx: Math.cos(mid) * throwOut,
        dy: Math.sin(mid) * throwOut - 0.3,
        spin: (Math.random() - 0.5) * 5.4,
        lag: Math.random() * 0.18,
        // Shards fall as they fly. Without it they read as a starburst
        // graphic rather than as something breaking.
        grav: 0.9 + Math.random() * 1.4,
      };
    });

    const motes = Array.from({ length: motionTo.motes }, () => ({
      a0: Math.random() * Math.PI * 2,
      spread: 0.4 + Math.random() * 0.8,
      r: 0.7 + Math.random() * 2,
      lag: Math.random() * 0.36,
      swirl: (Math.random() < 0.5 ? -1 : 1) * (0.55 + Math.random() * 1.7),
    }));

    /** Fireworks, top of the ladder only. Positions are fractions of the
     *  viewport so a rotation mid-ceremony does not strand a burst. */
    const sparks = Array.from({ length: motionTo.fx.fireworks }, (_, b) => {
      const bx = 0.18 + Math.random() * 0.64;
      const by = 0.16 + Math.random() * 0.34;
      const at = 0.6 + (b * 0.3) / Math.max(1, motionTo.fx.fireworks) + Math.random() * 0.03;
      const speed = 0.1 + Math.random() * 0.07;
      return Array.from({ length: 22 + Math.round(Math.random() * 14) }, () => {
        const a = Math.random() * Math.PI * 2;
        const v = speed * (0.45 + Math.random() * 0.75);
        return {
          bx,
          by,
          t0: at,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          life: 0.16 + Math.random() * 0.12,
          r: 0.8 + Math.random() * 1.5,
          tw: Math.random() * Math.PI * 2,
        };
      });
    }).flat();

    const embers = motionTo.fx.embers
      ? Array.from({ length: 34 }, () => ({
          x: Math.random(),
          y: 0.2 + Math.random() * 0.5,
          t0: 0.66 + Math.random() * 0.2,
          drift: (Math.random() - 0.5) * 0.05,
          fall: 0.06 + Math.random() * 0.1,
          r: 0.6 + Math.random() * 1.2,
          tw: Math.random() * Math.PI * 2,
        }))
      : [];

    const bloom = (x: number, y: number, r: number, a: number) => {
      if (a <= 0.001) return;
      const g = ctx.createRadialGradient(x, y, r * 0.15, x, y, r * 2.6);
      g.addColorStop(0, `rgba(255,255,255,${0.26 * a})`);
      g.addColorStop(0.45, `rgba(255,255,255,${0.07 * a})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r * 2.6, 0, Math.PI * 2);
      ctx.fill();
    };

    /** The lights going down. Nothing but black, so no tier gains a colour. */
    const vignette = (a: number) => {
      if (a <= 0.001) return;
      const g = ctx.createRadialGradient(W / 2, H * 0.42, Math.min(W, H) * 0.12, W / 2, H * 0.42, Math.max(W, H) * 0.78);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.55, `rgba(0,0,0,${0.45 * a})`);
      g.addColorStop(1, `rgba(0,0,0,${0.92 * a})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    };

    /** Searchlights. Six slow spokes, never bright enough to flatten the badge. */
    const beams = (x: number, y: number, turn: number, a: number) => {
      if (a <= 0.002) return;
      const n = 6;
      const far = Math.max(W, H) * 1.1;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(x, y);
      ctx.rotate(turn * 0.55);
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2;
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, far);
        g.addColorStop(0, `rgba(255,255,255,${0.2 * a})`);
        g.addColorStop(0.35, `rgba(255,255,255,${0.06 * a})`);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, far, ang - 0.045, ang + 0.045);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    };

    /** Anamorphic flare across the badge on the form beat. */
    const streak = (x: number, y: number, r: number, a: number, spread: number) => {
      if (a <= 0.002) return;
      const w = r * 6.5 * spread;
      const h2 = Math.max(1.2, r * 0.055);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, `rgba(255,255,255,${0.75 * a})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - w / 2, y - h2 / 2, w, h2);
      ctx.globalAlpha = 0.5;
      ctx.fillRect(x - w / 6, y - h2 * 1.6, w / 3, h2 * 3.2);
      ctx.restore();
    };

    const drawBadge = (src: string | null, x: number, y: number, r: number, alpha: number, over: number) => {
      const im = src ? images[src] : null;
      if (!im || !im.complete || !im.naturalWidth || alpha <= 0.002) return;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.drawImage(im, x - r, y - r, r * 2, r * 2);
      if (over > 0.002) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = alpha * over * 0.75;
        ctx.drawImage(im, x - r, y - r, r * 2, r * 2);
      }
      ctx.restore();
    };

    /** Arcs rather than slides, so the trip reads as a lift. */
    const travel = (a: Disc, b: Disc, t01: number): Disc => {
      const e = inOutCubic(t01);
      return {
        x: lerp(a.x, b.x, e),
        y: lerp(a.y, b.y, e) - Math.sin(e * Math.PI) * Math.min(70, H * 0.1),
        r: lerp(a.r, b.r, e),
      };
    };

    let raf = 0;
    let start = 0;
    let returnStart = 0;
    let finished = false;
    const total = motionTo.durationMs;

    const finish = () => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(raf);
      if (anchor) anchor.style.opacity = '';
      doneRef.current();
    };

    const frame = (ts: number) => {
      if (!start) start = ts;

      // The ceremony runs to the end of the name beat and then waits. Read at
      // a glance, the last beat used to be gone before anyone finished the
      // line — a tier is earned once and the holder decides when it is over.
      let p: number;
      if (phaseRef.current === 'return') {
        if (!returnStart) returnStart = ts;
        p = HOLD_AT + (1 - HOLD_AT) * clamp01((ts - returnStart) / RETURN_MS);
      } else if (phaseRef.current === 'hold') {
        // Parked on the last frame of the name beat. A tap during the intro
        // lands here too, which is why this is a clamp and not a timer.
        p = HOLD_AT;
      } else {
        p = Math.min(HOLD_AT, (ts - start) / total);
        if (p >= HOLD_AT) {
          phaseRef.current = 'hold';
          setHolding(true);
        }
      }

      ctx.clearRect(0, 0, W, H);

      // The inline badge is hidden while the canvas one is in flight, so the
      // holder never sees two of them.
      if (anchor) anchor.style.opacity = p > 0.02 && p < 0.985 ? '0' : '';

      const lift = beat(p, BEATS.lift);
      const charge = beat(p, BEATS.charge);
      const shatter = beat(p, BEATS.shatter);
      const converge = beat(p, BEATS.converge);
      const form = beat(p, BEATS.form);
      const wave = beat(p, BEATS.wave);
      const back = beat(p, BEATS.ret);

      if (motionTo.fx.vignette) {
        const vg = p < BEATS.charge[1] ? lift * 0.55 + charge * 0.45 : p >= BEATS.ret[0] ? 1 - outCubic(back) : 1;
        vignette(vg * (0.55 + 0.45 * motionTo.intensity));
      }

      // The push-in starts as the badge forms and runs under the name, so the
      // last thing the holder sees is the badge coming toward them.
      const zoom = motionTo.fx.push ? 1 + 0.1 * outCubic(clamp01((p - BEATS.form[0]) / (1 - BEATS.form[0]))) : 1;
      const h = hero(zoom);
      const s = slot();

      if (motionTo.fx.beams) {
        const ba = p >= BEATS.converge[0] ? (p < BEATS.name[1] ? Math.min(1, converge * 1.4) : 1 - back) : 0;
        beams(h.x, h.y, (p * total) / 900, ba * 0.9);
      }

      if (p < BEATS.lift[1]) {
        const a = travel(s, h, lift);
        bloom(a.x, a.y, a.r, 0.1 + 0.25 * lift);
        drawBadge(motionFrom?.asset ?? motionTo.asset, a.x, a.y, a.r, 1, 0.1);
      }

      if (p >= BEATS.charge[0] && p < BEATS.shatter[0]) {
        bloom(h.x, h.y, h.r, 0.32 + 0.85 * charge);
        drawBadge(motionFrom?.asset ?? motionTo.asset, h.x, h.y, h.r * (1 - 0.13 * charge * charge), 1, 0.1 + 0.9 * charge);
      }

      if (shatter > 0 && shatter < 1.0001) {
        bloom(h.x, h.y, h.r, 0.9 * (1 - shatter));
        const src = motionFrom?.asset ?? motionTo.asset;
        const im = src ? images[src] : null;
        if (im && im.complete && im.naturalWidth) {
          for (const sh of shards) {
            const lp = clamp01((shatter - sh.lag) / (1 - sh.lag));
            if (lp <= 0) continue;
            const e = outCubic(lp);
            ctx.save();
            ctx.globalAlpha = (1 - e * e) * 0.95;
            ctx.translate(h.x + sh.dx * h.r * e, h.y + sh.dy * h.r * e + sh.grav * h.r * e * e * 0.9);
            ctx.rotate(sh.spin * e);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, h.r * 1.5, sh.a0, sh.a1);
            ctx.closePath();
            ctx.clip();
            ctx.drawImage(im, -h.r, -h.r, h.r * 2, h.r * 2);
            ctx.restore();
          }
        }
      }

      if (converge > 0 && p < BEATS.form[1]) {
        const far = Math.max(W, H) * 0.8;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = '#ffffff';
        for (const m of motes) {
          const lp = clamp01((converge - m.lag) / (1 - m.lag));
          if (lp <= 0) continue;
          const e = outCubic(lp);
          const d = far * m.spread * (1 - e);
          const a = m.a0 + m.swirl * e * 1.25;
          const fade = lp > 0.9 ? (1 - lp) / 0.1 : 1;
          const mx = h.x + Math.cos(a) * d;
          const my = h.y + Math.sin(a) * d;
          // A short trail rather than a dot: a field of dots reads as noise,
          // the same field with trails reads as motion.
          const eAhead = outCubic(clamp01(lp + 0.035));
          const dAhead = far * m.spread * (1 - eAhead);
          const aAhead = m.a0 + m.swirl * eAhead * 1.25;
          ctx.globalAlpha = 0.9 * fade;
          ctx.strokeStyle = `rgba(255,255,255,${0.55 * fade})`;
          ctx.lineWidth = m.r * 0.9;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(mx, my);
          ctx.lineTo(h.x + Math.cos(aAhead) * dAhead, h.y + Math.sin(aAhead) * dAhead);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(mx, my, m.r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // One frame of white as the new badge lands. Capped well under full
      // brightness — this plays on a phone at night.
      if (motionTo.fx.flash && p >= BEATS.form[0]) {
        const fa = Math.max(0, 1 - (p - BEATS.form[0]) / 0.05);
        if (fa > 0) {
          ctx.fillStyle = `rgba(255,255,255,${0.42 * fa * fa})`;
          ctx.fillRect(0, 0, W, H);
        }
      }

      if (form > 0) {
        bloom(h.x, h.y, h.r, (0.55 + 1.35 * motionTo.intensity) * (1 - Math.min(form, 1) * 0.85));
        drawBadge(motionTo.asset, h.x, h.y, h.r * (0.3 + 0.7 * outBack(form)), Math.min(1, form * 2.4), 1.15 * (1 - form));
        if (motionTo.fx.streak) {
          streak(h.x, h.y, h.r, Math.sin(Math.min(1, form) * Math.PI) * 0.9, 0.4 + form * 1.3);
        }
      }

      if (wave > 0) {
        for (let w = 0; w < motionTo.shockwaves; w++) {
          const wp = clamp01((wave - w * 0.14) / (1 - w * 0.14));
          if (wp <= 0) continue;
          ctx.beginPath();
          ctx.arc(h.x, h.y, h.r * (1.05 + outCubic(wp) * 5), 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255,255,255,${(1 - wp) * 0.42})`;
          ctx.lineWidth = Math.max(0.6, 3 * (1 - wp));
          ctx.stroke();
        }
      }

      if (sparks.length) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = '#ffffff';
        for (const sp of sparks) {
          const age = p - sp.t0;
          if (age <= 0 || age > sp.life) continue;
          const u = age / sp.life;
          const tt = age * 10;
          const x = (sp.bx + sp.vx * tt) * W;
          const y = (sp.by + sp.vy * tt + 0.085 * tt * tt) * H;
          ctx.globalAlpha = (1 - u) * (1 - u) * (0.55 + 0.45 * Math.sin(sp.tw + age * 46));
          ctx.beginPath();
          ctx.arc(x, y, sp.r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      if (embers.length) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = '#ffffff';
        for (const em of embers) {
          const age = p - em.t0;
          if (age <= 0) continue;
          const u = clamp01(age / (1 - em.t0));
          ctx.globalAlpha = (1 - u) * 0.55 * (0.5 + 0.5 * Math.sin(em.tw + age * 22));
          ctx.beginPath();
          ctx.arc((em.x + em.drift * age) * W, (em.y + em.fall * age * 2.2) * H, em.r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      if (p >= BEATS.wave[0] && p < BEATS.ret[0]) {
        drawBadge(motionTo.asset, h.x, h.y, h.r, 1, 0.1);
      }

      if (back > 0) {
        const b = travel(h, s, back);
        bloom(b.x, b.y, b.r, 0.3 * (1 - back));
        drawBadge(motionTo.asset, b.x, b.y, b.r, 1, 0.1 * (1 - back));
      }

      // Caption rises on the name beat, stands through the hold, and clears
      // on the way home.
      const cap = captionRef.current;
      if (cap) {
        if (p >= BEATS.name[0] && p < BEATS.ret[0]) {
          cap.style.setProperty('--reveal', String(outCubic(beat(p, BEATS.name))));
        } else if (p >= BEATS.ret[0]) {
          cap.style.setProperty('--reveal', String(1 - outCubic(back)));
        }
      }
      if (p < 1) {
        raf = requestAnimationFrame(frame);
        return;
      }
      finish();
    };

    raf = requestAnimationFrame(frame);
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(raf);
      if (anchor) anchor.style.opacity = '';
    };
  }, [anchor, motionFrom, motionTo]);

  if (!motionTo) return null;

  const balanceText =
    typeof balance === 'number' && Number.isFinite(balance)
      ? new Intl.NumberFormat(i18n.language).format(Math.floor(balance))
      : null;

  return createPortal(
    <div
      className={
        motionTo.fx.vignette
          ? 'fixed inset-0 z-[120] bg-black/90 backdrop-blur-md'
          : 'fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm'
      }
      role="dialog"
      aria-live="polite"
      aria-label={t('badgeAscension.reached', { tier: motionTo.tier })}
      onClick={requestReturn}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      <div
        ref={captionRef}
        className="absolute inset-x-0 bottom-[14vh] flex flex-col items-center px-5 text-center"
        style={{ '--reveal': 0 } as React.CSSProperties}
      >
        <span
          className={
            motionTo.rank >= 12
              ? 'max-w-[34ch] text-[15px] font-bold uppercase tracking-[0.14em] text-white [text-shadow:0_0_22px_rgba(255,255,255,0.45)] sm:text-[17px]'
              : 'max-w-[34ch] text-[13px] font-bold uppercase tracking-[0.08em] text-zinc-300 sm:text-[15px]'
          }
          style={{ opacity: 'var(--reveal)', transform: 'translateY(calc((1 - var(--reveal)) * 9px))' }}
        >
          {t(motionTo.lineKey)}
        </span>

        <span
          className="mt-1 text-[26px] font-black uppercase leading-none tracking-[-0.02em] text-white sm:text-[40px]"
          style={{ opacity: 'var(--reveal)', transform: 'translateY(calc((1 - var(--reveal)) * 16px))' }}
        >
          {motionTo.tier}
        </span>

        {threshold !== null && (
          <span
            className="mt-2 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-[5px] pl-[7px] text-[15px] font-bold tabular-nums text-white backdrop-blur-xl"
            style={{ opacity: 'var(--reveal)', transform: 'translateY(calc((1 - var(--reveal)) * 12px))' }}
          >
            <img src={dehubCoin} alt="DHB" width={20} height={20} className="block h-5 w-5" />
            {shortDhb(threshold)}
            <span aria-hidden className="h-3.5 w-px bg-white/20" />
            <svg viewBox="0 0 16 16" fill="none" className="block h-3.5 w-3.5" aria-hidden>
              <path d="M2.5 8.5L6 12L13.5 4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        )}

        {balanceText && (
          <span
            className="mt-2 text-[12.5px] tabular-nums text-zinc-500"
            style={{ opacity: 'var(--reveal)', transform: 'translateY(calc((1 - var(--reveal)) * 10px))' }}
          >
            {t('badgeAscension.yourBalance', { amount: balanceText })}
          </span>
        )}

        {/* The way out. It arrives only once the ceremony is waiting, so it
            never competes with the beats for attention. */}
        <button
          type="button"
          id="badge-ascension-continue"
          onClick={(e) => {
            e.stopPropagation();
            requestReturn();
          }}
          className={
            holding
              ? 'pointer-events-auto mt-6 rounded-[10px] border border-white/20 bg-white/10 px-6 py-2.5 text-sm font-bold text-white opacity-100 backdrop-blur-xl transition-[opacity,transform,background-color] duration-300 hover:border-white/40 hover:bg-white/20'
              : 'pointer-events-none mt-6 translate-y-2 rounded-[10px] border border-white/20 bg-white/10 px-6 py-2.5 text-sm font-bold text-white opacity-0 backdrop-blur-xl transition-[opacity,transform,background-color] duration-300'
          }
        >
          {t('badgeAscension.continue')}
        </button>
      </div>
    </div>,
    document.body,
  );
}
