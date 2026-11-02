import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation as _useCopy } from 'react-i18next';
import { Image as ImageIcon, Scissors, FlipHorizontal2, RotateCw, EyeOff, Lock, Eye, Timer, Plus, Play, Pause, Trash2, Check } from 'lucide-react';
import X from '@/components/ui/cut-icons/close';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { cn } from '@/lib/utils';
import { formatAttachmentSize } from '@/lib/attachments';
import {
  cleanVideoOptions,
  formatClock,
  keptDuration,
  nextQuarterTurn,
  type DmVideoOptions,
} from '@/lib/dm-video-options';
import { DESTRUCT_CHOICES, destructLabel, destructShort, type DmDestructChoice } from '@/lib/dm-destruct';
import { DmVideoFrame } from './DmVideo';
import { LockPriceControl } from './LockPriceControl';
import { LOCK_DEFAULT_USD, formatLockUsd } from '@/lib/dm-lock-price';

export type Tab = 'cover' | 'trim' | 'mirror' | 'rotate' | 'hide' | 'timer';
const FRAME_COUNT = 10;
const MIN_KEEP = 1;

/** A strip of real frames from the picked file, for the trim and cover tabs. */
function useFilmstrip(url: string | null, duration: number | undefined, enabled: boolean) {
  const [frames, setFrames] = useState<string[]>([]);
  useEffect(() => {
    if (!enabled || !url || !duration) return;
    let cancelled = false;
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = url;
    const canvas = document.createElement('canvas');
    const out: string[] = [];
    const grab = async () => {
      await new Promise<void>((res) => { if (video.readyState >= 1) res(); else video.addEventListener('loadedmetadata', () => res(), { once: true }); });
      const scale = 72 / Math.max(1, video.videoHeight);
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = 72;
      const ctx = canvas.getContext('2d');
      for (let i = 0; i < FRAME_COUNT && !cancelled; i++) {
        const at = Math.min(duration - 0.05, (duration * (i + 0.5)) / FRAME_COUNT);
        await new Promise<void>((res) => {
          const timer = window.setTimeout(res, 1500);
          video.addEventListener('seeked', () => { window.clearTimeout(timer); res(); }, { once: true });
          video.currentTime = at;
        });
        ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
        out.push(canvas.toDataURL('image/jpeg', 0.6));
        if (!cancelled) setFrames([...out]);
      }
    };
    void grab().catch(() => undefined);
    return () => { cancelled = true; video.removeAttribute('src'); video.load(); };
  }, [url, duration, enabled]);
  return frames;
}

/**
 * The picked video above the message box, at its real shape, with its kept
 * length and size on it. Tapping it opens the video sheet.
 */
export function DmVideoCard({
  url,
  file,
  options,
  onOpen,
  onRemove,
  onMeta,
  duration,
  destruct,
}: {
  destruct?: DmDestructChoice | null;
  url: string;
  file: File;
  options?: DmVideoOptions;
  onOpen: () => void;
  onRemove: () => void;
  onMeta: (m: { w: number; h: number; dur: number }) => void;
  duration?: number;
}) {
  const { t: _copy } = _useCopy();
  const kept = keptDuration(options, duration);
  return (
    <div data-attach-preview="video" className="mb-2 flex items-end gap-2">
      <button
        type="button"
        onClick={onOpen}
        className="relative block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        aria-label={_copy('dmVideo.edit', { defaultValue: 'Edit video' })}
      >
        <DmVideoFrame src={url} options={options} maxW={200} maxH={150} onMeta={onMeta} blurred={options?.hidden === 'reveal'}>
          {options?.hidden === 'reveal' && (
            <span className="absolute left-1/2 top-1/2 inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-black/60 px-2 py-1 text-[10px] font-bold text-white">
              <EyeOff className="h-3 w-3" /> {_copy('dmVideo.hiddenTag', { defaultValue: 'Hidden' })}
            </span>
          )}
          <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white backdrop-blur-sm">
            {kept != null ? `${formatClock(kept)} · ` : ''}{formatAttachmentSize(file.size)}
          </span>
          {destruct && <DestructChip choice={destruct} short />}
        </DmVideoFrame>
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onRemove(); } }}
          className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-white/35 bg-black/60 text-white backdrop-blur-sm hover:bg-black/80"
          aria-label={_copy('copy.595b066a8838', { defaultValue: 'Remove attachment' })}
        >
          <X className="h-3 w-3" />
        </span>
      </button>
      <button type="button" onClick={onOpen} className="pb-1 text-xs text-zinc-400 hover:text-white">
        {_copy('dmVideo.tapToEdit', { defaultValue: 'Tap to edit' })}
      </button>
    </div>
  );
}

/**
 * The edit screen for picked photos and videos: a big preview you can play and
 * scrub, Cover, Trim, Mirror, Rotate, Hide and Timer, a strip of everything
 * picked with + to add more, and Confirm to go back to where it was opened.
 */
/** One photo or video waiting in the edit screen. */
export interface DmStudioItem {
  id: string;
  file: File;
  url: string;
  kind: 'image' | 'video';
  /** Seconds, once the video has loaded. */
  duration?: number;
  options: DmVideoOptions;
  destruct: DmDestructChoice | null;
  lockPrice: number | null;
}

export function DmMediaStudio({
  items,
  active,
  onActiveChange,
  onItemChange,
  onRemoveItem,
  onAddMore,
  onClose,
  allowLock,
  allowTimer = true,
  open: openProp,
  onConfirm,
  confirmLabel,
  initialTab = 'trim',
}: {
  items: DmStudioItem[];
  active: number;
  onActiveChange: (i: number) => void;
  onItemChange: (i: number, patch: Partial<DmStudioItem>) => void;
  onRemoveItem: (i: number) => void;
  /** Opens the picker; what is picked joins this screen. */
  onAddMore: () => void;
  /** X: closes the screen. */
  onClose: () => void;
  allowLock?: boolean;
  /** Self-destruct only exists in DMs. */
  allowTimer?: boolean;
  /** Defaults to open while anything is picked. */
  open?: boolean;
  /** Confirm: keeps the choices and goes back. */
  onConfirm: () => void;
  confirmLabel?: string;
  /** Which tool a video opens on. */
  initialTab?: Tab;
}) {
  const item = items[Math.min(active, items.length - 1)];
  const open = (openProp ?? true) && items.length > 0;
  const isVideo = item?.kind === 'video';
  const url = item?.url ?? '';
  const file = item?.file;
  const duration = item?.duration;
  const options = item?.options ?? {};
  const destruct = item?.destruct ?? null;
  const lockPrice = item?.lockPrice ?? null;
  const onOptionsChange = (o: DmVideoOptions) => onItemChange(active, { options: o });
  const onDestructChange = (c: DmDestructChoice | null) => onItemChange(active, { destruct: c });
  const onLockPriceChange = allowLock ? (p: number | null) => onItemChange(active, { lockPrice: p }) : undefined;
  const { t: _copy } = _useCopy();
  const [pickedTab, setTab] = useState<Tab>(initialTab);
  const tab: Tab = isVideo ? pickedTab : (pickedTab === 'timer' && allowTimer ? 'timer' : 'hide');
  const frames = useFilmstrip(isVideo ? url : null, duration, open && isVideo && (tab === 'trim' || tab === 'cover'));
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // Watch and scrub the picked video right here.
  const [now, setNow] = useState(0);
  const [playing, setPlaying] = useState(true);
  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => undefined); else v.pause();
  };
  const stripRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<'start' | 'end' | null>(null);
  const dur = duration ?? 0;
  const start = options.trimStart ?? 0;
  const end = options.trimEnd ?? dur;
  const kept = keptDuration(options, dur);
  const set = (patch: Partial<DmVideoOptions>) => onOptionsChange({ ...options, ...patch });

  const timeAt = (clientX: number) => {
    const r = stripRef.current?.getBoundingClientRect();
    if (!r || !dur) return 0;
    return Math.min(dur, Math.max(0, ((clientX - r.left) / r.width) * dur));
  };
  const seek = (t: number) => { const v = videoRef.current; if (v) { v.pause(); v.currentTime = t; } };

  const onStripDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dur) return;
    const t = timeAt(e.clientX);
    if (tab === 'cover') { set({ coverAt: Math.round(t * 10) / 10 }); seek(t); return; }
    drag.current = Math.abs(t - start) <= Math.abs(t - end) ? 'start' : 'end';
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    onStripMove(e);
  };
  const onStripMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current || !dur) return;
    const t = Math.round(timeAt(e.clientX) * 10) / 10;
    if (drag.current === 'start') { const s = Math.min(t, end - MIN_KEEP); set({ trimStart: Math.max(0, s) }); seek(Math.max(0, s)); }
    else { const en = Math.max(t, start + MIN_KEEP); set({ trimEnd: Math.min(dur, en) }); seek(Math.min(dur, en) - 0.05); }
  };
  const onStripUp = () => {
    if (drag.current) { drag.current = null; const v = videoRef.current; if (v) { v.currentTime = start; void v.play().catch(() => undefined); } }
  };

  const allTabs: { key: Tab; label: string; icon: typeof Scissors }[] = [
    { key: 'cover', label: _copy('dmVideo.cover', { defaultValue: 'Cover' }), icon: ImageIcon },
    { key: 'trim', label: _copy('dmVideo.trim', { defaultValue: 'Trim' }), icon: Scissors },
    { key: 'mirror', label: _copy('dmVideo.mirror', { defaultValue: 'Mirror' }), icon: FlipHorizontal2 },
    { key: 'rotate', label: _copy('dmVideo.rotate', { defaultValue: 'Rotate' }), icon: RotateCw },
    { key: 'hide', label: _copy('dmVideo.hide', { defaultValue: 'Hide' }), icon: EyeOff },
    { key: 'timer', label: _copy('dmVideo.timer', { defaultValue: 'Timer' }), icon: Timer },
  ];
  // Photos keep Hide (price) and Timer; the rest only means something for a video.
  const tabs = allTabs.filter((t) =>
    (t.key !== 'timer' || allowTimer)
    && (isVideo || (t.key === 'hide' && allowLock) || t.key === 'timer'));
  if (!item || !file) return null;

  const pct = (t: number) => (dur ? `${(t / dur) * 100}%` : '0%');

  return (
    <Drawer open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DrawerContent column hideHandle className="dark-surface flex max-h-[94dvh] flex-col overflow-hidden border-zinc-800 bg-zinc-950 text-white">
        <DrawerTitle className="sr-only">{_copy('dmVideo.sheetTitleAny', { defaultValue: 'Edit before sending' })}</DrawerTitle>
        <div className="flex items-center justify-between px-3 pt-3">
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-white/5 text-white hover:bg-white/10"
            aria-label={_copy('dmVideo.close', { defaultValue: 'Close' })}
          >
            <X className="h-4 w-4" />
          </button>
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold tabular-nums">
            {isVideo && kept != null ? `${formatClock(kept)} · ` : ''}{formatAttachmentSize(file.size)}
          </span>
          <button
            type="button"
            onClick={() => onRemoveItem(active)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-white/5 text-white hover:bg-white/10"
            aria-label={_copy('copy.595b066a8838', { defaultValue: 'Remove attachment' })}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 items-center justify-center px-3 py-3">
          {!isVideo ? (
            <div className="relative overflow-hidden rounded-lg bg-black">
              <img
                src={url}
                alt=""
                className={cn('block max-h-[42vh] max-w-full object-contain transition-[filter] duration-500', lockPrice != null && 'blur-xl brightness-75')}
              />
              {destruct && <DestructChip choice={destruct} />}
              {lockPrice != null && (
                <span className="absolute bottom-2 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-black/60 px-2.5 py-1 text-xs font-bold">
                  <Lock className="h-3.5 w-3.5" /> {_copy('dmVideo.lockedFor', { defaultValue: 'Unlock for {{value1}} DHB', value1: lockPrice })}
                </span>
              )}
            </div>
          ) : (
          <div className="flex w-full max-w-full flex-col items-center gap-2">
          <DmVideoFrame
            key={item.id}
            onTimeUpdate={setNow}
            onPlayState={setPlaying}
            onMeta={(m) => { if (!item.duration && Number.isFinite(m.dur)) onItemChange(active, { duration: m.dur }); }}
            src={url}
            options={{ ...options, coverAt: undefined }}
            maxW={Math.min(360, typeof window !== 'undefined' ? window.innerWidth - 24 : 360)}
            maxH={typeof window !== 'undefined' ? Math.max(200, Math.round(window.innerHeight * 0.42)) : 320}
            videoRef={videoRef}
            autoPlay={open}
            loop
            blurred={options.hidden === 'reveal' || lockPrice != null}
          >
            {options.hidden === 'reveal' && (
              <span className="absolute left-1/2 top-1/2 inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-black/60 px-2.5 py-1 text-xs font-bold">
                <EyeOff className="h-3.5 w-3.5" /> {_copy('dmVideo.hiddenUntilTap', { defaultValue: 'Hidden until they tap it' })}
              </span>
            )}
            {destruct && <DestructChip choice={destruct} />}
            {lockPrice != null && (
              <span className="absolute bottom-2 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-black/60 px-2.5 py-1 text-xs font-bold">
                <Lock className="h-3.5 w-3.5" /> {_copy('dmVideo.lockedForUsd', { defaultValue: 'Unlock for {{value1}}', value1: formatLockUsd(lockPrice) })}
              </span>
            )}
            <button
              type="button"
              onClick={togglePlay}
              className="absolute inset-0 flex items-center justify-center"
              aria-label={playing ? _copy('dmVideo.pause', { defaultValue: 'Pause' }) : _copy('dmVideo.play', { defaultValue: 'Play video' })}
            >
              {!playing && (
                <span className="flex h-12 w-12 items-center justify-center rounded-full border border-white/35 bg-black/45">
                  <Play className="ml-0.5 h-5 w-5 fill-white text-white" />
                </span>
              )}
            </button>
          </DmVideoFrame>
          {dur > 0 && (
            <div className="flex w-full max-w-[440px] items-center gap-2">
              <button
                type="button"
                onClick={togglePlay}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/15"
                aria-label={playing ? _copy('dmVideo.pause', { defaultValue: 'Pause' }) : _copy('dmVideo.play', { defaultValue: 'Play video' })}
              >
                {playing ? <Pause className="h-4 w-4 fill-white" /> : <Play className="ml-0.5 h-4 w-4 fill-white" />}
              </button>
              <input
                type="range"
                min={start}
                max={end}
                step={0.05}
                value={Math.min(end, Math.max(start, now))}
                onChange={(e) => { const v = videoRef.current; const t = Number(e.target.value); if (v) { v.currentTime = t; setNow(t); } }}
                aria-label={_copy('dmVideo.scrub', { defaultValue: 'Scrub through the video' })}
                className="h-1 min-w-0 flex-1 cursor-pointer accent-white"
              />
              <span className="w-[72px] shrink-0 text-right text-[11px] tabular-nums text-zinc-400">
                {formatClock(Math.max(0, now - start))} / {formatClock(kept)}
              </span>
            </div>
          )}
          </div>
          )}
        </div>

        {/* Everything going out together; + adds more. */}
        <div className="flex items-center gap-2 overflow-x-auto px-3 pb-2 [scrollbar-width:none]">
          {items.map((it, i) => (
            <button
              key={it.id}
              type="button"
              onClick={() => onActiveChange(i)}
              aria-label={_copy('dmVideo.editItem', { defaultValue: 'Edit item {{value1}}', value1: i + 1 })}
              aria-pressed={i === active}
              className={cn('relative h-12 w-12 shrink-0 overflow-hidden rounded-md border-2 border-transparent bg-zinc-900', i === active && 'border-white')}
            >
              {it.kind === 'video'
                ? <video src={it.url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                : <img src={it.url} alt="" className="h-full w-full object-cover" />}
              {it.kind === 'video' && <Play className="absolute bottom-0.5 left-0.5 h-3 w-3 fill-white text-white" />}
              {it.lockPrice != null && <Lock className="absolute right-0.5 top-0.5 h-3 w-3 text-white" />}
            </button>
          ))}
          <button
            type="button"
            onClick={onAddMore}
            aria-label={_copy('dmVideo.addMore', { defaultValue: 'Add photos or videos' })}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-dashed border-white/30 text-white hover:bg-white/10"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-3 px-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          {tabs.length > 0 && <>
          <div role="tablist" className="flex justify-around border-b border-white/10">
            {tabs.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                role="tab"
                type="button"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={cn('flex flex-col items-center gap-1 px-2 pb-2 pt-1 text-[11px] text-zinc-400 transition-colors', tab === key && 'text-white shadow-[inset_0_-2px_0_#fff]')}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>

          <div className="flex min-h-[72px] flex-col justify-center gap-1.5">
            {(tab === 'trim' || tab === 'cover') && (
              <>
                <div
                  ref={stripRef}
                  onPointerDown={onStripDown}
                  onPointerMove={onStripMove}
                  onPointerUp={onStripUp}
                  onPointerCancel={onStripUp}
                  className="relative flex h-11 touch-none select-none overflow-hidden rounded-md bg-zinc-900"
                  aria-label={tab === 'trim' ? _copy('dmVideo.trimAria', { defaultValue: 'Drag the ends to trim' }) : _copy('dmVideo.coverAria', { defaultValue: 'Tap a frame to set the cover' })}
                >
                  {Array.from({ length: FRAME_COUNT }).map((_, i) => (
                    <span key={i} className="h-full flex-1 bg-cover bg-center" style={frames[i] ? { backgroundImage: `url(${frames[i]})` } : undefined} />
                  ))}
                  {tab === 'trim' ? (
                    <>
                      <span className="pointer-events-none absolute inset-y-0 left-0 bg-black/65" style={{ width: pct(start) }} />
                      <span className="pointer-events-none absolute inset-y-0 right-0 bg-black/65" style={{ left: pct(end) }} />
                      <span className="pointer-events-none absolute inset-y-0 border-y-2 border-white" style={{ left: pct(start), width: `calc(${pct(end)} - ${pct(start)})` }} />
                      <span className="pointer-events-none absolute inset-y-0 w-2.5 rounded-l-md bg-white" style={{ left: pct(start) }} />
                      <span className="pointer-events-none absolute inset-y-0 w-2.5 -translate-x-full rounded-r-md bg-white" style={{ left: pct(end) }} />
                    </>
                  ) : (
                    options.coverAt != null && (
                      <span className="pointer-events-none absolute inset-y-0 w-1 -translate-x-1/2 rounded bg-white shadow-[0_0_0_2px_rgba(0,0,0,.5)]" style={{ left: pct(options.coverAt) }} />
                    )
                  )}
                </div>
                <div className="flex justify-between text-[11px] tabular-nums text-zinc-400">
                  {tab === 'trim' ? (
                    <>
                      <span>{formatClock(start)}</span>
                      <span className="text-white">{_copy('dmVideo.kept', { defaultValue: '{{time}} kept', time: formatClock(kept) })}</span>
                      <span>{formatClock(end)}</span>
                    </>
                  ) : (
                    <>
                      <span>{_copy('dmVideo.coverHint', { defaultValue: 'Tap a frame to set the cover' })}</span>
                      <span>{options.coverAt != null ? formatClock(options.coverAt) : _copy('dmVideo.coverAuto', { defaultValue: 'Auto' })}</span>
                    </>
                  )}
                </div>
              </>
            )}
            {tab === 'mirror' && (
              <div className="flex overflow-hidden rounded-full border border-white/15">
                {[false, true].map((m) => (
                  <button
                    key={String(m)}
                    type="button"
                    onClick={() => set({ mirror: m || undefined })}
                    className={cn('flex-1 py-2 text-xs font-semibold text-zinc-400', !!options.mirror === m && 'bg-white text-black')}
                  >
                    {m ? _copy('dmVideo.mirrored', { defaultValue: 'Mirrored' }) : _copy('dmVideo.original', { defaultValue: 'Original' })}
                  </button>
                ))}
              </div>
            )}
            {tab === 'rotate' && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => set({ rotate: nextQuarterTurn(options.rotate) || undefined })}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-white py-2 text-xs font-bold text-black"
                >
                  <RotateCw className="h-4 w-4" /> {_copy('dmVideo.rotate90', { defaultValue: 'Rotate 90°' })}
                </button>
                <span className="w-12 text-center text-xs tabular-nums text-zinc-400">{options.rotate ?? 0}°</span>
              </div>
            )}
            {tab === 'hide' && (
              <div className={cn('grid gap-1.5', isVideo ? 'grid-cols-3' : 'grid-cols-2')}>
                <HideOption
                  active={options.hidden !== 'reveal' && lockPrice == null}
                  onClick={() => { set({ hidden: undefined }); onLockPriceChange?.(null); }}
                  icon={<Eye className="h-3.5 w-3.5" />}
                  title={_copy('dmVideo.showNormally', { defaultValue: 'Show normally' })}
                  body={_copy('dmVideo.showNormallyBody', { defaultValue: 'They see it right away' })}
                />
                {isVideo && <HideOption
                  active={options.hidden === 'reveal' && lockPrice == null}
                  onClick={() => { set({ hidden: 'reveal' }); onLockPriceChange?.(null); }}
                  icon={<EyeOff className="h-3.5 w-3.5" />}
                  title={_copy('dmVideo.hideUntilTap', { defaultValue: 'Hide until tapped' })}
                  body={_copy('dmVideo.hideUntilTapBody', { defaultValue: 'Blurred until they tap it' })}
                />}
                <HideOption
                  disabled={!onLockPriceChange}
                  active={lockPrice != null}
                  onClick={() => { set({ hidden: undefined }); if (lockPrice == null) onLockPriceChange?.(LOCK_DEFAULT_USD); }}
                  icon={<Lock className="h-3.5 w-3.5" />}
                  title={_copy('dmVideo.hidePrice', { defaultValue: 'Hide behind a price' })}
                  body={onLockPriceChange
                    ? _copy('dmVideo.hidePriceBody', { defaultValue: 'Blurred until they pay you' })
                    : _copy('dmVideo.priceUnavailable', { defaultValue: 'Not in this chat' })}
                />
              </div>
            )}
            {tab === 'hide' && lockPrice != null && onLockPriceChange && (
              <LockPriceControl value={lockPrice} onChange={onLockPriceChange} kind={item.kind} />
            )}
            {tab === 'timer' && (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {([null, ...DESTRUCT_CHOICES] as (DmDestructChoice | null)[]).map((c) => (
                    <button
                      key={String(c)}
                      type="button"
                      aria-pressed={destruct === c}
                      onClick={() => onDestructChange(c)}
                      className={cn(
                        'rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold text-zinc-300',
                        destruct === c && 'border-white bg-white text-black',
                      )}
                    >
                      {c == null
                        ? _copy('dmVideo.timerOff', { defaultValue: 'Off' })
                        : _copy(`dmVideo.destruct.${c}`, { defaultValue: destructLabel(c) })}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] leading-snug text-zinc-400">
                  {destruct == null
                    ? _copy('dmVideo.timerOffBody', { defaultValue: 'It stays in the chat.' })
                    : destruct === 'view'
                      ? _copy('dmVideo.timerViewBody', { defaultValue: 'Gone for both of you once they have seen it.' })
                      : _copy('dmVideo.timerTimeBody', { defaultValue: 'Gone for both of you {{value1}} after you send it.', value1: destructLabel(destruct) })}
                </p>
              </div>
            )}
          </div>
          </>}

          <button
            type="button"
            onClick={onConfirm}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-white text-sm font-bold text-black transition-opacity active:opacity-80"
          >
            <Check className="h-4 w-4" />
            {confirmLabel ?? _copy('dmVideo.confirm', { defaultValue: 'Confirm' })}
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function DestructChip({ choice, short }: { choice: DmDestructChoice; short?: boolean }) {
  const { t: _copy } = _useCopy();
  return (
    <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
      <Timer className="h-3 w-3" />
      {short ? destructShort(choice) : _copy(`dmVideo.destruct.${choice}`, { defaultValue: destructLabel(choice) })}
    </span>
  );
}

function HideOption({ active, onClick, icon, title, body, disabled }: { active?: boolean; onClick?: () => void; icon: React.ReactNode; title: string; body: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={!!active}
      className={cn(
        'flex min-w-0 flex-col items-start gap-0.5 rounded-lg border border-white/15 px-2 py-1.5 text-left disabled:opacity-45',
        active && 'border-white bg-white/10',
      )}
    >
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-white">{icon}{title}</span>
      <span className="text-[10px] leading-tight text-zinc-400">{body}</span>
    </button>
  );
}

export { cleanVideoOptions };
