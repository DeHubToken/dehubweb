import React, { useState } from 'react';
import { mediaImage, mediaImageSrcSet } from '@/lib/media-url';

// Every blog banner sits in the same 1200x630 frame as our share cards, so
// cards, related posts and the post hero all line up. Banners close to that
// shape fill the frame; very wide or very tall ones are shown whole over a
// blurred copy of themselves so their text is never cropped off.
const FRAME_RATIO = 40 / 21;
const FILL_TOLERANCE = 0.2;

interface BlogBannerProps {
  src: string;
  alt: string;
  width: number;
  widths: number[];
  sizes: string;
  loading?: 'lazy' | 'eager';
  fetchPriority?: 'high' | 'low' | 'auto';
  className?: string;
  imgClassName?: string;
}

export const BlogBanner: React.FC<BlogBannerProps> = ({
  src,
  alt,
  width,
  widths,
  sizes,
  loading = 'lazy',
  fetchPriority,
  className = '',
  imgClassName = '',
}) => {
  const [fit, setFit] = useState<'cover' | 'contain'>('cover');
  const url = mediaImage(src, { width });
  const srcSet = mediaImageSrcSet(src, widths);

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    if (!naturalWidth || !naturalHeight) return;
    const off = Math.abs(naturalWidth / naturalHeight / FRAME_RATIO - 1);
    setFit(off > FILL_TOLERANCE ? 'contain' : 'cover');
  };

  return (
    <div className={`relative w-full aspect-[40/21] overflow-hidden bg-muted ${className}`}>
      {fit === 'contain' && (
        <img
          src={url}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl opacity-60"
        />
      )}
      <img
        src={url}
        srcSet={srcSet}
        sizes={sizes}
        alt={alt}
        width={1200}
        height={630}
        loading={loading}
        decoding="async"
        fetchPriority={fetchPriority}
        onLoad={handleLoad}
        className={`absolute inset-0 h-full w-full ${fit === 'contain' ? 'object-contain' : 'object-cover'} ${imgClassName}`}
      />
    </div>
  );
};
