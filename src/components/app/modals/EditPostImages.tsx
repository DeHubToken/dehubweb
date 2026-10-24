import { useTranslation as _useCopy } from 'react-i18next';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from "lucide-react";
import Upload from "@/components/ui/cut-icons/upload";

import { getNFTInfo, replacePostImage, addPostImages, getPostImageAllowance, editPost } from '@/lib/api/dehub';
import { AltTextButton, AltTextDialog } from '@/features/post/components/AltTextEditor';
import { buildFeedImageUrls } from '@/lib/media-url';
import { applyImageReplacement } from '@/lib/optimistic-edit';
import { toast } from 'sonner';
import { MAX_IMAGE_UPLOAD_BYTES, MAX_REQUEST_IMAGE_BYTES } from '@/lib/post-image-allowance';

export function EditPostImages({ tokenId, disabled, onBusyChange }: {
  tokenId: number | string; disabled: boolean; onBusyChange: (busy: boolean) => void;
}) {
  const { t: _copy } = _useCopy();
  const queryClient = useQueryClient();
  const [images, setImages] = useState<string[]>([]);
  const [descriptions, setDescriptions] = useState<string[]>([]);
  const [altIndex, setAltIndex] = useState<number | null>(null);
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
      if (active) {
        setImages(['feed-images', 'image'].includes(post.postType) ? post.imageUrls ?? [] : []);
        setDescriptions(post.mediaDescriptions ?? []);
      }
    }).catch(() => { if (active) setFailed(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [tokenId, attempt]);

  const replace = async (file: File) => {
    if (busy || disabled) return;
    if (!/^image\/(jpeg|png|webp|gif|heic|heif|avif)$/i.test(file.type) || file.size > MAX_IMAGE_UPLOAD_BYTES) {
      toast.error(_copy("copy.068a20657fd2", { defaultValue: "Choose an image of 42.069 MB or smaller" }));
      return;
    }
    setBusy(true);
    onBusyChange(true);
    try {
      const updated = await replacePostImage(tokenId, position.current, file);
      setImages(updated);
      applyImageReplacement(queryClient, tokenId, updated);
      toast.success(_copy("copy.5f8fb589fe93", { defaultValue: "Image replaced" }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : _copy("copy.4d8a0bff64c5", { defaultValue: "Could not replace that image" }));
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  };

  const add = async (files: File[]) => {
    if (busy || disabled || imageLimit === null || !files.length) return;
    if (images.length + files.length > imageLimit) {
      toast.error(_copy("copy.881d0b252f79", { defaultValue: "Your badge tier allows up to {{value1}} images per post", value1: imageLimit }));
      return;
    }
    if (files.some(file => !/^image\/(jpeg|png|webp|gif|heic|heif|avif)$/i.test(file.type) || file.size > MAX_IMAGE_UPLOAD_BYTES)) {
      toast.error(_copy("copy.0b923404047d", { defaultValue: "Choose images of 42.069 MB or smaller" }));
      return;
    }
    if (files.reduce((total, file) => total + file.size, 0) > MAX_REQUEST_IMAGE_BYTES) {
      toast.error(_copy("copy.18b277756657", { defaultValue: "Images in one upload must total 100 MB or less" }));
      return;
    }
    position.current = -1;
    setBusy(true);
    onBusyChange(true);
    try {
      const updated = await addPostImages(tokenId, files);
      setImages(updated);
      applyImageReplacement(queryClient, tokenId, updated);
      toast.success(_copy("copy.82c3fa23437f", { defaultValue: "Images added" }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : _copy("copy.0b6b539f3e91", { defaultValue: "Could not add those images" }));
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  };

  // Saves straight away, like replacing an image does: the whole list goes
  // up, positions following the images.
  const saveDescription = async (index: number, text: string) => {
    const next = images.map((_, i) => (i === index ? text.trim() : descriptions[i] || ''));
    while (next.length && !next[next.length - 1]) next.pop();
    const previous = descriptions;
    setDescriptions(next);
    try {
      await editPost(tokenId, { mediaDescriptions: next });
      void queryClient.invalidateQueries({ queryKey: ['unified-feed'] });
      toast.success(_copy('altText.saved'));
    } catch {
      setDescriptions(previous);
      toast.error(_copy('altText.saveFailed'));
    }
  };

  if (loading) return <p className="text-sm text-zinc-400">{_copy("copy.0adcf927c8a1", { defaultValue: "Loading post images…" })}</p>;
  if (failed) return <button type="button" className="text-sm text-zinc-300" onClick={() => setAttempt(value => value + 1)}>{_copy("copy.868ffd193290", { defaultValue: "Could not load post images. Retry" })}</button>;
  if (!images.length) return null;
  const previews = buildFeedImageUrls(images) ?? [];
  return <section className="space-y-2">
    <h3 className="text-sm font-medium text-zinc-300">{_copy("copy.be7e2f201293", { defaultValue: "Images" })}</h3>
    <p className="text-xs text-zinc-400">{_copy("copy.0f0d5afa82cf", { defaultValue: "Adding or replacing images saves immediately. Your post keeps its link, views and comments." })}</p>
    {imageLimit === null ? <button type="button" disabled={busy || disabled} className="text-xs text-zinc-400" onClick={() => setAttempt(value => value + 1)}>{_copy("copy.f6a4983ea9c5", { defaultValue: "Image allowance unavailable. Retry" })}</button> :
      <p className="text-xs text-zinc-400">{_copy("copy.1034a88fc92e", { defaultValue: "{{value1}} / {{value2}} images · Based on your badge tier", value1: images.length, value2: imageLimit })}</p>}
    <input ref={addInput} type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,image/avif" className="hidden" onChange={event => {
      const files = Array.from(event.target.files ?? []);
      event.target.value = '';
      void add(files);
    }} />
    <button type="button" disabled={busy || disabled || imageLimit === null || images.length >= imageLimit}
      onClick={() => addInput.current?.click()} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white disabled:opacity-50">
      {busy && position.current === -1 ? _copy("copy.8a4d34ae97e4", { defaultValue: "Adding images…" }) : imageLimit !== null && images.length >= imageLimit ? _copy("copy.3c4add40558c", { defaultValue: "Badge image limit reached" }) : _copy("copy.89a8ac2bfcee", { defaultValue: "Add images" })}
    </button>
    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,image/avif" className="hidden" onChange={event => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (file) void replace(file);
    }} />
    <div className="grid grid-cols-2 gap-3">
      {previews.map((src, index) => <div key={index} className="relative">
        <button type="button" disabled={busy || disabled}
          onClick={() => { position.current = index; input.current?.click(); }}
          className="w-full overflow-hidden rounded-xl border border-white/10 bg-white/5 text-white disabled:opacity-50">
          <img src={src} alt={descriptions[index] || _copy("copy.5e0cb5ae157b", { defaultValue: "Image {{value1}}", value1: index + 1 })} className="h-28 w-full object-contain" />
          <span className="flex items-center justify-center gap-2 p-2 text-sm">
            {busy && position.current === index ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {busy && position.current === index ? _copy("copy.44207eb29645", { defaultValue: "Replacing…" }) : _copy("copy.cd9939b6aa1a", { defaultValue: "Replace image {{value1}}", value1: index + 1 })}
          </span>
        </button>
        <AltTextButton hasText={!!descriptions[index]} onClick={() => setAltIndex(index)} className="absolute right-2 top-2" />
      </div>)}
    </div>
    {altIndex !== null && (
      <AltTextDialog
        open
        onOpenChange={(open) => { if (!open) setAltIndex(null); }}
        kind="image"
        previewSrc={previews[altIndex]}
        initial={descriptions[altIndex]}
        onSave={(text) => { void saveDescription(altIndex, text); }}
      />
    )}
  </section>;
}
