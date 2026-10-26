/**
 * The clip editor: trim, title, cut, post.
 *
 * One sheet for both ways a clip starts. A viewer's Clip button opens it on a
 * row that is still grabbing the last minute of the live stream (or straight
 * on the replay); the streamer's Highlights panel opens it on an auto-cut
 * moment. Either way it walks the same states the row does — capturing,
 * draft, rendering, ready, posted — polling the function between them.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import {
  CLIP_MAX_S, CLIP_MIN_S, liveClipLink, postLiveClip, renderLiveClip, waitForClip, type LiveClip,
} from '@/lib/api/live-clips';

interface Props {
  clip: LiveClip | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Told about every state the clip reaches, so a list can refresh. */
  onChange?: (clip: LiveClip) => void;
}

const fmt = (s: number) => {
  const total = Math.max(0, Math.round(s));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
};

/** Keep [start, end] inside the window and 3-60 s long, moving the side that was not dragged. */
export function clampRange(start: number, end: number, lo: number, hi: number, moved: 'start' | 'end'): [number, number] {
  let s = Math.max(lo, Math.min(start, hi));
  let e = Math.max(lo, Math.min(end, hi));
  if (moved === 'start') {
    if (e - s < CLIP_MIN_S) e = Math.min(hi, s + CLIP_MIN_S);
    if (e - s > CLIP_MAX_S) e = s + CLIP_MAX_S;
    if (e - s < CLIP_MIN_S) s = Math.max(lo, e - CLIP_MIN_S);
  } else {
    if (e - s < CLIP_MIN_S) s = Math.max(lo, e - CLIP_MIN_S);
    if (e - s > CLIP_MAX_S) s = e - CLIP_MAX_S;
    if (e - s < CLIP_MIN_S) e = Math.min(hi, s + CLIP_MIN_S);
  }
  return [Math.round(s * 10) / 10, Math.round(e * 10) / 10];
}

export function ClipEditorSheet({ clip: initial, open, onOpenChange, onChange }: Props) {
  const { t } = useTranslation();
  const { walletAddress } = useAuth();
  const [clip, setClip] = useState<LiveClip | null>(initial);
  const [range, setRange] = useState<[number, number]>([0, 0]);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastMoved = useRef<'start' | 'end'>('end');

  const update = useCallback((next: LiveClip) => {
    setClip(next);
    onChange?.(next);
  }, [onChange]);

  useEffect(() => {
    setClip(initial);
    setError(null);
    if (initial) {
      setTitle(initial.title || initial.streamTitle || '');
      const lo = initial.windowStart;
      const hi = initial.windowEnd;
      setRange(clampRange(initial.start ?? Math.max(lo, hi - 30), initial.end ?? hi, lo, hi, 'end'));
    }
  }, [initial]);

  // Wait out the worker: the grab, then the render.
  const status = clip?.status;
  const clipId = clip?.id;
  useEffect(() => {
    if (!open || !clipId || (status !== 'capturing' && status !== 'rendering')) return;
    const controller = new AbortController();
    waitForClip(clipId, status, { signal: controller.signal })
      .then((next) => {
        update(next);
        if (next.status === 'draft' && status === 'capturing') {
          setRange(clampRange(next.start ?? 0, next.end ?? next.windowEnd, next.windowStart, next.windowEnd, 'end'));
        }
        if (next.status === 'draft' && status === 'rendering' && next.error) setError(next.error);
      })
      .catch((e: Error) => {
        if (e.name !== 'AbortError') setError(e.message);
      });
    return () => controller.abort();
  }, [open, clipId, status, update]);

  // Loop the preview inside the picked stretch.
  const [start, end] = range;
  useEffect(() => {
    const v = videoRef.current;
    if (!v || status !== 'draft') return;
    const onTime = () => {
      if (v.currentTime < start - 0.3 || v.currentTime > end) v.currentTime = start;
    };
    v.addEventListener('timeupdate', onTime);
    return () => v.removeEventListener('timeupdate', onTime);
  }, [start, end, status]);

  const seekTo = (s: number) => {
    const v = videoRef.current;
    if (v && Number.isFinite(s)) v.currentTime = s;
  };

  const onRange = (values: number[]) => {
    const [s, e] = values;
    const moved = s !== range[0] ? 'start' : 'end';
    lastMoved.current = moved;
    const next = clampRange(s, e, clip!.windowStart, clip!.windowEnd, moved);
    setRange(next);
    seekTo(moved === 'start' ? next[0] : Math.max(next[0], next[1] - 2));
  };

  const make = async () => {
    if (!clip) return;
    setBusy(true);
    setError(null);
    try {
      update(await renderLiveClip(clip.id, start, end, title));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const post = async () => {
    if (!clip || !walletAddress) return;
    setBusy(true);
    setError(null);
    try {
      const done = await postLiveClip(clip, walletAddress);
      update(done);
      toast.success(t('liveClips.posted', 'Clip posted to Shorts'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    if (!clip) return;
    try {
      await navigator.clipboard.writeText(liveClipLink(clip));
      toast.success(t('liveClips.linkCopied', 'Link copied'));
    } catch {
      toast.error(t('liveClips.copyFailed', 'Could not copy the link'));
    }
  };

  const waiting = (label: string) => (
    <div className="flex flex-col items-center gap-3 py-10 text-sm text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin" />
      <p>{label}</p>
    </div>
  );

  let body: React.ReactNode = null;
  if (!clip) body = waiting(t('liveClips.starting', 'Starting your clip…'));
  else if (clip.status === 'capturing') body = waiting(t('liveClips.capturing', 'Grabbing the last minute of the stream…'));
  else if (clip.status === 'rendering') body = waiting(t('liveClips.rendering', 'Cutting your clip. This takes about half a minute…'));
  else if (clip.status === 'failed' || clip.status === 'dismissed') {
    body = <p className="py-8 text-center text-sm text-muted-foreground">{clip.error || t('liveClips.failed', 'This clip could not be made.')}</p>;
  } else if (clip.status === 'draft' && clip.sourceUrl) {
    const length = end - start;
    body = (
      <div className="space-y-4">
        <video
          ref={videoRef}
          src={clip.sourceUrl}
          className="aspect-video w-full rounded-lg bg-black object-contain"
          playsInline
          autoPlay
          muted={false}
          controls={false}
          onLoadedMetadata={() => seekTo(start)}
          onClick={(e) => (e.currentTarget.paused ? e.currentTarget.play() : e.currentTarget.pause())}
        />
        <div>
          <SliderPrimitive.Root
            className="relative flex w-full touch-none select-none items-center py-3"
            min={clip.windowStart}
            max={clip.windowEnd}
            step={0.1}
            value={[start, end]}
            onValueChange={onRange}
            minStepsBetweenThumbs={CLIP_MIN_S * 10}
          >
            <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-white/10">
              <SliderPrimitive.Range className="absolute h-full rounded-full bg-primary" />
            </SliderPrimitive.Track>
            {[t('liveClips.trimStart', 'Clip start'), t('liveClips.trimEnd', 'Clip end')].map((label) => (
              <SliderPrimitive.Thumb
                key={label}
                aria-label={label}
                className="block h-5 w-5 rounded-full border-2 border-primary bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            ))}
          </SliderPrimitive.Root>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{fmt(start)}</span>
            <span className="font-medium text-foreground">
              {t('liveClips.length', '{{seconds}}s clip', { seconds: Math.round(length) })}
            </span>
            <span>{fmt(end)}</span>
          </div>
        </div>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, 100))}
          placeholder={t('liveClips.titlePlaceholder', 'Give your clip a title')}
          aria-label={t('liveClips.titleLabel', 'Clip title')}
        />
        <Button className="w-full" onClick={make} disabled={busy || length < CLIP_MIN_S || length > CLIP_MAX_S}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t('liveClips.make', 'Make clip')}
        </Button>
      </div>
    );
  } else if (clip.status === 'ready' && clip.videoUrl) {
    body = (
      <div className="space-y-4">
        <video
          src={clip.videoUrl}
          poster={clip.posterUrl ?? undefined}
          className="mx-auto aspect-[9/16] max-h-[55vh] rounded-lg bg-black"
          playsInline
          autoPlay
          loop
          controls
        />
        <Button className="w-full" onClick={post} disabled={busy || !walletAddress}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t('liveClips.postToShorts', 'Post to Shorts')}
        </Button>
      </div>
    );
  } else if (clip.status === 'posted') {
    body = (
      <div className="space-y-3 py-4 text-center">
        <p className="text-sm">{t('liveClips.postedBody', 'Your clip is on Shorts. Share it so more people find the stream.')}</p>
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={copyLink}>{t('liveClips.copyLink', 'Copy link')}</Button>
          {clip.postTokenId != null && (
            <Button asChild className="flex-1">
              <Link to={`/post/${clip.postTokenId}`} onClick={() => onOpenChange(false)}>{t('liveClips.viewShort', 'View Short')}</Link>
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-lg">
        <DrawerHeader>
          <DrawerTitle>
            {clip?.kind === 'highlight' ? t('liveClips.highlightTitle', 'Highlight') : t('liveClips.title', 'Clip')}
          </DrawerTitle>
        </DrawerHeader>
        <div className="max-h-[80vh] overflow-y-auto px-4 pb-6">
          {body}
          {error && <p className="mt-3 text-center text-sm text-destructive">{error}</p>}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
