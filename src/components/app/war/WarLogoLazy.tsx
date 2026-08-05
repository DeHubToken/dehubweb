import { lazy, Suspense } from 'react';

/**
 * Theme-gated entry point for the War hologram mark.
 * ==================================================
 * Both call sites (DesktopSidebar, MobileHeader) already render the hologram
 * only when the War theme is active — but they imported WarLogo *statically*,
 * and a static import is a bundling decision, not a rendering one. That pulled
 * `three` into the entry chunk's import graph for every visitor on every theme:
 * Vite emitted an eager `<link rel="modulepreload" href="vendor-three">` into
 * index.html, so ~136 KB brotli / ~522 KB parsed of WebGL shipped before first
 * paint to people who would never see a hologram.
 *
 * vite.config.ts already carries a manualChunks comment warning about exactly
 * this failure mode ("making the entry chunk statically depend on it and
 * download three.js at boot"), and every other three.js consumer — the theme
 * backgrounds, the war preloader — is behind React.lazy. The logo was the one
 * that got missed, because it looks like a plain <img> at the call site.
 *
 * The Suspense fallback is the untouched mark, which is also what WarLogo
 * itself renders on its reduced-motion and WebGL-failure paths. So the logo is
 * never missing while the chunk loads — it just isn't holographic yet.
 */
const WarLogoGL = lazy(() =>
  import('./WarLogo').then((m) => ({ default: m.WarLogo })),
);

interface WarLogoProps {
  /** Source of the mark. Its alpha channel IS the hologram. */
  src: string;
  alt: string;
  className?: string;
}

export function WarLogo({ src, alt, className }: WarLogoProps) {
  return (
    <Suspense
      fallback={<img src={src} alt={alt} className={className} decoding="async" />}
    >
      <WarLogoGL src={src} alt={alt} className={className} />
    </Suspense>
  );
}

export default WarLogo;
