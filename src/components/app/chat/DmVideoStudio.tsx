import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation as _useCopy } from 'react-i18next';
import { Image as ImageIcon, Scissors, FlipHorizontal2, RotateCw, EyeOff, Lock, Eye, Check } from 'lucide-react';
import X from '@/components/ui/cut-icons/close';
import Send from '@/components/ui/cut-icons/send';
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
import { DmVideoFrame } from './DmVideo';

type Tab = 'cover' | 'trim' | 'mirror' | 'rotate' | 'hide';
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
}: {
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
 * Big playing preview with Cover, Trim, Mirror, Rotate and Hide, plus the
 * caption and Send, so a video can go out from here without closing it.
 */
export function DmVideoStudio({
  open,
  onOpenChange,
  url,
  file,
  duration,
  options,
  onOptionsChange,
  onRemove,
  caption,
  onCaptionChange,
  onSend,
  sendDisabled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  file: File;
  duration?: number;
  options: DmVideoOptions;
  onOptionsChange: (o: DmVideoOptions) => void;
  onRemove: () => void;
  caption: string;
  onCaptionChange: (v: string) => void;
  onSend: () => void;
  sendDisabled?: boolean;
}) {
  const { t: _copy } = _useCopy();
  const [tab, setTab] = useState<Tab>('trim');
  const frames = useFilmstrip(url, duration, open && (tab === 'trim' || tab === 'cover'));
  const videoRef = useRef<HTMLVideoElement | null>(null);
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

  const tabs: { key: Tab; label: string; icon: typeof Scissors }[] = [
    { key: 'cover', label: _copy('dmVideo.cover', { defaultValue: 'Cover' }), icon: ImageIcon },
    { key: 'trim', label: _copy('dmVideo.trim', { defaultValue: 'Trim' }), icon: Scissors },
    { key: 'mirror', label: _copy('dmVideo.mirror', { defaultValue: 'Mirror' }), icon: FlipHorizontal2 },
    { key: 'rotate', label: _copy('dmVideo.rotate', { defaultValue: 'Rotate' }), icon: RotateCw },
    { key: 'hide', label: _copy('dmVideo.hide', { defaultValue: 'Hide' }), icon: EyeOff },
  ];

  const pct = (t: number) => (dur ? `${(t / dur) * 100}%` : '0%');

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent column hideHandle className="dark-surface flex max-h-[94dvh] flex-col overflow-hidden border-zinc-800 bg-zinc-950 text-white">
        <DrawerTitle className="sr-only">{_copy('dmVideo.sheetTitle', { defaultValue: 'Edit video' })}</DrawerTitle>
        <div className="flex items-center justify-between px-3 pt-3">
          <button
            type="button"
            onClick={() => { onRemove(); onOpenChange(false); }}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-white/5 text-white hover:bg-white/10"
            aria-label={_copy('copy.595b066a8838', { defaultValue: 'Remove attachment' })}
          >
            <X className="h-4 w-4" />
          </button>
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold tabular-nums">
            {kept != null ? `${formatClock(kept)} · ` : ''}{formatAttachmentSize(file.size)}
          </span>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-white/5 text-white hover:bg-white/10"
            aria-label={_copy('dmVideo.done', { defaultValue: 'Done' })}
          >
            <Check className="h-4 w-4" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 items-center justify-center px-3 py-3">
          <DmVideoFrame
            src={url}
            options={{ ...options, coverAt: undefined }}
            maxW={Math.min(360, typeof window !== 'undefined' ? window.innerWidth - 24 : 360)}
            maxH={typeof window !== 'undefined' ? Math.max(200, Math.round(window.innerHeight * 0.42)) : 320}
            videoRef={videoRef}
            autoPlay={open}
            loop
            blurred={options.hidden === 'reveal'}
          >
            {options.hidden === 'reveal' && (
              <span className="absolute left-1/2 top-1/2 inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-black/60 px-2.5 py-1 text-xs font-bold">
                <EyeOff className="h-3.5 w-3.5" /> {_copy('dmVideo.hiddenUntilTap', { defaultValue: 'Hidden until they tap it' })}
              </span>
            )}
          </DmVideoFrame>
        </div>

        <div className="flex flex-col gap-3 px-3 pb-[max(12px,env(safe-area-inset-bottom))]">
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
              <div className="grid grid-cols-3 gap-1.5">
                <HideOption
                  active={options.hidden !== 'reveal'}
                  onClick={() => set({ hidden: undefined })}
                  icon={<Eye className="h-3.5 w-3.5" />}
                  title={_copy('dmVideo.showNormally', { defaultValue: 'Show normally' })}
                  body={_copy('dmVideo.showNormallyBody', { defaultValue: 'They see it right away' })}
                />
                <HideOption
                  active={options.hidden === 'reveal'}
                  onClick={() => set({ hidden: 'reveal' })}
                  icon={<EyeOff className="h-3.5 w-3.5" />}
                  title={_copy('dmVideo.hideUntilTap', { defaultValue: 'Hide until tapped' })}
                  body={_copy('dmVideo.hideUntilTapBody', { defaultValue: 'Blurred until they tap it' })}
                />
                <HideOption
                  disabled
                  icon={<Lock className="h-3.5 w-3.5" />}
                  title={_copy('dmVideo.hidePrice', { defaultValue: 'Hide behind a price' })}
                  body={_copy('dmVideo.soon', { defaultValue: 'Coming soon' })}
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-white/15 py-1 pl-3 pr-1">
            <input
              value={caption}
              onChange={(e) => onCaptionChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !sendDisabled) { e.preventDefault(); onSend(); } }}
              placeholder={_copy('dmVideo.captionPlaceholder', { defaultValue: 'Add a caption…' })}
              className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={onSend}
              disabled={sendDisabled}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-black disabled:opacity-40"
              aria-label={_copy('dmVideo.send', { defaultValue: 'Send video' })}
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
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
