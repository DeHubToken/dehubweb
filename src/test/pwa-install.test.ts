import { describe, expect, it } from 'vitest';
import { getInstallState, installHow, isDesktopDevice, promptInstall } from '@/lib/pwa-install';

const CHROME_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const EDGE_WIN = `${CHROME_WIN} Edg/131.0.0.0`;
const SAFARI_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const FIREFOX = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-S926B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

describe('pwa-install', () => {
  it('picks the right manual instruction per browser', () => {
    expect(installHow(CHROME_WIN)).toBe('chromium');
    expect(installHow(EDGE_WIN)).toBe('chromium');
    expect(installHow(SAFARI_MAC)).toBe('safari');
    expect(installHow(FIREFOX)).toBe('firefox');
  });

  it('sends computers to the desktop view and phones to the Android view', () => {
    expect(isDesktopDevice(CHROME_WIN)).toBe(true);
    expect(isDesktopDevice(SAFARI_MAC)).toBe(true);
    expect(isDesktopDevice(ANDROID)).toBe(false);
    expect(isDesktopDevice(IPHONE)).toBe(false);
  });

  it('holds the browser offer and uses it once', async () => {
    expect(getInstallState()).toBe('manual');
    let prompted = 0;
    const ev = Object.assign(new Event('beforeinstallprompt'), {
      prompt: async () => { prompted += 1; },
      userChoice: Promise.resolve({ outcome: 'accepted' as const }),
    });
    window.dispatchEvent(ev);
    expect(getInstallState()).toBe('ready');
    expect(await promptInstall()).toBe(true);
    expect(prompted).toBe(1);
    expect(getInstallState()).toBe('installed');
    expect(await promptInstall()).toBe(false);
  });
});
