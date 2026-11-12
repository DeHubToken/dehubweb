/**
 * Desktop install ("Install Riftn")
 * =================================
 * riftn.com already ships everything a browser needs to install it as an app
 * (public/manifest.json, the icons, public/sw.js). Chrome and Edge announce
 * that with a `beforeinstallprompt` event, and calling `prompt()` on it opens
 * their native install dialog. The event fires once, early, and is gone if
 * nobody is listening, so this module starts listening at boot (imported from
 * main.tsx) and holds on to it for whatever button asks later.
 *
 * Safari and Firefox never fire the event: callers fall back to `installHow()`
 * for a one-line instruction instead.
 *
 * @module lib/pwa-install
 */

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallState = 'installed' | 'ready' | 'manual';

let deferred: InstallPromptEvent | null = null;
let justInstalled = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Keep the browser's own mini-bar out of the way; our button asks instead.
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    justInstalled = true;
    notify();
  });
}

/** True when this page is already running inside the installed app window. */
export function isRunningInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  const mm = window.matchMedia?.bind(window);
  return Boolean(
    mm?.('(display-mode: standalone)').matches ||
      mm?.('(display-mode: window-controls-overlay)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone,
  );
}

export function getInstallState(): InstallState {
  if (justInstalled || isRunningInstalled()) return 'installed';
  return deferred ? 'ready' : 'manual';
}

export function subscribeInstall(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Opens the browser's install dialog. Resolves true when the person accepted. */
export async function promptInstall(): Promise<boolean> {
  const ev = deferred;
  if (!ev) return false;
  // A prompt event can only be used once.
  deferred = null;
  notify();
  try {
    await ev.prompt();
    const { outcome } = await ev.userChoice;
    if (outcome === 'accepted') {
      justInstalled = true;
      notify();
      return true;
    }
  } catch {
    /* the browser refused (not a user gesture, already open) */
  }
  return false;
}

export type InstallHow = 'safari' | 'firefox' | 'chromium';

/** Which manual instruction fits this browser when there is no prompt to show. */
export function installHow(ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent): InstallHow {
  if (/firefox|fxios/i.test(ua)) return 'firefox';
  if (/safari/i.test(ua) && !/chrome|chromium|crios|edg|opr|brave/i.test(ua)) return 'safari';
  return 'chromium';
}

/** Phones and tablets get the Android/iPhone view of the download page. */
export function isDesktopDevice(ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent): boolean {
  if (/android|iphone|ipad|ipod|mobile/i.test(ua)) return false;
  // iPadOS reports itself as a Mac; a touch screen gives it away.
  if (/macintosh/i.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1) return false;
  return true;
}
