import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { FreeAsset } from "@/lib/editor/freeAssets";

export function FreeAssetPreview({ asset, onClose }: { asset: FreeAsset; onClose: () => void }) {
  const media = useRef<HTMLMediaElement | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const element = media.current;
    const pause = () => { if (document.hidden) element?.pause(); };
    document.addEventListener("visibilitychange", pause);
    return () => {
      document.removeEventListener("visibilitychange", pause);
      if (element) { element.pause(); element.removeAttribute("src"); element.load(); }
    };
  }, [asset, failed]);
  return <section aria-label={`Preview ${asset.title}`} className="mb-3 overflow-hidden rounded-xl border border-white/20 bg-black">
    <div className="flex items-center gap-2 px-3 py-2">
      <p className="min-w-0 flex-1 truncate text-xs text-white">{asset.title}</p>
      <button type="button" aria-label="Close preview" onClick={onClose} className="rounded p-1 text-white/60 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
    </div>
    {failed ? <p className="px-3 pb-3 text-xs text-white/60">This preview could not load. Try another result.</p>
      : asset.mimeType.startsWith("video/") ? <video ref={element => { media.current = element; }} src={asset.downloadUrl} controls autoPlay playsInline preload="metadata" onError={() => setFailed(true)} className="max-h-64 w-full" />
      : asset.mimeType.startsWith("audio/") ? <audio ref={element => { media.current = element; }} src={asset.previewUrl || asset.downloadUrl} controls autoPlay preload="metadata" onError={() => setFailed(true)} className="w-full px-3 pb-3" />
      : <img src={asset.downloadUrl} alt={asset.title} onError={() => setFailed(true)} className="max-h-64 w-full object-contain" />}
  </section>;
}
