import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation as _useCopy } from 'react-i18next';
import { Play, Pause, EyeOff, Hand, Volume2, VolumeX, Timer } from 'lucide-react';
import { destructLeft, type DmDestruct } from '@/lib/dm-destruct';
import { cn } from '@/lib/utils';
import {
  fitVideoBox,
  formatClock,
  hasRevealed,
  keptDuration,
  markRevealed,
  posterTime,
  videoTransform,
  type DmVideoOptions,
} from '@/lib/dm-video-options';

/**
 * The picture of a DM video at its real shape, with the sender's trim, cover,
 * mirror and rotation applied. Shared by the sent bubble and the composer.
 */
export function DmVideoFrame({
  src,
  width,
  height,
  options,
  maxW,
  maxH,
  className,
  videoRef,
  autoPlay,
  loop,
  muted = true,
  onMeta,
  children,
  blurred,
  onTimeUpdate,
  onPlayState,
  poster,
}: {
  /** Still shown while there is no source yet (an encrypted video before it opens). */
  poster?: string;
  src?: string;
  width?: number;
  height?: number;
  options?: DmVideoOptions | null;
  maxW: number;
  maxH: number;
  className?: string;
  videoRef?: React.MutableRefObject<HTMLVideoElement | null>;
  autoPlay?: boolean;
  loop?: boolean;
  muted?: boolean;
  onMeta?: (m: { w: number; h: number; dur: number }) => void;
  children?: ReactNode;
  blurred?: boolean;
  onTimeUpdate?: (t: number) => void;
  onPlayState?: (playing: boolean) => void;
}) {
  const own = useRef<HTMLVideoElement | null>(null);
  const ref = videoRef ?? own;
  const [meta, setMeta] = useState<{ w: number; h: number } | null>(width && height ? { w: width, h: height } : null);
  const { boxW, boxH, innerW, innerH } = fitVideoBox(meta?.w, meta?.h, options, maxW, maxH);
  const start = options?.trimStart ?? 0;
  const end = options?.trimEnd;

  // The kept range is the whole video as far as anyone watching can tell.
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const onTime = () => {
      if (end != null && v.currentTime >= end) {
        if (loop) v.currentTime = start;
        else { v.pause(); v.currentTime = start; }
      } else if (v.currentTime < start - 0.05 && !v.seeking) {
        v.currentTime = start;
      }
      onTimeUpdate?.(v.currentTime);
    };
    const onPlay = () => { if (v.currentTime < start || (end != null && v.currentTime >= end)) v.currentTime = start; onPlayState?.(true); };
    const onPause = () => onPlayState?.(false);
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('ended', onPause);
    return () => {
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('ended', onPause);
    };
  }, [ref, start, end, loop, onTimeUpdate, onPlayState]);

  // Show the cover frame (or the kept start) before anything plays.
  useEffect(() => {
    const v = ref.current;
    if (!v || !src || autoPlay) return;
    const at = posterTime(options);
    const seek = () => { try { if (v.paused) v.currentTime = at; } catch { /* not seekable yet */ } };
    if (v.readyState >= 1) seek();
    else v.addEventListener('loadedmetadata', seek, { once: true });
    return () => v.removeEventListener('loadedmetadata', seek);
  }, [ref, src, autoPlay, options]);

  return (
    <div
      data-dm-video
      className={cn('relative overflow-hidden rounded-lg bg-black', className)}
      style={{ width: boxW, height: boxH, maxWidth: '100%' }}
    >
      {!src && poster && (
        <img
          src={poster}
          alt=""
          className={cn('absolute left-1/2 top-1/2 object-cover', blurred && 'blur-xl scale-110 brightness-75')}
          style={{ width: innerW, height: innerH, transform: `translate(-50%, -50%) ${videoTransform(options) ?? ''}` }}
        />
      )}
      {src && (
        <video
          ref={ref}
          src={src}
          playsInline
          muted={muted}
          loop={false}
          autoPlay={autoPlay}
          preload="metadata"
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            if (v.videoWidth && v.videoHeight) {
              if (!meta || meta.w !== v.videoWidth || meta.h !== v.videoHeight) setMeta({ w: v.videoWidth, h: v.videoHeight });
              onMeta?.({ w: v.videoWidth, h: v.videoHeight, dur: v.duration });
            }
          }}
          className={cn('absolute left-1/2 top-1/2 object-cover transition-[filter,transform] duration-500', blurred && 'blur-xl scale-110 brightness-75')}
          style={{
            width: innerW,
            height: innerH,
            transform: `translate(-50%, -50%) ${videoTransform(options) ?? ''}`,
          }}
        />
      )}
      {children}
    </div>
  );
}

/**
 * A sent (or received) DM video: real shape, length chip, tap to play with a
 * thin progress line, and — when the sender hid it — a frosted cover that
 * lifts like a blind on tap.
 */
export function DmVideoBubble({
  messageId,
  src,
  width,
  height,
  duration,
  options,
  mine,
  autoPlay,
  onNeedSource,
  loading,
  poster,
  destruct,
  onViewed,
}: {
  /** Self-destruct timer on this message. */
  destruct?: DmDestruct | null;
  /** View-once: called once when the other person has watched it. */
  onViewed?: () => void;
  poster?: string;
  messageId: string;
  src?: string;
  width?: number;
  height?: number;
  duration?: number;
  options?: DmVideoOptions | null;
  mine: boolean;
  /** Start playing as soon as the source arrives (encrypted videos load on tap). */
  autoPlay?: boolean;
  /** Encrypted videos have no source until tapped. */
  onNeedSource?: () => void;
  loading?: boolean;
}) {
  const { t: _copy } = _useCopy();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [dur, setDur] = useState<number | undefined>(duration);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [muted, setMuted] = useState(false);
  const hiddenForMe = options?.hidden === 'reveal' && !mine;
  const [covered, setCovered] = useState(() => hiddenForMe && !hasRevealed(messageId));
  const [lifting, setLifting] = useState(false);

  const viewOnce = destruct?.mode === 'view';
  const watched = useRef(false);
  const reported = useRef(false);
  const report = () => {
    if (!viewOnce || mine || !watched.current || reported.current) return;
    reported.current = true;
    onViewed?.();
  };
  // Leaving the chat after starting a view-once video counts as watching it.
  const reportRef = useRef(report);
  reportRef.current = report;
  useEffect(() => () => reportRef.current(), []);
  const [, tick] = useState(0);
  useEffect(() => {
    if (destruct?.mode !== 'time') return;
    const id = window.setInterval(() => tick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, [destruct?.mode]);
  const left = destructLeft(destruct);

  const start = options?.trimStart ?? 0;
  const kept = keptDuration(options, dur);
  const progress = kept ? Math.min(1, Math.max(0, (time - start) / kept)) : 0;

  useEffect(() => {
    if (autoPlay && src && videoRef.current && !covered) {
      videoRef.current.muted = false;
      void videoRef.current.play().catch(() => {
        if (videoRef.current) { videoRef.current.muted = true; setMuted(true); void videoRef.current.play().catch(() => undefined); }
      });
    }
  }, [autoPlay, src, covered]);

  const reveal = () => {
    setLifting(true);
    markRevealed(messageId);
    window.setTimeout(() => { setCovered(false); setLifting(false); }, 750);
  };

  const toggle = () => {
    if (covered) { if (!lifting) reveal(); return; }
    const v = videoRef.current;
    if (!src || !v) { onNeedSource?.(); return; }
    if (v.paused) { v.muted = muted; void v.play().catch(() => undefined); }
    else v.pause();
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="block text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 rounded-lg"
      aria-label={covered
        ? _copy('dmVideo.revealAria', { defaultValue: 'Reveal hidden video' })
        : playing ? _copy('dmVideo.pause', { defaultValue: 'Pause video' }) : _copy('dmVideo.play', { defaultValue: 'Play video' })}
    >
      <DmVideoFrame
        src={src}
        width={width}
        height={height}
        options={options}
        maxW={240}
        maxH={300}
        videoRef={videoRef}
        poster={poster}
        muted={muted}
        blurred={covered && !lifting}
        onMeta={(m) => { if (!dur && Number.isFinite(m.dur)) setDur(m.dur); }}
        onTimeUpdate={(t) => {
          setTime(t);
          // Reached the end of the kept part: that is one full view.
          const endAt = options?.trimEnd ?? dur;
          if (endAt && t >= endAt - 0.3) report();
        }}
        onPlayState={(p) => {
          setPlaying(p);
          if (p) watched.current = true;
          else if (watched.current && videoRef.current && videoRef.current.currentTime <= start + 0.05) report();
        }}
      >
        {covered && (
          <span
            className={cn(
              'absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/10 backdrop-blur-2xl transition-transform duration-700 ease-[cubic-bezier(.7,0,.2,1)]',
              lifting && '-translate-y-full',
            )}
          >
            {/* the light that runs up the glass as it lifts */}
            <span className={cn('pointer-events-none absolute inset-x-0 -bottom-10 h-10 bg-gradient-to-b from-transparent via-white/50 to-transparent opacity-0', lifting && 'animate-[dm-reveal-sweep_.7s_ease-out_forwards]')} />
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/40 bg-black/45 px-3 py-1.5 text-xs font-bold text-white">
              <Hand className="h-3.5 w-3.5" />
              {_copy('dmVideo.tapToReveal', { defaultValue: 'Tap to reveal' })}
            </span>
          </span>
        )}
        {!covered && !playing && (
          <span className="absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/35 bg-black/45 text-white backdrop-blur-md">
            {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <Play className="h-5 w-5 fill-current" />}
          </span>
        )}
        {kept != null && (
          <span className="absolute left-1.5 top-1.5 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white backdrop-blur-sm">
            {formatClock(playing ? kept - (time - start) : kept)}
          </span>
        )}
        {destruct && (viewOnce || left) && (
          <span className={cn('absolute left-1.5 inline-flex items-center gap-1 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm', kept != null ? 'top-7' : 'top-1.5')}>
            <Timer className="h-3 w-3" />
            {viewOnce ? _copy('dmVideo.destruct.view', { defaultValue: '1 view' }) : left}
          </span>
        )}
        {mine && options?.hidden === 'reveal' && (
          <span className="absolute right-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
            <EyeOff className="h-3 w-3" />
            {_copy('dmVideo.hiddenTag', { defaultValue: 'Hidden' })}
          </span>
        )}
        {!covered && (playing || time > start + 0.1) && (
          <>
            <span className="absolute inset-x-0 bottom-0 h-[3px] bg-white/25">
              <span className="block h-full bg-white" style={{ width: `${progress * 100}%` }} />
            </span>
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => { e.stopPropagation(); const v = videoRef.current; if (v) { v.muted = !v.muted; setMuted(v.muted); } }}
              className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white"
              aria-label={muted ? _copy('dmVideo.unmute', { defaultValue: 'Unmute' }) : _copy('dmVideo.mute', { defaultValue: 'Mute' })}
            >
              {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
            </span>
            {playing && <Pause className="sr-only" />}
          </>
        )}
      </DmVideoFrame>
    </button>
  );
}
