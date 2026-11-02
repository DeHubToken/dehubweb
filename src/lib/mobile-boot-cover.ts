import mark from '@/assets/dehub-logo-compact.png';
import { isHomeFeedRoute } from './home-routes';

let cover: HTMLDivElement | null = null;
let expiry: ReturnType<typeof setTimeout> | undefined;

function removeCover() {
  clearTimeout(expiry);
  cover?.remove();
  cover = null;
}

/** Called while initial render dependencies are pending, never by a route. */
export function beginMobileBootWait(): () => void {
  if (!window.matchMedia('(max-width: 767px)').matches || !isHomeFeedRoute(location.pathname)) return () => {};
  let signedIn = false;
  try {
    const token = localStorage.getItem('dehub_token');
    const expires = Number(localStorage.getItem('dehub_token_expires_at') || 0);
    signedIn = !!token && (!expires || Date.now() < expires);
    for (let i = 0; !signedIn && i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && /^sb-.*-auth-token/.test(key) && localStorage.getItem(key)) signedIn = true;
    }
  } catch { return () => {}; }
  if (!signedIn) return () => {};
  const timer = setTimeout(() => {
    cover = document.createElement('div');
    cover.dataset.mobileBootCover = '';
    cover.setAttribute('aria-hidden', 'true');
    Object.assign(cover.style, { position: 'fixed', inset: '0', zIndex: '10000', background: 'var(--boot-bg, #000)', display: 'grid', placeItems: 'center' });
    const image = document.createElement('img');
    image.src = mark;
    image.alt = '';
    const light = document.documentElement.dataset.theme === 'light' || document.documentElement.dataset.systemTone === 'light';
    Object.assign(image.style, { width: '120px', height: `${120 * 36 / 42}px`, objectFit: 'contain', filter: light ? 'invert(1)' : 'none' });
    cover.append(image);
    document.body.append(cover);
    expiry = setTimeout(removeCover, 8000);
  }, 400);
  return () => {
    // Fast loads cancel this before a logo ever appears. Readiness never starts
    // an animation: only an already-visible cover may hand off to the header.
    clearTimeout(timer);
    if (cover) { clearTimeout(expiry); expiry = setTimeout(removeCover, 1500); }
  };
}

export function takeMobileBootCover(): boolean {
  const wasVisible = !!cover?.isConnected;
  removeCover();
  return wasVisible;
}
