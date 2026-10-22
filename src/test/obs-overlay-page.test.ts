import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

/**
 * The OBS browser source is composited over somebody's live broadcast, so the
 * two ways it can go wrong are both visible on air: something paints behind
 * the widgets (a black frame on every source refresh, the app's theme canvas),
 * or the app's chrome renders around them. These pin the two things that
 * prevent that, because neither fails any other check when it breaks.
 */

const indexHtml = readFileSync('index.html', 'utf-8');
const app = readFileSync('src/App.tsx', 'utf-8');

describe('OBS overlay page', () => {
  it('is flagged and made transparent by the head script, before any bundle runs', () => {
    expect(indexHtml).toContain("location.pathname.indexOf('/overlay/') === 0");
    expect(indexHtml).toContain("d.dataset.obsOverlay = 'on'");
    expect(indexHtml).toContain("d.style.setProperty('--boot-bg', 'transparent')");
    // A dark color-scheme makes the browser paint the canvas itself.
    expect(indexHtml).toContain("d.style.colorScheme = 'normal'");
  });

  it('keeps the boot skeleton and toasts out of the picture', () => {
    expect(indexHtml).toMatch(/html\[data-obs-overlay\][^{]*#root\s*\{\s*background:\s*transparent !important/);
    expect(indexHtml).toMatch(/html\[data-obs-overlay\] \.bskel/);
    expect(indexHtml).toMatch(/html\[data-obs-overlay\] \[data-sonner-toaster\]/);
  });

  it('is routed outside the app shell, wallet stack and theme canvas', () => {
    // Beside /r/:code in the top-level Routes, ahead of the catch-all that
    // mounts the wallet stack. The app shell has a `path="*"` of its own
    // further up the file, so the wallet element is the marker, not that.
    const overlayRoute = app.indexOf('path="/overlay/:token"');
    const referral = app.indexOf('path="/r/:code"');
    const walletShell = app.indexOf('<WalletProviders>');
    expect(referral).toBeGreaterThan(-1);
    expect(walletShell).toBeGreaterThan(-1);
    expect(overlayRoute).toBeGreaterThan(referral);
    expect(overlayRoute).toBeLessThan(walletShell);
  });
});
