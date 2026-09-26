import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { DEHUB_CDN_BASE, getNFTInfo, replaceVideoCover } from '@/lib/api/dehub';
import { buildImageUrl } from '@/lib/media-url';
import { applyCoverReplacement } from '@/lib/optimistic-edit';
import { MAX_IMAGE_UPLOAD_BYTES } from '@/lib/post-image-allowance';

const FRAME_COUNT = 12;

/**
 * Grab evenly spaced stills from a published video, at the clip's own shape.
 * The CDN answers our origin with CORS headers, which is what lets the canvas
 * be read back; without them toBlob throws and the strip stays empty.
 */
async function grabFrames(src: string, cancelled: () => boolean): Promise<Blob[]> {
  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.preload = 'auto';
  video.src = src;
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error('Failed to load video'));
    setTimeout(() => reject(new Error('Video load timeout')), 15000);
  });
  const { duration, videoWidth: w, videoHeight: h } = video;
  if (!w || !h || !Number.isFinite(duration) || duration <= 0) return [];
  const scale = 1280 / Math.max(w, h);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * Math.min(1, scale));
  canvas.height = Math.round(h * Math.min(1, scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];
  const frames: Blob[] = [];
  for (let i = 0; i < FRAME_COUNT && !cancelled(); i++) {
    video.currentTime = Math.min(duration - 0.1, Math.max(0.01, (duration / FRAME_COUNT) * (i + 0.5)));
    await new Promise<void>(resolve => {
      video.onseeked = () => resolve();
      setTimeout(resolve, 1500);
    });
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    if (blob && blob.size > 1000) frames.push(blob);
  }
  video.removeAttribute('src');
  video.load();
  return frames;
}

export function EditPostCover({ tokenId, disabled, onBusyChange }: {
  tokenId: number | string; disabled: boolean; onBusyChange: (busy: boolean) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [cover, setCover] = useState<string | null>(null);
  const [frames, setFrames] = useState<{ blob: Blob; url: string }[]>([]);
  const [loadingFrames, setLoadingFrames] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    let made: { blob: Blob; url: string }[] = [];
    setLoadingFrames(true);
    getNFTInfo(String(tokenId)).then(async post => {
      if (!active) return;
      setCover(buildImageUrl(tokenId, post.imageUrl) || null);
      if (!post.videoUrl) return;
      const src = post.videoUrl.startsWith('http') ? post.videoUrl : `${DEHUB_CDN_BASE}${post.videoUrl}`;
      const blobs = await grabFrames(src, () => !active);
      made = blobs.map(blob => ({ blob, url: URL.createObjectURL(blob) }));
      if (active) setFrames(made);
    }).catch(() => { /* Upload still works without a frame strip. */ })
      .finally(() => { if (active) setLoadingFrames(false); });
    return () => {
      active = false;
      made.forEach(frame => URL.revokeObjectURL(frame.url));
    };
  }, [tokenId]);

  const save = async (image: Blob, preview: string) => {
    if (busy || disabled) return;
    setBusy(true);
    onBusyChange(true);
    try {
      const imageUrl = await replaceVideoCover(tokenId, image);
      setCover(preview);
      applyCoverReplacement(queryClient, tokenId, imageUrl);
      toast.success(t('drawers.coverSaved'));
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : t('drawers.coverFailed'));
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  };

  return <section className="space-y-2">
    <h3 className="text-sm font-medium text-zinc-300">{t('drawers.coverTitle')}</h3>
    <p className="text-xs text-zinc-400">{t('drawers.coverHint')}</p>
    <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-white/10 bg-black">
      {cover && <img src={cover} alt="" className="h-full w-full object-contain" />}
      {busy && <div className="absolute inset-0 flex items-center justify-center bg-black/60"><Loader2 className="h-6 w-6 animate-spin text-white" /></div>}
    </div>
    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif" className="hidden" onChange={event => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      if (file.size > MAX_IMAGE_UPLOAD_BYTES) { toast.error(t('drawers.coverFailed')); return; }
      void save(file, URL.createObjectURL(file));
    }} />
    <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1">
      <button type="button" disabled={busy || disabled} onClick={() => input.current?.click()} aria-label={t('drawers.coverUpload')}
        className="flex h-12 w-20 flex-shrink-0 items-center justify-center rounded-lg border border-white/20 bg-white/5 disabled:opacity-50">
        <Upload className="h-4 w-4 text-white/70" />
      </button>
      {loadingFrames && <div className="flex h-12 w-20 flex-shrink-0 items-center justify-center rounded-lg border border-white/10"><Loader2 className="h-4 w-4 animate-spin text-white/60" /></div>}
      {frames.map((frame, index) => <button key={frame.url} type="button" disabled={busy || disabled}
        onClick={() => void save(frame.blob, frame.url)}
        className="h-12 w-20 flex-shrink-0 overflow-hidden rounded-lg border-2 border-transparent bg-black hover:border-white/60 disabled:opacity-50">
        <img src={frame.url} alt={`${index + 1}`} className="h-full w-full object-contain" />
      </button>)}
    </div>
  </section>;
}
