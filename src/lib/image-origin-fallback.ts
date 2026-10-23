import { cdnImageSource, markImageTransformsDown } from './media-url';

const TRANSFORM_PREFIX = 'https://dehub.io/cdn-cgi/image/';
/** One failure can be a single missing file; this many means dehub.io itself is out of reach. */
const FAILURES_BEFORE_SWITCH = 3;

const PROBE_TIMEOUT_MS = 6000;

let failures = 0;

function loadOriginal(img: HTMLImageElement): void {
  const current = img.currentSrc || img.src;
  if (!current.startsWith(TRANSFORM_PREFIX)) return;
  const original = cdnImageSource(current);
  if (!original || original === current) return;
  // srcset wins over src, so it has to go or the browser keeps asking for a transform.
  img.removeAttribute('srcset');
  img.removeAttribute('sizes');
  img.src = original;
}

/**
 * Any feed, avatar or card image that fails through the Cloudflare transform
 * is retried from the original on the Spaces CDN. A capturing listener on the
 * document covers every <img> without touching each call site. After a few
 * failures every image still pointed at a transform is switched at once, and
 * cdnImage() stops building transform URLs for the session.
 */
export function installImageOriginFallback(): void {
  if (typeof document === 'undefined') return;
  const switchAll = () => {
    markImageTransformsDown();
    document.querySelectorAll<HTMLImageElement>('img').forEach(loadOriginal);
  };
  document.addEventListener('error', (event) => {
    const img = event.target;
    if (!(img instanceof HTMLImageElement)) return;
    if (!(img.currentSrc || img.src).startsWith(TRANSFORM_PREFIX)) return;
    loadOriginal(img);
    failures += 1;
    if (failures === FAILURES_BEFORE_SWITCH) switchAll();
  }, true);
  // A blocked connection can take far longer than this to error on its own.
  // The service worker never answers /cdn-cgi/, so this reaches the network.
  if (typeof fetch !== 'function' || typeof AbortController === 'undefined') return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  fetch('https://dehub.io/cdn-cgi/trace', { cache: 'no-store', mode: 'no-cors', signal: controller.signal })
    .then(() => undefined, switchAll)
    .finally(() => clearTimeout(timer));
}
