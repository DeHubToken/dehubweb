import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { POST_BACKGROUNDS, postBgById, type PostBg } from '@/lib/post-backgrounds';
import '@/styles/post-backgrounds.css';

/** The backdrop for the profile being viewed (null = plain posts). */
export const ProfilePostBgContext = createContext<PostBg | null>(null);
export const useProfilePostBg = () => useContext(ProfilePostBgContext);

/** Phones with little memory get a still frame instead of motion. */
const lowEndDevice = (() => {
  if (typeof navigator === 'undefined') return false;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return typeof mem === 'number' && mem > 0 && mem < 3;
})();

/**
 * Props that turn any card element into a backdrop host. Spread on the
 * element that wraps a text post, and render <PostBgLayer> as its first child.
 */
export function postBgHostProps(bg: PostBg | null): Record<string, string> {
  if (!bg) return {};
  return { 'data-pbg': bg.id, 'data-pbg-tone': bg.tone, 'data-pbg-kind': bg.kind };
}

let sharedObserver: IntersectionObserver | null = null;
function observe(el: Element) {
  if (typeof IntersectionObserver === 'undefined') return () => {};
  if (!sharedObserver) {
    sharedObserver = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) e.target.removeAttribute('data-pbg-off');
        else e.target.setAttribute('data-pbg-off', '');
      }),
      { rootMargin: '120px' },
    );
  }
  sharedObserver.observe(el);
  return () => sharedObserver?.unobserve(el);
}

export function PostBgLayer({ bg }: { bg: PostBg | null }) {
  const ref = useRef<HTMLSpanElement>(null);
  const moving = bg?.kind === 'moving';
  useEffect(() => {
    if (!moving || !ref.current) return;
    return observe(ref.current);
  }, [moving]);
  if (!bg) return null;
  return (
    <span
      ref={ref}
      aria-hidden
      className={`pbg pbg-${bg.id}`}
      data-pbg-off={moving ? '' : undefined}
      data-pbg-still={moving && lowEndDevice ? '' : undefined}
    />
  );
}

/**
 * Long-press (450 ms) on the owner's header opens the picker. A small ring
 * fills under the finger while holding. Right-click opens it straight away on
 * a computer. The click that ends a completed hold is swallowed so it does not
 * also open the avatar or a link underneath.
 */
export function usePostBgHold(enabled: boolean, onOpen: () => void) {
  const [ring, setRing] = useState<{ x: number; y: number; p: number } | null>(null);
  const state = useRef<{ t0: number; x: number; y: number; raf: number; fired: boolean; id: number | null }>({ t0: 0, x: 0, y: 0, raf: 0, fired: false, id: null });
  const hostRef = useRef<HTMLDivElement | null>(null);

  const stop = useCallback(() => {
    cancelAnimationFrame(state.current.raf);
    state.current.id = null;
    setRing(null);
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!enabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const host = hostRef.current;
    if (!host) return;
    const box = host.getBoundingClientRect();
    const s = state.current;
    s.t0 = performance.now();
    s.x = e.clientX;
    s.y = e.clientY;
    s.fired = false;
    s.id = e.pointerId;
    const lx = e.clientX - box.left;
    const ly = e.clientY - box.top;
    const tick = () => {
      if (s.id === null) return;
      const p = Math.min(1, (performance.now() - s.t0) / 450);
      // Hide the ring for the first 120 ms so a normal tap never flashes it.
      setRing(p > 0.25 ? { x: lx, y: ly, p } : null);
      if (p >= 1) {
        s.fired = true;
        stop();
        try { navigator.vibrate?.(12); } catch { /* not supported */ }
        onOpen();
        return;
      }
      s.raf = requestAnimationFrame(tick);
    };
    s.raf = requestAnimationFrame(tick);
  }, [enabled, onOpen, stop]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const s = state.current;
    if (s.id === null || e.pointerId !== s.id) return;
    if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > 10) stop();
  }, [stop]);

  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (state.current.fired) {
      e.preventDefault();
      e.stopPropagation();
      state.current.fired = false;
    }
  }, []);

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    if (!enabled) return;
    // Keep the browser menu on links and images people may want to copy.
    if ((e.target as HTMLElement).closest('a, input, textarea')) return;
    e.preventDefault();
    stop();
    onOpen();
  }, [enabled, onOpen, stop]);

  const handlers = enabled
    ? {
        onPointerDown,
        onPointerMove,
        onPointerUp: stop,
        onPointerCancel: stop,
        onPointerLeave: stop,
        onClickCapture,
        onContextMenu,
        style: { WebkitTouchCallout: 'none' } as React.CSSProperties,
      }
    : {};

  const ringEl = ring ? (
    <span className="pbg-hold-ring" style={{ left: ring.x, top: ring.y, ['--p' as string]: ring.p } as React.CSSProperties} aria-hidden />
  ) : null;

  return { hostRef, handlers, ringEl };
}

const STILL = POST_BACKGROUNDS.filter((b) => b.kind === 'still');
const MOVING = POST_BACKGROUNDS.filter((b) => b.kind === 'moving');

export interface PostBgPickerProps {
  open: boolean;
  current: PostBg | null;
  name: string;
  handle: string;
  avatarUrl?: string;
  /** The owner's newest text post, shown on the preview. */
  sampleText?: string;
  saving?: boolean;
  onCancel: () => void;
  onSave: (id: string | null) => void;
}

/**
 * Full-screen preview of a text post on the chosen backdrop with one
 * swipeable strip of all 20 (None, still ones, a divider, moving ones).
 * Whatever sits in the middle of the strip is applied live; Done saves.
 * On a computer it is a centred panel and the arrow keys step through.
 */
export function PostBgPicker({ open, current, name, handle, avatarUrl, sampleText, saving, onCancel, onSave }: PostBgPickerProps) {
  const { t } = useTranslation();
  const [sel, setSel] = useState<string | null>(current?.id ?? null);
  const stripRef = useRef<HTMLDivElement>(null);
  const settle = useRef<number>(0);
  const order = useMemo(() => [null, ...STILL.map((b) => b.id), ...MOVING.map((b) => b.id)] as (string | null)[], []);

  const centre = useCallback((id: string | null, smooth: boolean) => {
    const strip = stripRef.current;
    const tile = strip?.querySelector<HTMLElement>(`[data-pbg-id="${id ?? ''}"]`);
    if (!strip || !tile) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    strip.scrollTo({ left: tile.offsetLeft - strip.clientWidth / 2 + tile.offsetWidth / 2, behavior: smooth && !reduce ? 'smooth' : 'auto' });
  }, []);

  useEffect(() => {
    if (!open) return;
    setSel(current?.id ?? null);
    const id = requestAnimationFrame(() => centre(current?.id ?? null, false));
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { cancelAnimationFrame(id); document.body.style.overflow = prev; };
  }, [open, current, centre]);

  const onScroll = () => {
    window.clearTimeout(settle.current);
    settle.current = window.setTimeout(() => {
      const strip = stripRef.current;
      if (!strip) return;
      const mid = strip.scrollLeft + strip.clientWidth / 2;
      let best: HTMLElement | null = null;
      let dist = Infinity;
      strip.querySelectorAll<HTMLElement>('[data-pbg-id]').forEach((el) => {
        const d = Math.abs(el.offsetLeft + el.offsetWidth / 2 - mid);
        if (d < dist) { dist = d; best = el; }
      });
      const id = (best as HTMLElement | null)?.dataset.pbgId || null;
      setSel((cur) => (cur === id ? cur : id));
    }, 90);
  };

  const pick = (id: string | null) => { setSel(id); centre(id, true); };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); return; }
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const i = order.indexOf(sel);
    const next = order[Math.max(0, Math.min(order.length - 1, i + (e.key === 'ArrowRight' ? 1 : -1)))];
    pick(next);
  };

  if (!open || typeof document === 'undefined') return null;
  const bg = postBgById(sel);
  const pos = bg ? POST_BACKGROUNDS.indexOf(bg) + 1 : 0;

  const tile = (b: PostBg | null) => (
    <button
      key={b?.id ?? 'none'}
      type="button"
      role="radio"
      aria-checked={sel === (b?.id ?? null)}
      data-pbg-id={b?.id ?? ''}
      className="pbg-tile"
      onClick={() => pick(b?.id ?? null)}
    >
      {b ? (
        <span className="pbg-tile-swatch" {...postBgHostProps(b)}><PostBgLayer bg={b} /></span>
      ) : (
        <span className="pbg-tile-swatch pbg-tile-swatch--none" />
      )}
      <span className="pbg-tile-label">{b ? t(`postBg.names.${b.id}`, b.name) : t('postBg.none', 'None')}</span>
    </button>
  );

  return createPortal(
    <div className="pbg-picker" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="pbg-picker-panel" role="dialog" aria-modal="true" aria-label={t('postBg.title', 'Post background')} onKeyDown={onKeyDown} tabIndex={-1} ref={(el) => el?.focus({ preventScroll: true })}>
        <div className="pbg-picker-top">
          <button type="button" className="pbg-picker-btn" onClick={onCancel}>{t('common.cancel', 'Cancel')}</button>
          <h2>{t('postBg.title', 'Post background')}</h2>
          <button type="button" className="pbg-picker-btn pbg-picker-btn--done" disabled={saving} onClick={() => onSave(sel)}>
            <span>{saving ? t('postBg.saving', 'Saving') : t('common.done', 'Done')}</span>
          </button>
        </div>

        <div className="pbg-picker-stage">
          <div className="pbg-preview" {...postBgHostProps(bg)}>
            <PostBgLayer bg={bg} />
            <div className="pbg-preview-who">
              {avatarUrl ? <img src={avatarUrl} alt="" /> : <span className="pbg-preview-av" />}
              <span><b>{name}</b><span>{handle}</span></span>
            </div>
            <div className="pbg-preview-text">{sampleText?.trim() || t('postBg.sample', 'This is how your text posts look on your profile.')}</div>
          </div>
        </div>

        <div className="pbg-picker-name" aria-live="polite">
          <b>{bg ? t(`postBg.names.${bg.id}`, bg.name) : t('postBg.none', 'None')}</b>
          <span>
            {bg
              ? `${bg.kind === 'moving' ? t('postBg.moving', 'Moving') : t('postBg.still', 'Still')} · ${t('postBg.position', '{{n}} of {{total}}', { n: pos, total: POST_BACKGROUNDS.length })}`
              : t('postBg.plain', 'Plain posts')}
          </span>
        </div>

        <div className="pbg-strip" ref={stripRef} role="radiogroup" aria-label={t('postBg.title', 'Post background')} onScroll={onScroll}>
          {tile(null)}
          {STILL.map(tile)}
          <span className="pbg-strip-divider" aria-hidden />
          {MOVING.map(tile)}
        </div>
        <p className="pbg-picker-hint">{t('postBg.hint', 'Swipe the strip. Your post changes as you go. Only you can change this.')}</p>
      </div>
    </div>,
    document.body,
  );
}
