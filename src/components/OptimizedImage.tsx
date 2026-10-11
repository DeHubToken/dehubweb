import { useTranslation as _useCopy } from 'react-i18next';

import React, { useState, useRef, useEffect } from 'react';

interface OptimizedImageProps {
  src: string;
  alt: string;
  className?: string;
  loading?: 'lazy' | 'eager';
  srcSet?: string;
  sizes?: string;
  width?: number;
  height?: number;
  /** 'high' for the page's LCP image, so it is not queued behind scripts and icons. */
  fetchPriority?: 'high' | 'low' | 'auto';
}

export const OptimizedImage: React.FC<OptimizedImageProps> = ({
  src,
  alt,
  className = '',
  loading = 'lazy',
  srcSet,
  sizes,
  width,
  height,
  fetchPriority,
}) => {
  const { t: _copy } = _useCopy();
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(loading === 'eager');
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (loading === 'eager') {
      setIsInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { 
        threshold: 0.1,
        rootMargin: '50px' // Start loading 50px before entering viewport
      }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => observer.disconnect();
  }, [loading]);

  const handleLoad = () => {
    setIsLoaded(true);
  };

  const handleError = () => {
    setHasError(true);
    setIsLoaded(true);
  };

  return (
    <div className={`relative ${className}`}>
      {!isLoaded && !hasError && (
        <div className="absolute inset-0 bg-sky-blue/10 animate-pulse rounded"></div>
      )}
      {hasError ? (
        <div className="flex items-center justify-center bg-sky-blue/5 text-royal-blue/60 text-sm p-4 rounded">{_copy("copy.d4719771b47b", { defaultValue: "Image failed to load" })}</div>
      ) : (
        <img
          ref={imgRef}
          src={isInView ? src : undefined}
          srcSet={isInView ? srcSet : undefined}
          sizes={sizes}
          width={width}
          height={height}
          alt={alt}
          loading={loading}
          fetchPriority={fetchPriority}
          onLoad={handleLoad}
          onError={handleError}
          decoding="async"
          className={`transition-opacity duration-300 ${
            isLoaded ? 'opacity-100' : 'opacity-0'
          } ${className}`}
          style={{
            maxWidth: '100%',
            height: 'auto'
          }}
        />
      )}
    </div>
  );
};
