/**
 * Comic posts shown as collector cards.
 *
 * Every page of a comic is a foil card: the art, its caption under it and the
 * page number on top. The card leans toward the finger (or the mouse) on a
 * spring, the holo layer follows the light, sideways swipes deal the next card
 * and a tap flips it over to the caption and alt text in full.
 *
 * The feed shows the top card with the next two fanned behind it; tapping
 * opens the post. The post page adds the hand of every page under the card
 * and a "Read all pages" view that lists the pages in order.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cdnImage } from '@/lib/media-url';
import { cn } from '@/lib/utils';
import '@/styles/comic.css';

export interface ComicDeckProps {
  images: string[];
  captions?: string[];
  descriptions?: string[];
  title?: string;
  /** Feed: a tap on the card opens the post. Leave out on the post page. */
  onOpen?: () => void;
  /** Post page: the hand of pages and the full read. */
  full?: boolean;
  aboveFold?: boolean;
}

const K = 160;
const C = 14;
const MAX_TILT = 14;

function prefersReducedMotion() {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export const ComicDeck = memo(function ComicDeck({ images, captions, descriptions, title, onOpen, full = false, aboveFold = false }: ComicDeckProps) {
  const { t } = useTranslation();
  const total = images.length;
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [reading, setReading] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const floorRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Spring state: tilt x/y, sideways throw, and the flip angle.
  const sim = useRef({ rx: 0, ry: 0, vx: 0, vy: 0, tx: 0, ty: 0, dx: 0, vdx: 0, tdx: 0, flip: 0, vflip: 0, tflip: 0, lx: 50, ly: 30 });
  const raf = useRef<number>();
  const last = useRef(0);

  const paint = useCallback(() => {
    const s = sim.current;
    const el = cardRef.current;
    if (!el) return;
    el.style.transform = `translateX(${s.dx}px) rotateZ(${s.dx / 30}deg) rotateX(${s.rx}deg) rotateY(${s.ry + s.flip}deg)`;
    el.style.setProperty('--lx', `${s.lx}%`);
    el.style.setProperty('--ly', `${s.ly}%`);
    el.style.setProperty('--hx', `${50 + s.ry * 3}%`);
    el.style.setProperty('--hy', `${50 - s.rx * 3}%`);
    el.style.setProperty('--ho', String(0.22 + Math.min(0.45, (Math.abs(s.rx) + Math.abs(s.ry)) / 40)));
    if (floorRef.current) {
      floorRef.current.style.transform = `translateX(${s.dx + s.ry * 1.2}px) scaleX(${1 - Math.abs(s.ry) / 90})`;
    }
  }, []);

  const step = useCallback((now: number) => {
    const s = sim.current;
    const dt = Math.min(0.032, (now - (last.current || now)) / 1000 || 0.016);
    last.current = now;
    const spring = (x: number, v: number, target: number) => {
      const a = -K * (x - target) - C * v;
      const nv = v + a * dt;
      return [x + nv * dt, nv] as const;
    };
    [s.rx, s.vx] = spring(s.rx, s.vx, s.tx);
    [s.ry, s.vy] = spring(s.ry, s.vy, s.ty);
    [s.dx, s.vdx] = spring(s.dx, s.vdx, s.tdx);
    [s.flip, s.vflip] = spring(s.flip, s.vflip, s.tflip);
    paint();
    const moving = Math.abs(s.vx) + Math.abs(s.vy) + Math.abs(s.vdx) + Math.abs(s.vflip) > 0.05
      || Math.abs(s.rx - s.tx) + Math.abs(s.ry - s.ty) + Math.abs(s.dx - s.tdx) + Math.abs(s.flip - s.tflip) > 0.05;
    raf.current = moving ? requestAnimationFrame(step) : undefined;
  }, [paint]);

  const kick = useCallback(() => {
    if (raf.current) return;
    if (prefersReducedMotion()) {
      const s = sim.current;
      s.rx = s.tx; s.ry = s.ty; s.dx = s.tdx; s.flip = s.tflip;
      paint();
      return;
    }
    last.current = 0;
    raf.current = requestAnimationFrame(step);
  }, [paint, step]);

  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current); }, []);

  useEffect(() => {
    sim.current.tflip = flipped ? 180 : 0;
    kick();
  }, [flipped, kick]);

  const go = useCallback((to: number) => {
    const next = Math.max(0, Math.min(total - 1, to));
    setFlipped(false);
    setIndex(next);
  }, [total]);

  // Pointer: lean toward the finger, swipe sideways for the next card, tap to open or flip.
  const drag = useRef<{ x: number; y: number; t: number; id: number; sideways: boolean } | null>(null);
  const lean = (clientX: number, clientY: number) => {
    const el = cardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    const py = Math.max(0, Math.min(1, (clientY - r.top) / r.height));
    const s = sim.current;
    s.ty = (px - 0.5) * 2 * MAX_TILT;
    s.tx = -(py - 0.5) * 2 * MAX_TILT;
    s.lx = px * 100;
    s.ly = py * 100;
    kick();
  };
  const settle = () => {
    const s = sim.current;
    s.tx = 0; s.ty = 0; s.tdx = 0;
    kick();
  };

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, sideways: false };
    lean(e.clientX, e.clientY);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) {
      if (e.pointerType === 'mouse') lean(e.clientX, e.clientY);
      return;
    }
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.sideways && total > 1 && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
      d.sideways = true;
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    }
    if (d.sideways) {
      const edge = (dx > 0 && index === 0) || (dx < 0 && index === total - 1);
      sim.current.tdx = edge ? dx / 4 : dx;
    }
    lean(e.clientX, e.clientY);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (d.sideways) {
      if (dx < -60 && index < total - 1) go(index + 1);
      else if (dx > 60 && index > 0) go(index - 1);
      // The new card arrives from the side it was thrown toward.
      sim.current.dx = sim.current.dx > 0 ? -40 : sim.current.dx < 0 ? 40 : 0;
      settle();
      return;
    }
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8 && performance.now() - d.t < 450) {
      if (onOpen) onOpen();
      else setFlipped(f => !f);
    }
    if (e.pointerType !== 'mouse') settle();
  };
  const onPointerCancel = () => { drag.current = null; settle(); };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(index + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(index - 1); }
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (onOpen) onOpen(); else setFlipped(f => !f);
    }
  };

  const caption = captions?.[index]?.trim() || '';
  const alt = descriptions?.[index]?.trim() || '';
  const pageLabel = `${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
  // The art box takes the cover's shape (kept between tall and wide), so a
  // landscape strip is not letterboxed in a portrait card.
  const [ratio, setRatio] = useState(0.75);
  useEffect(() => {
    const img = new Image();
    img.onload = () => { if (img.naturalWidth && img.naturalHeight) setRatio(Math.max(0.62, Math.min(1.5, img.naturalWidth / img.naturalHeight))); };
    img.src = cdnImage(images[0], { width: 720 }) || '';
  }, [images]);

  const behind = useMemo(() => [index + 1, index + 2].filter(i => i < total), [index, total]);

  if (reading) {
    return (
      <div data-comic className="relative px-1 pb-2">
        <div className="flex items-center justify-between gap-2 py-2">
          <p className="min-w-0 truncate text-sm font-semibold">{title || t('comic.title', { defaultValue: 'Comic' })}</p>
          <button type="button" className="shrink-0 rounded-full border border-border px-3 py-1 text-xs font-medium" onClick={() => setReading(false)}>
            {t('comic.cards', { defaultValue: 'Back to cards' })}
          </button>
        </div>
        <ol className="space-y-5">
          {images.map((src, i) => (
            <li key={`${src}-${i}`}>
              <img
                src={cdnImage(src, { width: 1080 })}
                alt={descriptions?.[i] || ''}
                loading={i < 2 ? 'eager' : 'lazy'}
                decoding="async"
                className="w-full rounded-lg bg-black/40"
              />
              <div className="mt-2 flex gap-2 text-sm leading-snug">
                <span className="shrink-0 font-mono text-xs text-muted-foreground pt-0.5">{String(i + 1).padStart(2, '0')}</span>
                {captions?.[i]?.trim() ? <p style={{ fontFamily: 'var(--comic-serif)', fontStyle: 'italic' }}>{captions[i]}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      data-comic
      data-no-swipe={total > 1 ? '' : undefined}
      className={cn('relative flex flex-col items-center select-none pt-11', full ? 'pb-3' : 'pb-5')}
      style={{ perspective: 1100 }}
    >
      <div className="comic-chip top-2 left-2">
        <span aria-hidden>✦</span>
        {t('comic.chip', { defaultValue: 'Comic · {{count}} pages', count: total })}
      </div>

      <div className="relative" style={{ width: ratio > 1 ? 'min(88%, 420px)' : 'min(78%, 340px)' }}>
        {/* The next cards in the deck, fanned behind. */}
        {behind.map((i, n) => (
          <div
            key={i}
            aria-hidden
            className="comic-side comic-front comic-ghost"
            style={{ position: 'absolute', inset: 0, transform: `translate(${(n + 1) * 14}px, ${(n + 1) * 6}px) rotate(${(n + 1) * 4}deg) scale(${1 - (n + 1) * 0.04})`, zIndex: -1 - n, filter: `brightness(${0.75 - n * 0.15})` }}
          >
            <div className="comic-in">
              <div className="comic-art" style={{ position: 'absolute', inset: 8, margin: 0 }}>
                <img src={cdnImage(images[i], { width: 360 })} alt="" loading="lazy" decoding="async" />
              </div>
            </div>
          </div>
        ))}

        <div ref={floorRef} className="comic-floor" style={{ left: '8%', right: '8%', bottom: -18, height: 28, zIndex: -5 }} />

        <div
          ref={cardRef}
          role="button"
          tabIndex={0}
          aria-label={onOpen
            ? t('comic.open', { defaultValue: 'Open comic, page {{page}} of {{total}}', page: index + 1, total })
            : t('comic.flip', { defaultValue: 'Page {{page}} of {{total}}. Tap to flip', page: index + 1, total })}
          className="comic-card cursor-pointer outline-none"
          style={{ touchAction: 'pan-y' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onPointerLeave={(e) => { if (e.pointerType === 'mouse' && !drag.current) settle(); }}
          onKeyDown={onKeyDown}
        >
          <div className="comic-side comic-front">
            <div className="comic-in">
              <div className="comic-top">
                <em>{title || t('comic.title', { defaultValue: 'Comic' })}</em>
                <span>{pageLabel}</span>
              </div>
              <div className="comic-art" style={{ aspectRatio: String(ratio) }}>
                <img
                  key={images[index]}
                  src={cdnImage(images[index], { width: 720 })}
                  alt={alt}
                  draggable={false}
                  loading={aboveFold && index === 0 ? 'eager' : 'lazy'}
                  decoding="async"
                />
                {alt ? <span className="comic-alt">ALT</span> : null}
              </div>
              <div className="comic-cap">{caption}</div>
            </div>
            <div className="comic-holo" />
            <div className="comic-sheen" />
          </div>
          <div className="comic-side comic-back" aria-hidden={!flipped}>
            <span className="comic-lab">{t('comic.page', { defaultValue: 'Page {{page}}', page: index + 1 })}</span>
            <h3>{caption || title || t('comic.title', { defaultValue: 'Comic' })}</h3>
            {alt ? (
              <>
                <span className="comic-lab">{t('comic.alt', { defaultValue: 'Alt text' })}</span>
                <p>{alt}</p>
              </>
            ) : null}
            <div className="comic-ft"><span>{title}</span><span>{pageLabel}</span></div>
            <div className="comic-holo" />
          </div>
        </div>
      </div>

      {/* Preload the next page so the deal is instant. */}
      {index + 1 < total ? <link rel="prefetch" as="image" href={cdnImage(images[index + 1], { width: 720 })} /> : null}

      {full && total > 1 ? (
        <div className="relative mt-7 h-12 w-full max-w-[360px]" role="tablist" aria-label={t('comic.pages', { defaultValue: 'Pages' })}>
          {images.map((src, i) => {
            const mid = (total - 1) / 2;
            const angle = (i - mid) * Math.min(8, 110 / total);
            const shift = (i - mid) * Math.min(24, 300 / total);
            const lift = i === index ? -10 : 0;
            return (
              <button
                key={`${src}-${i}`}
                type="button"
                role="tab"
                aria-current={i === index}
                aria-label={t('comic.goto', { defaultValue: 'Page {{page}}', page: i + 1 })}
                className="comic-mini"
                style={{ transform: `translateX(${shift}px) rotate(${angle}deg) translateY(${lift}px)`, zIndex: i === index ? total : i }}
                onClick={() => go(i)}
              >
                <img src={cdnImage(src, { width: 96 })} alt="" loading="lazy" decoding="async" />
              </button>
            );
          })}
        </div>
      ) : null}

      {full ? (
        <button
          type="button"
          className="mt-3 rounded-full border border-border px-4 py-1.5 text-xs font-medium"
          onClick={() => setReading(true)}
        >
          {t('comic.readAll', { defaultValue: 'Read all pages' })}
        </button>
      ) : null}
    </div>
  );
});
