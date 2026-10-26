/**
 * VoiceStripPlayer
 * ================
 * The one player for every voice note: comment replies, DMs, community, event
 * and live chats. It is the Stages recording scrubber shrunk into a reply: a
 * glass row, a square play key, thin mirrored bars cut from the note's own
 * loudness, the time left and a speed chip. Bars around the playhead bounce
 * while it plays; drag anywhere on them to scrub.
 *
 * Bars and text are drawn in currentColor from text-white classes, so the
 * light tones' ink remaps paint them dark without a rule of their own.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation as _useCopy } from 'react-i18next';
import Play from '@/components/ui/cut-icons/play';
import Pause from '@/components/ui/cut-icons/pause';
import { cn } from '@/lib/utils';
import { registerOffDocumentMedia } from '@/lib/pause-media-in';

const BAR_COUNT = 56;
const BAR_W = 2;
const BAR_GAP = 1.5;
const VIEW_H = 60;
const RATES = [1, 1.5, 2] as const;

/** Only one voice note talks at a time, across every list on the page. */
let speaking: HTMLAudioElement | null = null;

function seeded(seed: string, count: number): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  const rand = () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length: count }, (_, i) => {
    const env = 0.35 + 0.65 * Math.sin((i / (count - 1)) * Math.PI);
    return Math.max(0.08, env * (0.35 + 0.65 * rand()));
  });
}

function peaksOf(buffer: AudioBuffer, count: number): number[] {
  const data = buffer.getChannelData(0);
  const block = Math.max(1, Math.floor(data.length / count));
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    let sum = 0;
    const start = i * block;
    const end = Math.min(start + block, data.length);
    for (let j = start; j < end; j++) sum += Math.abs(data[j]);
    out.push(end > start ? sum / (end - start) : 0);
  }
  const max = Math.max(...out, 0.0001);
  return out.map((v) => Math.max(0.08, v / max));
}

const fmt = (s: number) => {
  const t = Math.max(0, Math.floor(s || 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

interface VoiceStripPlayerProps {
  src: string;
  /** Seconds, shown until the audio reports its own length. */
  duration?: number;
  className?: string;
}

export const VoiceStripPlayer = memo(function VoiceStripPlayer({ src, duration: durationHint, className }: VoiceStripPlayerProps) {
  const { t } = _useCopy();
  const fallback = useMemo(() => seeded(src, BAR_COUNT), [src]);
  const [peaks, setPeaks] = useState<number[]>(fallback);
  const [duration, setDuration] = useState(durationHint ?? 0);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState<(typeof RATES)[number]>(1);
  const [pulse, setPulse] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const frame = useRef(0);

  useEffect(() => setPeaks(fallback), [fallback]);

  // The note's real loudness, once it can be read. A failed decode (a codec
  // the browser can play but not decode, a blocked fetch) keeps the seeded bars.
  useEffect(() => {
    let cancelled = false;
    const Ctx = typeof window !== 'undefined' ? (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
    if (!Ctx || typeof fetch !== 'function') return;
    let ctx: AudioContext | null = null;
    try { ctx = new Ctx(); } catch { return; }
    fetch(src)
      .then((r) => r.arrayBuffer())
      .then((buf) => ctx!.decodeAudioData(buf))
      .then((decoded) => {
        if (cancelled) return;
        setPeaks(peaksOf(decoded, BAR_COUNT));
        if (Number.isFinite(decoded.duration) && decoded.duration > 0) setDuration(decoded.duration);
      })
      .catch(() => {})
      .finally(() => { ctx?.close().catch(() => {}); });
    return () => { cancelled = true; };
  }, [src]);

  // The element never enters the document, so it is registered against the
  // row: a page cached by PersistentPageCache then pauses it on the way out.
  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.src = src;
    audioRef.current = audio;
    const unregisterMedia = registerOffDocumentMedia(audio, () => rootRef.current);
    const onMeta = () => { if (Number.isFinite(audio.duration) && audio.duration > 0) setDuration(audio.duration); };
    const onEnded = () => { setPlaying(false); setTime(0); audio.currentTime = 0; };
    const onPause = () => setPlaying(false);
    const onPlay = () => setPlaying(true);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('play', onPlay);
    return () => {
      unregisterMedia();
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      if (speaking === audio) speaking = null;
      audioRef.current = null;
    };
  }, [src]);

  useEffect(() => {
    if (!playing) return;
    const tick = (now: number) => {
      const a = audioRef.current;
      if (a) setTime(a.currentTime);
      setPulse(now / 1000);
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [playing]);

  const toggle = useCallback((e: React.SyntheticEvent) => {
    e.stopPropagation();
    const a = audioRef.current;
    if (!a) return;
    if (!a.paused) { a.pause(); return; }
    if (speaking && speaking !== a) speaking.pause();
    speaking = a;
    a.playbackRate = rate;
    a.play().catch(() => setPlaying(false));
  }, [rate]);

  const cycleRate = useCallback((e: React.SyntheticEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
    setRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  }, [rate]);

  const seekTo = useCallback((clientX: number) => {
    const svg = svgRef.current;
    const a = audioRef.current;
    if (!svg || !a) return;
    const rect = svg.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const len = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : duration;
    if (!len) return;
    a.currentTime = pos * len;
    setTime(pos * len);
  }, [duration]);

  const progress = duration > 0 ? Math.min(1, time / duration) : 0;
  const started = playing || time > 0;
  const label = started ? fmt(time) : fmt(duration);
  const width = BAR_COUNT * (BAR_W + BAR_GAP);

  return (
    <div
      ref={rootRef}
      data-voice-strip
      data-glass-playback-surface
      data-no-navigate
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'flex items-center gap-2 w-full max-w-[340px] min-w-0 rounded-xl border border-white/[0.08] bg-white/[0.05] py-1.5 pl-1.5 pr-2 text-white',
        className,
      )}
    >
      <button
        type="button"
        data-glass-playback-control
        onClick={toggle}
        aria-label={playing ? t('stages.pause') : t('copy.4b3c1e0a7d21', { defaultValue: 'Play voice note' })}
        className={cn(
          'shrink-0 w-[34px] h-[34px] rounded-[9px] flex items-center justify-center transition-colors',
          playing ? 'bg-white text-black' : 'bg-white/15 text-white hover:bg-white/25',
        )}
      >
        {playing ? <Pause className="w-3.5 h-3.5" fill="currentColor" /> : <Play className="w-3.5 h-3.5 ml-0.5" fill="currentColor" />}
      </button>

      <svg
        ref={svgRef}
        data-playback-seek
        viewBox={`0 0 ${width} ${VIEW_H}`}
        preserveAspectRatio="none"
        role="slider"
        aria-label={t('copy.9d0e2c4f6a18', { defaultValue: 'Voice note position' })}
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(time)}
        tabIndex={0}
        className="flex-1 min-w-0 h-[30px] cursor-pointer touch-none"
        onPointerDown={(e) => {
          e.stopPropagation();
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          seekTo(e.clientX);
        }}
        onPointerMove={(e) => { if (dragging.current) seekTo(e.clientX); }}
        onPointerUp={(e) => {
          dragging.current = false;
          if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={() => { dragging.current = false; }}
        onKeyDown={(e) => {
          const a = audioRef.current;
          if (!a || !duration) return;
          if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault();
            a.currentTime = Math.max(0, Math.min(duration, a.currentTime + (e.key === 'ArrowRight' ? 2 : -2)));
            setTime(a.currentTime);
          }
        }}
      >
        {peaks.map((v, i) => {
          const u = i / (BAR_COUNT - 1);
          const near = playing ? Math.abs(u - progress) : 1;
          const bounce = near < 0.07 ? 1 + 0.45 * (1 - near / 0.07) * Math.abs(Math.sin(pulse * 14 + i * 1.7)) : 1;
          const h = Math.max(3, Math.min(1, v * bounce) * VIEW_H * 0.9);
          const lit = Math.max(0, Math.min(1, progress * BAR_COUNT - i));
          const dim = 0.18 + v * 0.14;
          return (
            <rect
              key={i}
              data-waveform-played={lit > 0 || undefined}
              x={i * (BAR_W + BAR_GAP)}
              y={(VIEW_H - h) / 2}
              width={BAR_W}
              height={h}
              rx={1}
              fill="currentColor"
              opacity={dim + (0.95 - dim) * lit}
            />
          );
        })}
      </svg>

      <span className="shrink-0 min-w-[30px] text-right text-[11px] font-mono tabular-nums text-white/55">{label}</span>
      <button
        type="button"
        data-glass-playback-control
        onClick={cycleRate}
        aria-label={t('copy.9bf75671f22f', { defaultValue: 'Playback speed {{value1}}', value1: `${rate}x` })}
        className={cn(
          'shrink-0 h-6 min-w-[30px] px-1.5 rounded-md border text-[10px] font-mono font-bold leading-none transition-colors',
          rate !== 1 ? 'border-transparent bg-white/20 text-white' : 'border-white/10 text-white/55 hover:text-white',
        )}
      >
        {rate}x
      </button>
    </div>
  );
});

export default VoiceStripPlayer;
