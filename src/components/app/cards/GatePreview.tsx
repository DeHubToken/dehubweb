import { useState } from 'react';
import { cdnImageSrcSet } from '@/lib/media-url';

/** A missing or failed cover must leave the access panel intact. */
export function GatePreview({ src, className }: { src?: string; className?: string }) {
  const [failedSrc, setFailedSrc] = useState<string>();
  if (!src || failedSrc === src) return <div aria-hidden="true" className={`bg-zinc-900 ${className || ''}`} />;
  return <img src={src} srcSet={cdnImageSrcSet(src, [320, 480, 640, 960, 1280])}
    sizes="(min-width: 1024px) 600px, 100vw" decoding="async" alt="" aria-hidden="true"
    className={className} loading="lazy" onError={() => setFailedSrc(src)} />;
}
