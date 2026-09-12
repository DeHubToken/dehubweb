import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Upload } from 'lucide-react';
import { getNFTInfo, replacePostImage, addPostImages, getPostImageAllowance } from '@/lib/api/dehub';
import { buildFeedImageUrls } from '@/lib/media-url';
import { applyImageReplacement } from '@/lib/optimistic-edit';
import { toast } from 'sonner';

export function EditPostImages({ tokenId, disabled, onBusyChange }: {
  tokenId: number | string; disabled: boolean; onBusyChange: (busy: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [images, setImages] = useState<string[]>([]);
  const [imageLimit, setImageLimit] = useState<number | null>(null);
  const addInput = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const position = useRef(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    setImageLimit(null);
    getPostImageAllowance(tokenId).then(({ imageLimit }) => {
      if (active) setImageLimit(imageLimit);
    }).catch(() => { /* Replacement remains available if allowance cannot load. */ });
    getNFTInfo(String(tokenId)).then(post => {
      if (active) setImages(['feed-images', 'image'].includes(post.postType) ? post.imageUrls ?? [] : []);
    }).catch(() => { if (active) setFailed(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [tokenId, attempt]);

  const replace = async (file: File) => {
    if (busy || disabled) return;
    if (!/^image\/(jpeg|png|webp|gif|heic|heif|avif)$/i.test(file.type) || file.size > 20 * 1024 * 1024) {
      toast.error('Choose an image of 20 MB or smaller');
      return;
    }
    setBusy(true);
    onBusyChange(true);
    try {
      const updated = await replacePostImage(tokenId, position.current, file);
      setImages(updated);
      applyImageReplacement(queryClient, tokenId, updated);
      toast.success('Image replaced');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not replace that image');
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  };

  const add = async (files: File[]) => {
    if (busy || disabled || imageLimit === null || !files.length) return;
    if (images.length + files.length > imageLimit) {
      toast.error(`Your badge tier allows up to ${imageLimit} images per post`);
      return;
    }
    if (files.some(file => !/^image\/(jpeg|png|webp|gif|heic|heif|avif)$/i.test(file.type) || file.size > 20 * 1024 * 1024)) {
      toast.error('Choose images of 20 MB or smaller');
      return;
    }
    position.current = -1;
    setBusy(true);
    onBusyChange(true);
    try {
      const updated = await addPostImages(tokenId, files);
      setImages(updated);
      applyImageReplacement(queryClient, tokenId, updated);
      toast.success('Images added');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add those images');
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  };

  if (loading) return <p className="text-sm text-zinc-400">Loading post images…</p>;
  if (failed) return <button type="button" className="text-sm text-zinc-300" onClick={() => setAttempt(value => value + 1)}>Could not load post images. Retry</button>;
  if (!images.length) return null;
  const previews = buildFeedImageUrls(images) ?? [];
  return <section className="space-y-2">
    <h3 className="text-sm font-medium text-zinc-300">Images</h3>
    <p className="text-xs text-zinc-400">Adding or replacing images saves immediately. Your post keeps its link, views and comments.</p>
    {imageLimit === null ? <button type="button" disabled={busy || disabled} className="text-xs text-zinc-400" onClick={() => setAttempt(value => value + 1)}>Image allowance unavailable. Retry</button> :
      <p className="text-xs text-zinc-400">{images.length} / {imageLimit} images · Based on your badge tier</p>}
    <input ref={addInput} type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,image/avif" className="hidden" onChange={event => {
      const files = Array.from(event.target.files ?? []);
      event.target.value = '';
      void add(files);
    }} />
    <button type="button" disabled={busy || disabled || imageLimit === null || images.length >= imageLimit}
      onClick={() => addInput.current?.click()} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white disabled:opacity-50">
      {busy && position.current === -1 ? 'Adding images…' : imageLimit !== null && images.length >= imageLimit ? 'Badge image limit reached' : 'Add images'}
    </button>
    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,image/avif" className="hidden" onChange={event => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (file) void replace(file);
    }} />
    <div className="grid grid-cols-2 gap-3">
      {previews.map((src, index) => <button key={index} type="button" disabled={busy || disabled}
        onClick={() => { position.current = index; input.current?.click(); }}
        className="overflow-hidden rounded-xl border border-white/10 bg-white/5 text-white disabled:opacity-50">
        <img src={src} alt={`Image ${index + 1}`} className="h-28 w-full object-contain" />
        <span className="flex items-center justify-center gap-2 p-2 text-sm">
          {busy && position.current === index ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {busy && position.current === index ? 'Replacing…' : `Replace image ${index + 1}`}
        </span>
      </button>)}
    </div>
  </section>;
}
