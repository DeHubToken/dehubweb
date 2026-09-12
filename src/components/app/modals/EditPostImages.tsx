import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Upload } from 'lucide-react';
import { getNFTInfo, replacePostImage } from '@/lib/api/dehub';
import { buildFeedImageUrls } from '@/lib/media-url';
import { applyImageReplacement } from '@/lib/optimistic-edit';
import { toast } from 'sonner';

export function EditPostImages({ tokenId, disabled, onBusyChange }: {
  tokenId: number | string; disabled: boolean; onBusyChange: (busy: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [images, setImages] = useState<string[]>([]);
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

  if (loading) return <p className="text-sm text-zinc-400">Loading post images…</p>;
  if (failed) return <button type="button" className="text-sm text-zinc-300" onClick={() => setAttempt(value => value + 1)}>Could not load post images. Retry</button>;
  if (!images.length) return null;
  const previews = buildFeedImageUrls(images) ?? [];
  return <section className="space-y-2">
    <h3 className="text-sm font-medium text-zinc-300">Images</h3>
    <p className="text-xs text-zinc-400">Choosing a replacement saves that image immediately. Your post keeps its link, views and comments.</p>
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
