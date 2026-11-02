import { useTranslation as _useCopy } from 'react-i18next';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AtSign, ChevronLeft, ChevronRight, Crop, DollarSign, FlipHorizontal2, Loader2, Palette, Pencil, RotateCw, SlidersHorizontal, Smile, Trash2, Type, Undo2, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ADJUST_RANGES, STUDIO_LOOKS, type StudioAdjustKey } from '../lib/studioColor';
import {
  RATIOS,
  bakeStudio,
  cloneEdits,
  defaultEdits,
  loadPicture,
  outputSize,
  paintStudio,
  textBox,
  inkOn,
  turnedSize,
  type StudioFont,
  type StudioText,
  type CropRatioId,
  type StudioEdits,
  type StudioPoint,
} from '../lib/studioPaint';

/**
 * One editor for every photo in a post: Crop, Looks, Adjust and Draw tabs over
 * the original picture. Nothing is baked until Done, so any tool can be changed
 * again in any order, and Done only rewrites the photos that changed.
 */

export type StudioTab = 'crop' | 'looks' | 'adjust' | 'draw';

export interface StudioPhoto {
  /** The original picture, before any studio edit. */
  original: File;
  edits?: StudioEdits | null;
}

export interface StudioResult {
  index: number;
  original: File;
  edits: StudioEdits;
  file: File;
}

interface Props {
  photos: StudioPhoto[];
  startIndex: number;
  startTab?: StudioTab;
  onClose: () => void;
  onDone: (results: StudioResult[]) => void;
}

const COLORS = ['#ffffff', '#000000', '#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#0a84ff', '#bf5af2'];
const BRUSH_SIZES = [0.006, 0.014, 0.028];
const TEXT_SIZES = [0.05, 0.08, 0.13];
const FONTS: { id: StudioFont; label: string; css: React.CSSProperties }[] = [
  { id: 'clean', label: 'Clean', css: { fontWeight: 600 } },
  { id: 'bold', label: 'Bold', css: { fontWeight: 900, fontStyle: 'italic' } },
  { id: 'serif', label: 'Serif', css: { fontFamily: 'Georgia, serif', fontWeight: 700 } },
  { id: 'mono', label: 'Mono', css: { fontFamily: 'ui-monospace, Menlo, monospace', fontWeight: 600 } },
];
const EMOJI = ['😍', '🔥', '😂', '❤️', '👏', '✨', '🎉', '👀', '💯', '🚀'];
const ADJUST_ORDER: StudioAdjustKey[] = ['light', 'contrast', 'warmth', 'tint', 'colour', 'fade', 'vignette'];
const MIN_CROP = 0.08;
/** The preview paints from a smaller copy so dragging a slider stays smooth. */
const PREVIEW_SIDE = 1600;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function pendingToItem(p: { at: StudioPoint; font: StudioFont; bg: boolean; color: string; size: number }, text: string): StudioText {
  return { kind: 'text', at: p.at, text, color: p.color, size: p.size, ...(p.font !== 'clean' ? { font: p.font } : {}), ...(p.bg ? { bg: true } : {}) };
}

function downscale(img: HTMLImageElement, side: number): HTMLCanvasElement {
  const k = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.naturalWidth * k));
  c.height = Math.max(1, Math.round(img.naturalHeight * k));
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, c.width, c.height);
  }
  return c;
}

/** A canvas painted with `edits`, at `w` x `h` CSS pixels. */
function StudioCanvas({ src, w, h, edits, uncropped, className }: { src: HTMLCanvasElement; w: number; h: number; edits: StudioEdits; uncropped?: boolean; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pw = Math.max(1, Math.round(w * dpr));
    const ph = Math.max(1, Math.round(h * dpr));
    if (c.width !== pw) c.width = pw;
    if (c.height !== ph) c.height = ph;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    const frame = requestAnimationFrame(() => paintStudio(ctx, src, pw, ph, edits, { uncropped }));
    return () => cancelAnimationFrame(frame);
  }, [src, w, h, edits, uncropped]);
  return <canvas ref={ref} className={className} style={{ width: w, height: h, display: 'block' }} />;
}

function Chip({ label, on, onClick, dot }: { label: string; on: boolean; onClick: () => void; dot?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        'shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors',
        on ? 'border-white bg-white font-semibold text-black' : 'border-white/15 text-white/60 hover:text-white',
      )}
    >
      {label}
      {dot ? <span className={cn('h-1.5 w-1.5 rounded-full', on ? 'bg-black' : 'bg-[#ffd84d]')} /> : null}
    </button>
  );
}

function ToolButton({ on, onClick, label, disabled, children }: { on?: boolean; onClick: () => void; label: string; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      aria-pressed={!!on}
      className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-zinc-300 transition-colors disabled:opacity-40',
        on ? 'border-white/50 bg-white/20 text-white' : 'border-white/15 bg-white/5 hover:text-white',
      )}
    >
      {children}
    </button>
  );
}

function Slider({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (v: number) => void; label: string }) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={1}
      value={value}
      aria-label={label}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-6 w-full cursor-pointer accent-white"
    />
  );
}

export function PhotoStudio({ photos, startIndex, startTab = 'looks', onClose, onDone }: Props) {
  const { t: _copy } = _useCopy();
  const [index, setIndex] = useState(startIndex);
  const [tab, setTab] = useState<StudioTab>(startTab);
  const [all, setAll] = useState<StudioEdits[]>(() => photos.map((p) => (p.edits ? cloneEdits(p.edits) : defaultEdits())));
  const initial = useRef(photos.map((p) => JSON.stringify(p.edits ?? defaultEdits())));
  const [pic, setPic] = useState<{ full: HTMLImageElement; preview: HTMLCanvasElement; thumb: HTMLCanvasElement } | null>(null);
  const [area, setArea] = useState<{ w: number; h: number } | null>(null);
  const [comparing, setComparing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [adjustKey, setAdjustKey] = useState<StudioAdjustKey>('light');
  const [tool, setTool] = useState<'draw' | 'text' | 'sticker'>('draw');
  const [font, setFont] = useState<StudioFont>('clean');
  const [textBg, setTextBg] = useState(false);
  /** The text or sticker layer picked to move or restyle. */
  const [selected, setSelected] = useState<number | null>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [sizeStep, setSizeStep] = useState(1);
  const [pendingText, setPendingText] = useState<{ at: StudioPoint; value: string; font: StudioFont; bg: boolean; color: string; size: number } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const allRef = useRef(all);
  allRef.current = all;
  const edits = all[index];
  const setEdits = useCallback(
    (fn: (e: StudioEdits) => StudioEdits) => setAll((prev) => prev.map((e, i) => (i === index ? fn(e) : e))),
    [index],
  );

  // Esc closes; the page behind does not scroll while the studio is up.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pendingRef.current) onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let alive = true;
    setPic(null);
    const url = URL.createObjectURL(photos[index].original);
    loadPicture(url)
      .then((full) => {
        if (!alive) return;
        setPic({ full, preview: downscale(full, PREVIEW_SIDE), thumb: downscale(full, 180) });
      })
      .catch(() => {
        if (alive) toast.error(_copy('copy.studio.loadFailed', { defaultValue: 'Could not open this photo' }));
      });
    return () => {
      alive = false;
      URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setArea({ w: el.clientWidth - 32, h: el.clientHeight - 24 });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const W = pic?.full.naturalWidth ?? 1;
  const H = pic?.full.naturalHeight ?? 1;
  const turned = turnedSize(W, H, edits.crop.quarter);

  // The picture's box: the finished crop, or on the Crop tab the whole turned picture.
  const box = useMemo(() => {
    if (!pic || !area) return null;
    const o = tab === 'crop' ? turned : outputSize(W, H, edits.crop);
    const aspect = o.w / o.h;
    let w = area.w;
    let h = w / aspect;
    if (h > area.h) {
      h = area.h;
      w = h * aspect;
    }
    return { w: Math.max(1, Math.floor(w)), h: Math.max(1, Math.floor(h)) };
  }, [pic, area, tab, turned, W, H, edits.crop]);

  const shown = useMemo<StudioEdits>(() => (comparing ? { ...defaultEdits(), crop: edits.crop } : edits), [comparing, edits]);

  // ── crop ──
  const ratioValue = (id: CropRatioId, tz = turned): number | null =>
    id === 'original' ? tz.w / tz.h : RATIOS.find((r) => r.id === id)?.value ?? null;

  const fitRect = (ratio: number | null, tz = turned) => {
    if (!ratio) return { x: 0, y: 0, w: 1, h: 1 };
    let w = 1;
    let h = tz.w / ratio / tz.h;
    if (h > 1) {
      h = 1;
      w = (tz.h * ratio) / tz.w;
    }
    return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
  };

  const pickRatio = (id: CropRatioId) =>
    setEdits((e) => ({ ...e, crop: { ...e.crop, ratio: id, rect: id === 'free' ? e.crop.rect : fitRect(ratioValue(id)) } }));

  const rotate = () =>
    setEdits((e) => {
      const quarter = (e.crop.quarter + 1) % 4;
      const tz = turnedSize(W, H, quarter);
      const r = e.crop.ratio === 'free' ? null : ratioValue(e.crop.ratio, tz);
      return { ...e, crop: { ...e.crop, quarter, rect: fitRect(r, tz) } };
    });

  const startCropDrag = (kind: 'move' | 'tl' | 'tr' | 'bl' | 'br') => (ev: React.PointerEvent) => {
    if (!box) return;
    ev.preventDefault();
    ev.stopPropagation();
    const x0 = ev.clientX;
    const y0 = ev.clientY;
    const r0 = { ...edits.crop.rect };
    const crop = edits.crop;
    const tz = turned;
    const ratio = crop.ratio === 'free' ? null : ratioValue(crop.ratio);
    const move = (e: PointerEvent) => {
      const dx = (e.clientX - x0) / box.w;
      const dy = (e.clientY - y0) / box.h;
      let next = { ...r0 };
      if (kind === 'move') {
        next.x = clamp(r0.x + dx, 0, 1 - r0.w);
        next.y = clamp(r0.y + dy, 0, 1 - r0.h);
      } else {
        const left = kind === 'tl' || kind === 'bl';
        const top = kind === 'tl' || kind === 'tr';
        const fx = left ? r0.x + r0.w : r0.x;
        const fy = top ? r0.y + r0.h : r0.y;
        let w = clamp(left ? r0.w - dx : r0.w + dx, MIN_CROP, left ? fx : 1 - fx);
        let h = clamp(top ? r0.h - dy : r0.h + dy, MIN_CROP, top ? fy : 1 - fy);
        if (ratio) {
          h = (w * tz.w) / ratio / tz.h;
          const maxH = top ? fy : 1 - fy;
          if (h > maxH) {
            h = maxH;
            w = (h * tz.h * ratio) / tz.w;
          }
          if (h < MIN_CROP) return;
        }
        next = { x: left ? fx - w : fx, y: top ? fy - h : fy, w, h };
      }
      setEdits((e2) => ({ ...e2, crop: { ...e2.crop, rect: next } }));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  // ── draw ──
  const pendingRef = useRef(pendingText);
  pendingRef.current = pendingText;
  const commitText = useCallback(() => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    setPendingText(null);
    const text = pending?.value.trim();
    if (pending && text) {
      setEdits((e) => ({ ...e, items: [...e.items, pendingToItem(pending, text)] }));
    }
  }, [setEdits]);

  const newPending = (at: StudioPoint, value = '', bg = textBg) =>
    setPendingText({ at, value, font, bg, color, size: TEXT_SIZES[sizeStep] });

  /** Restyle the picked layer (and the next one typed). */
  const styleSelected = (patch: Partial<StudioText>) => {
    if (pendingRef.current) setPendingText((p) => (p ? { ...p, ...patch } : p));
    if (selected === null) return;
    setEdits((e) => ({ ...e, items: e.items.map((it, i) => (i === selected && it.kind === 'text' ? { ...it, ...patch } : it)) }));
  };

  const hitText = (p: StudioPoint): number | null => {
    if (!box) return null;
    for (let i = edits.items.length - 1; i >= 0; i--) {
      const it = edits.items[i];
      if (it.kind !== 'text') continue;
      const b = textBox(it, box.w, box.h);
      const x = p.x * box.w;
      const y = p.y * box.h;
      if (x >= b.x - 6 && x <= b.x + b.w + 6 && y >= b.y - 6 && y <= b.y + b.h + 6) return i;
    }
    return null;
  };

  const pointFrom = (e: { clientX: number; clientY: number }): StudioPoint | null => {
    const el = boxRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: clamp((e.clientX - r.left) / r.width, 0, 1), y: clamp((e.clientY - r.top) / r.height, 0, 1) };
  };

  const onDrawDown = (ev: React.PointerEvent) => {
    if (tab !== 'draw') return;
    const p = pointFrom(ev);
    if (!p) return;
    ev.preventDefault();
    commitText();
    // Text and stickers can be picked up and moved; a second tap edits the words.
    const hit = tool === 'draw' ? null : hitText(p);
    if (hit !== null) {
      const it = edits.items[hit] as StudioText;
      const wasSelected = selected === hit;
      setSelected(hit);
      setColor(it.color);
      setFont(it.font ?? 'clean');
      setTextBg(!!it.bg);
      const start = { x: ev.clientX, y: ev.clientY };
      const from = { ...it.at };
      let moved = false;
      const move = (e: PointerEvent) => {
        const dx = (e.clientX - start.x) / (box?.w || 1);
        const dy = (e.clientY - start.y) / (box?.h || 1);
        if (Math.abs(e.clientX - start.x) + Math.abs(e.clientY - start.y) > 4) moved = true;
        setEdits((e2) => ({ ...e2, items: e2.items.map((m, i) => (i === hit && m.kind === 'text' ? { ...m, at: { x: clamp(from.x + dx, -0.2, 0.98), y: clamp(from.y + dy, 0, 1) } } : m)) }));
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        if (!moved && wasSelected && !/^\p{Extended_Pictographic}/u.test(it.text)) {
          // Edit the words: lift the layer back into the text box.
          setEdits((e2) => ({ ...e2, items: e2.items.filter((_, i) => i !== hit) }));
          setSelected(null);
          setPendingText({ at: it.at, value: it.text, font: it.font ?? 'clean', bg: !!it.bg, color: it.color, size: it.size });
        }
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
      return;
    }
    setSelected(null);
    if (tool === 'sticker') return;
    if (tool === 'text') {
      newPending(p);
      return;
    }
    setEdits((e) => ({ ...e, items: [...e.items, { kind: 'stroke', points: [p], color, width: BRUSH_SIZES[sizeStep] }] }));
    const move = (e: PointerEvent) => {
      const q = pointFrom(e);
      if (!q) return;
      setEdits((e2) => {
        const last = e2.items[e2.items.length - 1];
        if (!last || last.kind !== 'stroke') return e2;
        return { ...e2, items: [...e2.items.slice(0, -1), { ...last, points: [...last.points, q] }] };
      });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  // Hold the photo to see the original (not while cropping or drawing).
  const holdTimer = useRef<number | null>(null);
  const onHoldStart = () => {
    if (tab === 'crop' || tab === 'draw') return;
    holdTimer.current = window.setTimeout(() => setComparing(true), 180);
  };
  const onHoldEnd = () => {
    if (holdTimer.current) window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
    setComparing(false);
  };

  // ── pager / done ──
  const go = (to: number) => {
    commitText();
    if (to < 0 || to >= photos.length) return;
    setComparing(false);
    setIndex(to);
  };

  const done = async () => {
    if (saving) return;
    const pending = pendingRef.current;
    const text = pending?.value.trim();
    const latest = allRef.current.map((e, i) =>
      i === index && pending && text
        ? { ...e, items: [...e.items, pendingToItem(pending, text)] }
        : e,
    );
    setPendingText(null);
    setSaving(true);
    try {
      const results: StudioResult[] = [];
      for (let i = 0; i < latest.length; i++) {
        if (JSON.stringify(latest[i]) === initial.current[i]) continue;
        const file = await bakeStudio(photos[i].original, latest[i]);
        results.push({ index: i, original: photos[i].original, edits: latest[i], file });
      }
      onDone(results);
    } catch (err) {
      console.warn('[PhotoStudio] bake failed:', err);
      toast.error(_copy('copy.studio.saveFailed', { defaultValue: 'Could not save the edit. Try again.' }));
    } finally {
      setSaving(false);
    }
  };

  const tabs: { id: StudioTab; icon: React.ReactNode; label: string }[] = [
    { id: 'crop', icon: <Crop className="h-5 w-5" />, label: _copy('copy.studio.crop', { defaultValue: 'Crop' }) },
    { id: 'looks', icon: <Palette className="h-5 w-5" />, label: _copy('copy.studio.looks', { defaultValue: 'Looks' }) },
    { id: 'adjust', icon: <SlidersHorizontal className="h-5 w-5" />, label: _copy('copy.studio.adjust', { defaultValue: 'Adjust' }) },
    { id: 'draw', icon: <Pencil className="h-5 w-5" />, label: _copy('copy.studio.draw', { defaultValue: 'Draw' }) },
  ];
  const adjustLabel = (k: StudioAdjustKey) =>
    ({
      light: _copy('copy.studio.light', { defaultValue: 'Light' }),
      contrast: _copy('copy.studio.contrast', { defaultValue: 'Contrast' }),
      warmth: _copy('copy.studio.warmth', { defaultValue: 'Warmth' }),
      tint: _copy('copy.studio.tint', { defaultValue: 'Tint' }),
      colour: _copy('copy.studio.colour', { defaultValue: 'Colour' }),
      fade: _copy('copy.studio.fade', { defaultValue: 'Fade' }),
      vignette: _copy('copy.studio.vignette', { defaultValue: 'Vignette' }),
    })[k];

  const rect = edits.crop.rect;
  const hasItems = edits.items.length > 0 || !!pendingText?.value.trim();
  const range = ADJUST_RANGES[adjustKey];

  const body = (
    <div
      className="fixed inset-0 z-[300] flex flex-col bg-black text-white"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      role="dialog"
      aria-modal="true"
      aria-label={_copy('copy.studio.title', { defaultValue: 'Edit photo' })}
    >
      {/* Top bar */}
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-3 py-2.5">
        <button type="button" onClick={onClose} aria-label={_copy('copy.studio.cancel', { defaultValue: 'Cancel' })} className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white">
          <X className="h-5 w-5" />
        </button>
        {photos.length > 1 ? (
          <div className="flex items-center gap-1 text-xs tabular-nums text-white/70">
            <button type="button" disabled={index === 0} onClick={() => go(index - 1)} aria-label={_copy('copy.studio.prev', { defaultValue: 'Previous photo' })} className="rounded-full p-1.5 disabled:opacity-30 hover:bg-white/10">
              <ChevronLeft className="h-4 w-4" />
            </button>
            {_copy('copy.studio.counter', { defaultValue: '{{n}} of {{total}}', n: index + 1, total: photos.length })}
            <button type="button" disabled={index === photos.length - 1} onClick={() => go(index + 1)} aria-label={_copy('copy.studio.next', { defaultValue: 'Next photo' })} className="rounded-full p-1.5 disabled:opacity-30 hover:bg-white/10">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        ) : <span />}
        <button type="button" onClick={done} disabled={saving} className="min-w-[64px] rounded-full bg-white px-4 py-1.5 text-[13px] font-semibold text-black disabled:opacity-70">
          {saving ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : _copy('copy.studio.done', { defaultValue: 'Done' })}
        </button>
      </div>

      {/* Stage */}
      <div ref={stageRef} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        {!pic || !box ? (
          <Loader2 className="h-6 w-6 animate-spin text-white/60" />
        ) : (
          <div
            ref={boxRef}
            className={cn('relative select-none', tab === 'draw' && 'cursor-crosshair')}
            style={{ width: box.w, height: box.h, touchAction: 'none' }}
            onPointerDown={(e) => {
              onHoldStart();
              onDrawDown(e);
            }}
            onPointerUp={onHoldEnd}
            onPointerLeave={onHoldEnd}
            onContextMenu={(e) => e.preventDefault()}
          >
            <StudioCanvas src={pic.preview} w={box.w} h={box.h} edits={shown} uncropped={tab === 'crop'} className="rounded-sm" />
            {comparing ? (
              <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white">
                {_copy('copy.studio.original', { defaultValue: 'Original' })}
              </span>
            ) : null}

            {tab === 'crop' ? (
              <>
                {/* Shade outside the kept part */}
                <div className="pointer-events-none absolute left-0 right-0 top-0 bg-black/60" style={{ height: rect.y * box.h }} />
                <div className="pointer-events-none absolute bottom-0 left-0 right-0 bg-black/60" style={{ height: (1 - rect.y - rect.h) * box.h }} />
                <div className="pointer-events-none absolute left-0 bg-black/60" style={{ top: rect.y * box.h, height: rect.h * box.h, width: rect.x * box.w }} />
                <div className="pointer-events-none absolute right-0 bg-black/60" style={{ top: rect.y * box.h, height: rect.h * box.h, width: (1 - rect.x - rect.w) * box.w }} />
                <div
                  className="absolute cursor-move border-2 border-white"
                  style={{ left: rect.x * box.w, top: rect.y * box.h, width: rect.w * box.w, height: rect.h * box.h, touchAction: 'none' }}
                  onPointerDown={startCropDrag('move')}
                >
                  <div className="pointer-events-none absolute inset-y-0 left-1/3 w-px bg-white/35" />
                  <div className="pointer-events-none absolute inset-y-0 left-2/3 w-px bg-white/35" />
                  <div className="pointer-events-none absolute inset-x-0 top-1/3 h-px bg-white/35" />
                  <div className="pointer-events-none absolute inset-x-0 top-2/3 h-px bg-white/35" />
                  {(['tl', 'tr', 'bl', 'br'] as const).map((c) => (
                    <div
                      key={c}
                      onPointerDown={startCropDrag(c)}
                      className={cn(
                        'absolute h-6 w-6',
                        c === 'tl' && '-left-3 -top-3 cursor-nwse-resize',
                        c === 'tr' && '-right-3 -top-3 cursor-nesw-resize',
                        c === 'bl' && '-bottom-3 -left-3 cursor-nesw-resize',
                        c === 'br' && '-bottom-3 -right-3 cursor-nwse-resize',
                      )}
                      style={{ touchAction: 'none' }}
                    >
                      <div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-[3px] bg-white" />
                    </div>
                  ))}
                </div>
              </>
            ) : null}

            {tab === 'draw' && selected !== null && edits.items[selected]?.kind === 'text' ? (() => {
              const b = textBox(edits.items[selected] as StudioText, box.w, box.h);
              return <div className="pointer-events-none absolute rounded-lg border border-dashed border-white/80" style={{ left: b.x - 4, top: b.y - 4, width: b.w + 8, height: b.h + 8 }} />;
            })() : null}

            {pendingText ? (
              <input
                autoFocus
                value={pendingText.value}
                onChange={(e) => setPendingText((p) => (p ? { ...p, value: e.target.value } : p))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitText();
                  if (e.key === 'Escape') setPendingText(null);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                placeholder={_copy('copy.studio.typeHere', { defaultValue: 'Type here' })}
                className="absolute rounded-md border border-white/30 px-1.5 py-0.5 outline-none placeholder:opacity-60"
                style={{
                  left: pendingText.at.x * box.w,
                  top: pendingText.at.y * box.h,
                  transform: 'translateY(-50%)',
                  color: pendingText.bg ? inkOn(pendingText.color) : pendingText.color,
                  backgroundColor: pendingText.bg ? pendingText.color : 'rgba(0,0,0,0.4)',
                  fontSize: Math.max(12, pendingText.size * Math.min(box.w, box.h)),
                  maxWidth: box.w - pendingText.at.x * box.w,
                  ...FONTS.find((f) => f.id === pendingText.font)?.css,
                }}
              />
            ) : null}
          </div>
        )}
      </div>

      {/* Tool panel */}
      <div className="mx-auto w-full max-w-3xl px-4 pb-1 pt-3">
        {tab === 'crop' ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="w-20 shrink-0 text-xs text-white/60">{_copy('copy.studio.straighten', { defaultValue: 'Straighten' })}</span>
              <Slider
                value={edits.crop.straighten}
                min={-45}
                max={45}
                label={_copy('copy.studio.straighten', { defaultValue: 'Straighten' })}
                onChange={(v) => setEdits((e) => ({ ...e, crop: { ...e.crop, straighten: v } }))}
              />
              <button type="button" onClick={() => setEdits((e) => ({ ...e, crop: { ...e.crop, straighten: 0 } }))} className="w-9 shrink-0 text-right text-xs tabular-nums text-white/70">
                {edits.crop.straighten}°
              </button>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto scrollbar-hide">
                {RATIOS.map((r) => (
                  <Chip
                    key={r.id}
                    on={edits.crop.ratio === r.id}
                    onClick={() => pickRatio(r.id)}
                    label={r.id === 'original' ? _copy('copy.studio.ratioOriginal', { defaultValue: 'Original' }) : r.id === 'free' ? _copy('copy.studio.ratioFree', { defaultValue: 'Free' }) : r.label}
                  />
                ))}
              </div>
              <ToolButton onClick={rotate} label={_copy('copy.studio.rotate', { defaultValue: 'Rotate' })}>
                <RotateCw className="h-4 w-4" />
              </ToolButton>
              <ToolButton on={edits.crop.flipX} onClick={() => setEdits((e) => ({ ...e, crop: { ...e.crop, flipX: !e.crop.flipX } }))} label={_copy('copy.studio.flip', { defaultValue: 'Flip' })}>
                <FlipHorizontal2 className="h-4 w-4" />
              </ToolButton>
            </div>
          </div>
        ) : null}

        {tab === 'looks' ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="w-20 shrink-0 text-xs text-white/60">{_copy('copy.studio.strength', { defaultValue: 'Strength' })}</span>
              <Slider value={edits.strength} min={0} max={100} label={_copy('copy.studio.strength', { defaultValue: 'Strength' })} onChange={(v) => setEdits((e) => ({ ...e, strength: v }))} />
              <span className="w-9 shrink-0 text-right text-xs tabular-nums text-white/70">{edits.strength}</span>
            </div>
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-hide">
              {pic
                ? STUDIO_LOOKS.map((l) => {
                    const on = edits.lookId === l.id;
                    return (
                      <button key={l.id} type="button" onClick={() => setEdits((e) => ({ ...e, lookId: l.id, strength: e.lookId === l.id ? e.strength : 100 }))} className="flex shrink-0 flex-col items-center gap-1" aria-pressed={on}>
                        <div className={cn('overflow-hidden rounded-xl border-2', on ? 'border-white' : 'border-transparent')}>
                          <StudioCanvas src={pic.thumb} w={60} h={72} edits={{ ...defaultEdits(), lookId: l.id, crop: { ...defaultEdits().crop, rect: fitRect(60 / 72, { w: pic.thumb.width, h: pic.thumb.height }) } }} />
                        </div>
                        <span className={cn('text-[11px]', on ? 'font-semibold text-white' : 'text-white/60')}>
                          {_copy(`copy.studio.look.${l.id}`, { defaultValue: l.name })}
                        </span>
                      </button>
                    );
                  })
                : null}
            </div>
          </div>
        ) : null}

        {tab === 'adjust' ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="w-20 shrink-0 text-xs text-white/60">{adjustLabel(adjustKey)}</span>
              <Slider
                value={edits.adjust[adjustKey]}
                min={range[0]}
                max={range[1]}
                label={adjustLabel(adjustKey)}
                onChange={(v) => setEdits((e) => ({ ...e, adjust: { ...e.adjust, [adjustKey]: v } }))}
              />
              <button
                type="button"
                title={_copy('copy.studio.resetDial', { defaultValue: 'Reset' })}
                onClick={() => setEdits((e) => ({ ...e, adjust: { ...e.adjust, [adjustKey]: 0 } }))}
                className="w-9 shrink-0 text-right text-xs tabular-nums text-white/70"
              >
                {edits.adjust[adjustKey]}
              </button>
            </div>
            <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 scrollbar-hide">
              {ADJUST_ORDER.map((k) => (
                <Chip key={k} label={adjustLabel(k)} on={adjustKey === k} dot={edits.adjust[k] !== 0} onClick={() => setAdjustKey(k)} />
              ))}
            </div>
          </div>
        ) : null}

        {tab === 'draw' ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <ToolButton on={tool === 'draw'} onClick={() => { commitText(); setSelected(null); setTool('draw'); }} label={_copy('copy.studio.pen', { defaultValue: 'Pen' })}>
                <Pencil className="h-4 w-4" />
              </ToolButton>
              <ToolButton on={tool === 'text'} onClick={() => setTool('text')} label={_copy('copy.studio.text', { defaultValue: 'Text' })}>
                <Type className="h-4 w-4" />
              </ToolButton>
              <ToolButton on={tool === 'sticker'} onClick={() => { commitText(); setTool('sticker'); }} label={_copy('copy.studio.stickers', { defaultValue: 'Stickers' })}>
                <Smile className="h-4 w-4" />
              </ToolButton>
              <div className="mx-auto flex gap-2">
                {[0, 1, 2].map((i) => (
                  <ToolButton key={i} on={sizeStep === i} onClick={() => { setSizeStep(i); if (tool !== 'draw') styleSelected({ size: TEXT_SIZES[i] }); }} label={_copy('copy.studio.size', { defaultValue: 'Size {{n}}', n: i + 1 })}>
                    <span className="rounded-full bg-white" style={{ width: 4 + i * 4, height: 4 + i * 4 }} />
                  </ToolButton>
                ))}
              </div>
              <ToolButton
                disabled={!hasItems}
                onClick={() => {
                  if (pendingText) setPendingText(null);
                  else if (selected !== null) setEdits((e) => ({ ...e, items: e.items.filter((_, i) => i !== selected) }));
                  else setEdits((e) => ({ ...e, items: e.items.slice(0, -1) }));
                  setSelected(null);
                }}
                label={selected !== null ? _copy('copy.studio.deleteLayer', { defaultValue: 'Delete' }) : _copy('copy.studio.undo', { defaultValue: 'Undo' })}
              >
                {selected !== null ? <Trash2 className="h-4 w-4" /> : <Undo2 className="h-4 w-4" />}
              </ToolButton>
            </div>

            {tool === 'sticker' ? (
              <div className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 pb-1 scrollbar-hide">
                <button type="button" onClick={() => newPending({ x: 0.3, y: 0.5 }, '@', true)} className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/15 px-3 py-1.5 text-xs text-white">
                  <AtSign className="h-3.5 w-3.5" />{_copy('copy.studio.mention', { defaultValue: 'Mention' })}
                </button>
                <button type="button" onClick={() => newPending({ x: 0.3, y: 0.5 }, '$', true)} className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/15 px-3 py-1.5 text-xs text-white">
                  <DollarSign className="h-3.5 w-3.5" />{_copy('copy.studio.ticker', { defaultValue: 'Ticker' })}
                </button>
                {EMOJI.map((em) => (
                  <button
                    key={em}
                    type="button"
                    aria-label={em}
                    onClick={() => {
                      setEdits((e) => ({ ...e, items: [...e.items, { kind: 'text', at: { x: 0.42, y: 0.45 }, text: em, color: '#ffffff', size: 0.16 }] }));
                      setSelected(edits.items.length);
                    }}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/5 text-xl"
                  >
                    {em}
                  </button>
                ))}
              </div>
            ) : null}

            {tool !== 'draw' ? (
              <div className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 scrollbar-hide">
                {FONTS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    aria-pressed={font === f.id}
                    onClick={() => { setFont(f.id); styleSelected({ font: f.id }); }}
                    className={cn('shrink-0 rounded-full border px-3 py-1.5 text-xs', font === f.id ? 'border-white bg-white text-black' : 'border-white/15 text-white/70')}
                    style={f.css}
                  >
                    {_copy(`copy.studio.font.${f.id}`, { defaultValue: f.label })}
                  </button>
                ))}
                <button
                  type="button"
                  aria-pressed={textBg}
                  onClick={() => { setTextBg(!textBg); styleSelected({ bg: !textBg }); }}
                  className={cn('shrink-0 rounded-full border px-3 py-1.5 text-xs', textBg ? 'border-white bg-white text-black' : 'border-white/15 text-white/70')}
                >
                  {_copy('copy.studio.textBg', { defaultValue: 'Background' })}
                </button>
              </div>
            ) : null}

            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  aria-pressed={color === c}
                  onClick={() => { setColor(c); if (tool !== 'draw') styleSelected({ color: c }); }}
                  className={cn('h-7 w-7 rounded-full border-2 transition-transform', color === c ? 'scale-110 border-white' : 'border-white/20')}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            {tool !== 'draw' ? (
              <p className="text-[11px] text-white/45">{_copy('copy.studio.layerHint', { defaultValue: 'Drag words and stickers to move them. Tap twice to change the words.' })}</p>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Tabs */}
      <div className="mx-auto mt-2 flex w-full max-w-3xl border-t border-white/10">
        {tabs.map((tb) => {
          const on = tab === tb.id;
          return (
            <button
              key={tb.id}
              type="button"
              onClick={() => {
                commitText();
                setComparing(false);
                setTab(tb.id);
              }}
              aria-pressed={on}
              className={cn('flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px]', on ? 'text-white' : 'text-white/55 hover:text-white')}
            >
              {tb.icon}
              <span className={cn(on && 'font-semibold')}>{tb.label}</span>
              <span className={cn('h-0.5 w-5 rounded-full', on ? 'bg-white' : 'bg-transparent')} />
            </button>
          );
        })}
      </div>
    </div>
  );

  return createPortal(body, document.body);
}

export default PhotoStudio;
